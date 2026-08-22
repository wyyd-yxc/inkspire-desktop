<script setup lang="ts">
/**
 * 正文编辑器：TipTap 封装 + AI 写作集成。
 * - 标题行内编辑；正文区（网文排版）
 * - AI 三入口：状态栏「续写」、划词浮条（润色/扩写/改写）、标题栏「整章润色」
 * - 生成结果经底部 AiWritingPanel 预览：流式显示 → 采纳插入（续写=光标处、划词=替换选区、整章=全文替换）
 * - 父组件以 :key=章节id 重建本组件（undo 历史隔离），AI 面板状态随组件重置
 */
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { StreamSession } from '../services/ai'
import type { SelectionAction } from '../services/aiWriting'
import { buildChapterPolishMessages, buildContinueMessages, buildSelectionMessages, generateWriting } from '../services/aiWriting'
import { useToast } from '@/composables/useToast'
import AiWritingPanel from '@/components/AiWritingPanel.vue'

const props = defineProps<{
  chapter: Chapter | null
  book: Pick<Book, 'title' | 'genre' | 'description'> | null
}>()

const emit = defineEmits<{
  'content-change': [html: string, wordCount: number]
  'title-change': [title: string]
  'save-now': []
}>()

const toast = useToast()
const saveState = ref<'saved' | 'dirty' | 'saving'>('saved')
const titleText = ref(props.chapter?.title ?? '')

/** 纯文本字数（去所有空白字符，符合网文计数习惯） */
function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

const editor = useEditor({
  // 每章全新编辑器实例（父组件 :key 控制），切换章节不残留 undo 历史
  content: props.chapter?.content || '',
  extensions: [StarterKit],
  editorProps: {
    attributes: {
      class: 'prose-editor outline-none min-h-full px-14 py-10 text-[15px] leading-8'
    },
    handleKeyDown: (_view, event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        emit('save-now')
        return true
      }
      return false
    }
  },
  onUpdate: ({ editor: ed }) => {
    saveState.value = 'dirty'
    emit('content-change', ed.getHTML(), countWords(ed.getText()))
  },
  onSelectionUpdate: ({ editor: ed }) => {
    updateSelectionBar(ed)
  }
})

// ---------------- AI 写作编排 ----------------

type PanelKind = 'continue' | SelectionAction | 'chapter-polish'

const panel = ref<InstanceType<typeof AiWritingPanel> | null>(null)
const panelVisible = ref(false)
const panelKind = ref<PanelKind>('continue')
let activeSession: StreamSession | null = null
let busy = false
/** 生成序号：stop 时递增使尚未启动的 nextTick 回调失效（防「点续写后立刻停止仍会发起生成」竞态） */
let generationSeq = 0

/** 划词目标（发起划词操作时的选区快照） */
let selectionTarget: { from: number; to: number; text: string } | null = null

/** 组装写作上下文（前文 = 当前正文纯文本） */
function writingContext() {
  return {
    book: props.book,
    chapterTitle: props.chapter?.title ?? '',
    contextTail: editor.value?.getText() ?? ''
  }
}

/** 发起一次生成（流式推给面板） */
async function runGeneration(kind: PanelKind): Promise<void> {
  if (busy) {
    toast.info('正在生成中，请先停止或等待完成')
    return
  }
  if (!editor.value) return
  busy = true
  const mySeq = ++generationSeq
  panelKind.value = kind
  panelVisible.value = true
  // 等面板挂载并重置完成。用 nextTick（微任务）而非 requestAnimationFrame：
  // 窗口后台/失焦时 rAF 会被系统节流冻结，导致生成流程永不启动
  void nextTick().then(() => {
    if (mySeq !== generationSeq) return // 等待期间已被停止，放弃本次发起
    void (async () => {
      try {
        const messages =
          kind === 'continue'
            ? buildContinueMessages(writingContext())
            : kind === 'chapter-polish'
              ? buildChapterPolishMessages(writingContext(), editor.value!.getText())
              : buildSelectionMessages(
                  writingContext(),
                  selectionTarget?.text ?? '',
                  kind,
                )
        const { session } = await generateWriting(messages, {
          onChunk: (t) => {
            panel.value?.append(t)
          },
          onReasoning: () => {
            /* 推理链不进预览，仅正文 */
          },
          onDone: () => {
            panel.value?.finish()
          },
          onError: (m) => {
            panel.value?.fail()
            toast.error(m)
          }
        })
        if (mySeq !== generationSeq) {
          // 请求建立期间已被停止：立即中止，不挂到 activeSession
          session.abort()
          return
        }
        activeSession = session
      } catch (err) {
        panel.value?.fail()
        toast.error(err instanceof Error ? err.message : '生成失败')
      } finally {
        if (mySeq === generationSeq) busy = false
      }
    })()
  })
}

