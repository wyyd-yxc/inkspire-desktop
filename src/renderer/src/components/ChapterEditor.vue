<script setup lang="ts">
/**
 * 正文编辑器：TipTap 封装。
 * - 标题行内编辑（失焦/回车提交）
 * - 正文区（StarterKit：段落/加粗/斜体等基础能力，网文写作以纯文本段落为主）
 * - 底部状态栏：字数（纯文本去空白）与保存状态
 * - 内容变更经防抖后由父组件持久化；Ctrl+S 立即保存
 */
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { computed, ref } from 'vue'
import type { Chapter } from '../../../shared/chapter.types'

const props = defineProps<{ chapter: Chapter | null }>()

const emit = defineEmits<{
  /** content 变更（HTML）+ 实时字数 */
  'content-change': [html: string, wordCount: number]
  'title-change': [title: string]
  'save-now': []
}>()

const saveState = ref<'saved' | 'dirty' | 'saving'>('saved')

const titleText = ref(props.chapter?.title ?? '')

/** 纯文本字数（去所有空白字符，符合网文计数习惯） */
function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

const editor = useEditor({
  // 父组件以 :key=章节id 强制重建本组件，因此每章都是全新编辑器实例——
  // 这样切换章节不会残留上一章的 undo 历史（避免 Ctrl+Z 撤销出别章内容）
  content: props.chapter?.content || '',
  extensions: [StarterKit],
  editorProps: {
    attributes: {
      class: 'prose-editor outline-none min-h-full px-14 py-10 text-[15px] leading-8'
    },
    handleKeyDown: (_view, event) => {
      // Ctrl/Cmd + S 立即保存（编辑区内；全局兜底在 WorkspaceView）
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
  }
})

const wordCount = computed(() =>
  editor.value ? countWords(editor.value.getText()) : countWords(plainText(props.chapter?.content || ''))
)

/** HTML → 纯文本（用于编辑器未就绪时的初始字数） */
function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function submitTitle(): void {
  const t = titleText.value.trim()
  if (t && t !== props.chapter?.title) emit('title-change', t)
  else titleText.value = props.chapter?.title ?? ''
}

/** 供父组件查询当前编辑器内容 */
function getHTML(): string {
  return editor.value?.getHTML() ?? ''
}

defineExpose({ getHTML, setSaveState: (s: 'saved' | 'dirty' | 'saving') => (saveState.value = s) })

const saveLabel = computed(
  () =>
    ({ saved: '已保存', dirty: '未保存…', saving: '保存中…' })[saveState.value]
)
</script>

<template>
  <div class="flex h-full min-w-0 flex-1 flex-col bg-surface">
    <template v-if="chapter">
      <!-- 标题栏 -->
      <div class="border-b border-ink-border/60 px-14 py-5">
        <input
          v-model="titleText"
          class="w-full bg-transparent text-xl font-bold outline-none placeholder:text-ink-text-muted"
          placeholder="章节标题"
          @blur="submitTitle"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>

      <!-- 正文 -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        <EditorContent v-if="editor" :editor="editor" class="prose-editor-wrapper" />
      </div>

      <!-- 状态栏 -->
      <div class="flex items-center justify-between border-t border-ink-border/60 px-14 py-2 text-xs text-ink-text-muted">
        <span :class="saveState === 'saved' ? 'text-ink-success' : ''">{{ saveLabel }}</span>
        <span>{{ wordCount.toLocaleString('zh-CN') }} 字 · Ctrl+S 立即保存</span>
      </div>
    </template>

    <div v-else class="flex flex-1 items-center justify-center text-ink-text-muted">
      选择或新建一个章节开始写作
    </div>
  </div>
</template>

<style scoped>
/* 编辑器排版：段落间距与首行缩进贴近网文阅读习惯 */
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
