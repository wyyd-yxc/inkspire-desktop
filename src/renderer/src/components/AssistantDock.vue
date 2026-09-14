<script setup lang="ts">
/**
 * 写作助手浮球+聊天面板（v1 仅写作台）。
 * 上下文感知：自动携带当前章节与选区；@召唤设定集词条；对话持久化；流式回复。
 * 浮球支持拖动并记忆位置（清偿 M10.5 黑盒债：定死右下角会遮挡 AI 采纳条）。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { chatStream } from '../services/ai'
import { resolveProfileForSlot } from '../services/agentSlots'
import { lenientParse } from '../services/jsonRepair'

const props = defineProps<{
  bookId: string
  book: Pick<Book, 'title' | 'genre' | 'description'> | null
  chapterTitle: string
  chapterContent: string
  selectionText: string
}>()

const toast = useToast()
const expanded = ref(false)
const messages = ref<Array<{ id: string; role: 'user' | 'assistant'; content: string; pending?: boolean }>>([])
const input = ref('')
const isBusy = ref(false)
const listEl = ref<HTMLElement | null>(null)
let currentSession: { abort: () => void } | null = null

// @ 召唤
const wikiEntries = ref<WikiEntry[]>([])
const showPicker = ref(false)
const pickerFilter = ref('')
const pendingAttachments = ref<WikiEntry[]>([])

const pickerList = computed(() => {
  const kw = pickerFilter.value.trim()
  if (!kw) return wikiEntries.value.slice(0, 8)
  return wikiEntries.value.filter((w) => w.name.includes(kw)).slice(0, 8)
})

const canSend = computed(() => input.value.trim() && !isBusy.value)

async function loadHistory(): Promise<void> {
  if (!isElectron) return
  try {
    const res = await window.api.assistant.list(props.bookId)
    if (res.ok) messages.value = res.data.map((m) => ({ id: m.id, role: m.role, content: m.content }))
  } catch (err) {
    console.warn('[Assistant] 历史加载失败:', err)
  }
}

async function loadWiki(): Promise<void> {
  if (!isElectron) return
  try {
    const res = await window.api.wiki.list(props.bookId)
    if (res.ok) wikiEntries.value = res.data
  } catch {
    /* 设定集加载失败不阻塞助手 */
  }
}

watch(
  () => props.bookId,
  () => {
    messages.value = []
    wikiEntries.value = []
    pendingAttachments.value = []
    void loadHistory()
    void loadWiki()
  },
  { immediate: true }
)

function toggle(): void {
  expanded.value = !expanded.value
  if (expanded.value) void loadHistory()
}