/** 停止生成 */
function stopGeneration(): void {
  generationSeq++ // 使挂起的 nextTick 回调与刚建立的会话失效
  activeSession?.abort()
  activeSession = null
  busy = false
  panel.value?.finish()
}

/** 重写：关面板重新发起同 kind */
function retryGeneration(): void {
  stopGeneration()
  void runGeneration(panelKind.value)
}

/** 采纳：按 kind 插入正文 */
function acceptGeneration(text: string): void {
  if (!editor.value || !text) return
  const ed = editor.value
  if (panelKind.value === 'continue') {
    ed.chain().focus('end').insertContent(text).run()
  } else if (panelKind.value === 'chapter-polish') {
    ed.commands.setContent(text, { emitUpdate: true })
  } else if (selectionTarget) {
    const { from, to, text: snapshot } = selectionTarget
    // 防位置失效：生成期间正文可能被编辑，ProseMirror 位置随内容漂移。
    // 采纳前核对快照位置上的文字是否仍是原文字，不一致则拒绝替换。
    const current = ed.state.doc.textBetween(from, to, '\n')
    if (current !== snapshot) {
      toast.error('生成期间正文已变化，无法定位原选区。内容保留在面板中，可手动复制')
      selectionTarget = null
      return
    }
    ed.chain().focus().deleteRange({ from, to }).insertContentAt(from, text).run()
    selectionTarget = null
  }
  closePanel()
  toast.success('已插入正文，记得保存')
}

function closePanel(): void {
  stopGeneration()
  panelVisible.value = false
  selectionTarget = null
}

onBeforeUnmount(() => stopGeneration())

// ---------------- 划词浮条 ----------------

const selectionBar = reactive({ visible: false, top: 0, left: 0 })
const rootEl = ref<HTMLElement | null>(null)
/** 正文滚动容器：浮条定位需叠加其滚动偏移；滚动时隐藏浮条防错位 */
const scrollBodyEl = ref<HTMLElement | null>(null)

/** 滚动时隐藏浮条（选区视觉位置随滚动变化，重新选择时再显示） */
function onBodyScroll(): void {
  selectionBar.visible = false
}

/** 选区变化：有非空选区时把浮条定位到选区上方 */
function updateSelectionBar(ed: NonNullable<ReturnType<typeof useEditor>['value']>): void {
  const { from, to, empty } = ed.state.selection
  if (empty || to - from < 2) {
    selectionBar.visible = false
    return
  }
  const text = ed.state.doc.textBetween(from, to, '\n')
  if (!text.trim()) {
    selectionBar.visible = false
    return
  }
  // 选区视口坐标 → rootEl 内容坐标：差值需叠加滚动容器的已滚动距离
  //（absolute 元素不随内容滚动，而 coordsAtPos 给的是当前视口位置）
  const start = ed.view.coordsAtPos(from)
  const container = rootEl.value?.getBoundingClientRect()
  if (!container) return
  const scrollTop = scrollBodyEl.value?.scrollTop ?? 0
  selectionBar.visible = true
  selectionBar.top = start.top - container.top + scrollTop - 42
  selectionBar.left = Math.max(8, start.left - container.left)
}

/** 划词操作入口：快照选区后发起生成 */
function startSelectionAction(action: SelectionAction): void {
  const ed = editor.value
  if (!ed) return
  const { from, to } = ed.state.selection
  const text = ed.state.doc.textBetween(from, to, '\n')
  if (!text.trim()) return
  selectionTarget = { from, to, text }
  selectionBar.visible = false
  void runGeneration(action)
}

// ---------------- 暴露与杂项 ----------------

const wordCount = computed(() =>
  editor.value ? countWords(editor.value.getText()) : countWords(plainText(props.chapter?.content || ''))
)

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function submitTitle(): void {
  const t = titleText.value.trim()
  if (t && t !== props.chapter?.title) emit('title-change', t)
  else titleText.value = props.chapter?.title ?? ''
}

function getHTML(): string {
  return editor.value?.getHTML() ?? ''
}

defineExpose({
  getHTML,
  setSaveState: (s: 'saved' | 'dirty' | 'saving') => (saveState.value = s)
})

const saveLabel = computed(
  () => ({ saved: '已保存', dirty: '未保存…', saving: '保存中…' })[saveState.value]
)
</script>

<template>
  <div ref="rootEl" class="relative flex h-full min-w-0 flex-1 flex-col bg-surface">
    <template v-if="chapter">
      <!-- 标题栏 -->
      <div class="flex items-center gap-3 border-b border-ink-border/60 px-14 py-5">
        <input
          v-model="titleText"
          class="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none placeholder:text-ink-text-muted"
          placeholder="章节标题"
          @blur="submitTitle"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
        />
        <button
          class="shrink-0 rounded-full border border-ink-border px-3 py-1 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
          title="保持情节不变，逐段打磨文笔"
          @click="runGeneration('chapter-polish')"
        >✧ 整章润色</button>
      </div>

      <!-- 正文 -->
      <div ref="scrollBodyEl" class="min-h-0 flex-1 overflow-y-auto" @scroll="onBodyScroll">
        <EditorContent v-if="editor" :editor="editor" class="prose-editor-wrapper" />
      </div>

      <!-- AI 预览面板（正文与状态栏之间） -->
      <AiWritingPanel
        ref="panel"
        :visible="panelVisible"
        :kind="panelKind"
        @accept="acceptGeneration"
        @retry="retryGeneration"
        @stop="stopGeneration"
        @close="closePanel"
      />

      <!-- 状态栏 -->
      <div class="flex items-center justify-between border-t border-ink-border/60 px-14 py-2 text-xs text-ink-text-muted">
        <span :class="saveState === 'saved' ? 'text-ink-success' : ''">{{ saveLabel }}</span>
        <div class="flex items-center gap-4">
          <button
            class="flex items-center gap-1 rounded-full px-2 py-0.5 text-ink-primary transition-colors hover:bg-ink-primary-soft"
            title="AI 从前文自然续写（流式预览后采纳）"
            @click="runGeneration('continue')"
          >✦ AI 续写</button>
          <span>{{ wordCount.toLocaleString('zh-CN') }} 字 · Ctrl+S 立即保存</span>
        </div>
      </div>

      <!-- 划词浮条 -->
      <div
        v-if="selectionBar.visible"
        class="absolute z-20 flex items-center gap-0.5 rounded-lg border border-ink-border bg-surface px-1 py-1 shadow-card"
        :style="{ top: `${selectionBar.top}px`, left: `${selectionBar.left}px` }"
        @mousedown.prevent
      >
        <button class="rounded-md px-2 py-1 text-xs text-ink-text-secondary transition-colors hover:bg-ink-primary-soft hover:text-ink-primary" @click="startSelectionAction('polish')">润色</button>
        <button class="rounded-md px-2 py-1 text-xs text-ink-text-secondary transition-colors hover:bg-ink-primary-soft hover:text-ink-primary" @click="startSelectionAction('expand')">扩写</button>
        <button class="rounded-md px-2 py-1 text-xs text-ink-text-secondary transition-colors hover:bg-ink-primary-soft hover:text-ink-primary" @click="startSelectionAction('rewrite')">改写</button>
      </div>
    </template>

    <div v-else class="flex flex-1 items-center justify-center text-ink-text-muted">
      选择或新建一个章节开始写作
    </div>
  </div>
</template>

<style scoped>
.prose-editor-wrapper :deep(.tiptap) {
  min-height: 100%;
}
.prose-editor-wrapper :deep(.tiptap p) {
  margin: 0 0 0.9em;
  text-indent: 2em;
}
.prose-editor-wrapper :deep(.tiptap p:first-child) {
  margin-top: 0;
}
</style>