function scrollToBottom(): void {
  void nextTick(() => {
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/** 输入监听：末尾 @ 弹出词条选择器 */
function onInput(): void {
  if (input.value.endsWith('@')) {
    pickerFilter.value = ''
    showPicker.value = true
  }
}

/** 选择词条 → 加入待附加列表（输入框回退 @） */
function pickEntry(w: WikiEntry): void {
  if (input.value.endsWith('@')) input.value = input.value.slice(0, -1)
  if (!pendingAttachments.value.some((x) => x.id === w.id)) pendingAttachments.value.push(w)
  showPicker.value = false
}

function removeAttachment(id: string): void {
  pendingAttachments.value = pendingAttachments.value.filter((x) => x.id !== id)
}

/** 构建消息：system（助手角色+书籍信息+构思台设定）+ 历史 + 本轮 */
function buildMessages(userText: string) {
  const meta: string[] = []
  if (props.book?.title) meta.push(`书名《${props.book.title}》`)
  if (props.book?.genre) meta.push(`题材：${props.book.genre}`)
  if (props.book?.description) meta.push(`简介：${props.book.description.slice(0, 200)}`)

  // 构思台设定（从父级写作台状态继承不可行，直接读 DB——但为简化 v1，从 props.book 无构思台，
  // 改由 generateWriting 同源档案解析 + 本书上下文）
  const systemParts = [
    '你是「墨笺」，一位资深长篇小说创作顾问。回答创作相关问题时具体、可落地；闲聊时轻松自然。中文书写。',
    meta.length ? `当前作品信息——${meta.join('；')}。` : ''
  ]

  // 当前章节上下文
  if (props.chapterTitle) {
    const content = props.chapterContent.replace(/\s+/g, ' ').slice(0, 2000)
    systemParts.push(`用户正在写作「${props.chapterTitle}」章，已有正文（末尾部分）：${content || '（空）'}`)
  }

  // 历史（最近 20 条）
  const history = messages.value.slice(-20).map((m) => ({
    role: m.role,
    content: m.content
  }))

  // 本轮用户消息（附加选区/词条上下文，两者可叠加）
  let turn = userText
  const contextParts: string[] = []
  if (pendingAttachments.value.length) {
    const entryTexts = pendingAttachments.value
      .map((w) => `【设定·${w.name}】${w.summary}${w.content ? '：' + w.content.slice(0, 300) : ''}`)
      .join('\n')
    contextParts.push(`（参考以下设定回答）\n${entryTexts}`)
  }
  if (props.selectionText.trim()) {
    contextParts.push(`（针对以下选中文字）\n「${props.selectionText.slice(0, 500)}」`)
  }
  if (contextParts.length) {
    turn = contextParts.join('\n\n') + '\n\n' + userText
  }

  return [
    { role: 'system' as const, content: systemParts.filter(Boolean).join('\n') },
    ...history,
    { role: 'user' as const, content: turn }
  ]
}

/** 发送 */
async function send(): Promise<void> {
  const userText = input.value.trim()
  if (!userText || isBusy.value || !isElectron) return
  isBusy.value = true

  // 落库用户消息 + UI
  const saveUser = await window.api.assistant.create(props.bookId, 'user', userText)
  messages.value.push({
    id: saveUser.ok ? saveUser.data.id : `local-${Date.now()}`,
    role: 'user',
    content: userText
  })
  input.value = ''
  pendingAttachments.value = []
  showPicker.value = false
  scrollToBottom()

  // AI 流式回复（UI 占位 + 落库）
  const replyId = `stream-${Date.now()}`
  messages.value.push({ id: replyId, role: 'assistant', content: '', pending: true })
  scrollToBottom()

  const all = buildMessages(userText)

  try {
    const session = await chatStream(await resolveProfileForSlot('assistant'), all, {
      onChunk: (t) => {
        const m = messages.value.find((x) => x.id === replyId)
        if (m) m.content += t
        scrollToBottom()
      },
      onDone: async () => {
        const m = messages.value.find((x) => x.id === replyId)
        if (m?.content.trim()) {
          await window.api.assistant.create(props.bookId, 'assistant', m.content)
        }
        if (m) m.pending = false
        isBusy.value = false
        scrollToBottom()
      },
      onError: (msg) => {
        const m = messages.value.find((x) => x.id === replyId)
        if (m && !m.content) m.content = '（生成失败：' + msg + '）'
        isBusy.value = false
        toast.error(msg)
      }
    })
    currentSession = session
  } catch (err) {
    isBusy.value = false
    const m = messages.value.find((x) => x.id === replyId)
    if (m && !m.content) m.content = '（连接失败）'
    toast.error(err instanceof Error ? err.message : '连接失败')
  }
}

function stopGen(): void {
  currentSession?.abort()
  currentSession = null
  isBusy.value = false
}

async function clearConversation(): Promise<void> {
  const res = await window.api.assistant.clear(props.bookId)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  messages.value = []
  toast.success('对话已清空')
}

onMounted(() => {
  void loadHistory()
  void loadWiki()
})

// ---------------- 浮球拖拽与位置记忆 ----------------
const BALL_SIZE = 56
const BALL_POS_KEY = 'inkspire.assistant_ball_pos'
const ballPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const isDraggingBall = ref(false)
let ballDragStart: { px: number; py: number; bx: number; by: number; moved: boolean } | null = null
let suppressBallClick = false

/** 默认落位：右下角（与原 fixed bottom-6 right-6 等效） */
function defaultBallPos(): { x: number; y: number } {
  return { x: window.innerWidth - BALL_SIZE - 24, y: window.innerHeight - BALL_SIZE - 24 }
}

/** 位置钳制在窗口内（含载入旧位置时窗口已变小的情形） */
function clampBallPos(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(8, p.x), window.innerWidth - BALL_SIZE - 8),
    y: Math.min(Math.max(8, p.y), window.innerHeight - BALL_SIZE - 8)
  }
}

function loadBallPos(): void {
  try {
    const raw = localStorage.getItem(BALL_POS_KEY)
    ballPos.value = raw ? clampBallPos(JSON.parse(raw) as { x: number; y: number }) : defaultBallPos()
  } catch {
    ballPos.value = defaultBallPos()
  }
}

function onBallPointerDown(e: PointerEvent): void {
  ballDragStart = {
    px: e.clientX,
    py: e.clientY,
    bx: ballPos.value.x,
    by: ballPos.value.y,
    moved: false
  }
  // 捕获指针：移出按钮仍持续收到 move/up，拖拽不中断
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onBallPointerMove(e: PointerEvent): void {
  if (!ballDragStart) return
  const dx = e.clientX - ballDragStart.px
  const dy = e.clientY - ballDragStart.py
  // 位移阈值 4px 内不算拖拽，避免点击被误判（也防手抖微移）
  if (!ballDragStart.moved && Math.hypot(dx, dy) < 4) return
  ballDragStart.moved = true
  isDraggingBall.value = true
  ballPos.value = clampBallPos({ x: ballDragStart.bx + dx, y: ballDragStart.by + dy })
}

function onBallPointerUp(): void {
  if (ballDragStart?.moved) {
    suppressBallClick = true
    localStorage.setItem(BALL_POS_KEY, JSON.stringify(ballPos.value))
  }
  ballDragStart = null
  isDraggingBall.value = false
}

function onBallClick(): void {
  // 拖拽结束后的 click 不展开面板
  if (suppressBallClick) {
    suppressBallClick = false
    return
  }
  toggle()
}

loadBallPos()

// 组件卸载（切页面）时拖拽可能未收到 pointerup：重置残留状态，防止重进后首次点击被吞（r1 静态审查低-5）
onUnmounted(() => {
  ballDragStart = null
  isDraggingBall.value = false
  suppressBallClick = false
})
</script>

<template>
  <!-- 浮球（可拖动，位置记忆在 localStorage） -->
  <button
    v-if="!expanded"
    class="fixed z-40 flex h-14 w-14 touch-none items-center justify-center rounded-full bg-ink-primary text-on-primary shadow-lg hover:scale-110"
    :class="isDraggingBall ? 'cursor-grabbing transition-none select-none' : 'cursor-grab transition-transform'"
    :style="{ left: ballPos.x + 'px', top: ballPos.y + 'px' }"
    title="写作助手（可拖动到任意位置）"
    @pointerdown="onBallPointerDown"
    @pointermove="onBallPointerMove"
    @pointerup="onBallPointerUp"
    @click="onBallClick"
  >
    <svg viewBox="0 0 24 24" class="h-7 w-7" fill="currentColor">
      <path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.4 1.06 4.58 2.78 6.18-.16 1.14-.64 2.7-1.66 3.9a.5.5 0 0 0 .44.82c2.14-.16 3.94-.94 5.16-1.66 1.02.28 2.12.44 3.28.44 5.52 0 10-3.94 10-8.8S17.52 2 12 2z" />
    </svg>
  </button>

  <!-- 聊天面板 -->
  <teleport to="body">
    <div
      v-if="expanded"
      class="fixed bottom-0 right-0 z-50 flex h-full w-[400px] flex-col border-l border-ink-border bg-surface shadow-2xl"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-ink-border/60 px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary text-on-primary">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.4 1.06 4.58 2.78 6.18-.16 1.14-.64 2.7-1.66 3.9a.5.5 0 0 0 .44.82c2.14-.16 3.94-.94 5.16-1.66 1.02.28 2.12.44 3.28.44 5.52 0 10-3.94 10-8.8S17.52 2 12 2z" />
            </svg>
          </span>
          <span class="font-semibold">写作助手</span>
        </div>
        <div class="flex gap-2 text-xs">
          <button class="text-ink-text-muted hover:text-ink-danger" @click="clearConversation">清空</button>
          <button class="text-ink-text-muted hover:text-ink-text" @click="toggle">✕</button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div ref="listEl" class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div v-if="messages.length === 0" class="flex flex-col items-center gap-2 py-16 text-center">
          <p class="text-sm text-ink-text-secondary">我是写作助手，你的创作伙伴</p>
          <p class="text-xs leading-5 text-ink-text-muted">
            可以问我剧情构思、设定矛盾、写作技巧；<br />
            输入 @ 可引用设定集词条；<br />
            选中正文文字后提问会自动带上选区。
          </p>
        </div>
        <div
          v-for="m in messages"
          :key="m.id"
          class="mb-3 flex"
          :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[85%] rounded-[12px] px-3.5 py-2 text-sm leading-6"
            :class="
              m.role === 'user'
                ? 'rounded-br-sm bg-ink-primary text-on-primary'
                : 'rounded-bl-sm bg-paper text-ink-text'
            "
          >
            <p class="whitespace-pre-wrap break-words">{{ m.content || (m.pending ? '…' : '') }}</p>
          </div>
        </div>
      </div>

      <!-- @ 召唤选择器 -->
      <div v-if="showPicker" class="border-t border-ink-border/60 px-4 py-2">
        <p class="mb-1 text-xs text-ink-text-muted">选择设定集词条</p>
        <div class="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          <button
            v-for="w in pickerList"
            :key="w.id"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            @click="pickEntry(w)"
          >{{ w.name }}</button>
          <span v-if="pickerList.length === 0" class="px-1 text-xs text-ink-text-muted">设定集暂无词条</span>
        </div>
        <button class="mt-1 text-xs text-ink-text-muted hover:text-ink-danger" @click="showPicker = false">取消</button>
      </div>

      <!-- 待附加词条 chips -->
      <div v-if="pendingAttachments.length" class="flex flex-wrap gap-1 px-4 py-1.5">
        <span
          v-for="w in pendingAttachments"
          :key="w.id"
          class="flex items-center gap-0.5 rounded-full bg-ink-primary-soft px-2 py-0.5 text-xs text-ink-primary"
        >
          {{ w.name }}
          <button class="hover:text-ink-danger" @click="removeAttachment(w.id)">✕</button>
        </span>
      </div>

      <!-- 输入区 -->
      <div class="border-t border-ink-border/60 p-3">
        <div class="flex items-end gap-2">
          <textarea
            v-model="input"
            rows="2"
            placeholder="问我任何创作问题…（输入 @ 引用词条）"
            class="min-w-0 flex-1 resize-none rounded-lg border border-ink-border-strong px-3 py-2 text-sm outline-none focus:border-ink-primary"
            @input="onInput"
            @keydown.enter.exact.prevent="canSend && send()"
          />
          <button
            v-if="isBusy"
            class="rounded-lg bg-ink-danger px-3 py-2 text-xs text-on-primary hover:brightness-110"
            @click="stopGen"
          >停止</button>
          <button
            v-else
            class="rounded-lg bg-ink-primary px-3 py-2 text-xs text-on-primary transition-colors hover:bg-ink-primary-hover disabled:opacity-40"
            :disabled="!canSend"
            @click="send"
          >发送</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
