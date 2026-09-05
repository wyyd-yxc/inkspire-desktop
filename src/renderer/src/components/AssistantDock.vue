<script setup lang="ts">
/**
 * 墨灵助手浮球+聊天面板（v1 仅正文工作台）。
 * 上下文感知：自动携带当前章节与选区；@召唤百科词条；对话持久化；流式回复。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { chatStream } from '../services/ai'
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
    /* 百科加载失败不阻塞助手 */
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

/** 构建消息：system（助手角色+书籍信息+创世台设定）+ 历史 + 本轮 */
function buildMessages(userText: string) {
  const meta: string[] = []
  if (props.book?.title) meta.push(`书名《${props.book.title}》`)
  if (props.book?.genre) meta.push(`题材：${props.book.genre}`)
  if (props.book?.description) meta.push(`简介：${props.book.description.slice(0, 200)}`)

  // 创世台设定（从父级工作台状态继承不可行，直接读 DB——但为简化 v1，从 props.book 无创世台，
  // 改由 generateWriting 同源档案解析 + 本书上下文）
  const systemParts = [
    '你是「墨灵」，一位资深网文创作顾问。回答创作相关问题时具体、可落地；闲聊时轻松自然。中文书写。',
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

  // 本轮用户消息（附加选区/词条上下文）
  let turn = userText
  if (pendingAttachments.value.length) {
    const entryTexts = pendingAttachments.value
      .map((w) => `【设定·${w.name}】${w.summary}${w.content ? '：' + w.content.slice(0, 300) : ''}`)
      .join('\n')
    turn = `（参考以下设定回答）\n${entryTexts}\n\n${userText}`
  }
  if (props.selectionText.trim()) {
    turn = `（针对以下选中文字）\n「${props.selectionText.slice(0, 500)}」\n\n${userText}`
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
    const session = await chatStream(await resolveProfile(), all, {
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

/** 解析当前应使用的档案（默认 → 第一个 → 报错） */
async function resolveProfile() {
  const [listRes, defRes] = await Promise.all([
    window.api.apiProfiles.list(),
    window.api.settings.get<string>('ai.default_profile_id', '')
  ])
  if (!listRes.ok) throw new Error(listRes.error)
  if (!defRes.ok) throw new Error(defRes.error)
  const profiles = listRes.data
  if (profiles.length === 0) throw new Error('还没有可用的 AI 档案，请先到「设置中心」配置 API')
  return profiles.find((p) => p.id === defRes.data) ?? profiles[0]
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
</script>

<template>
  <!-- 浮球 -->
  <button
    v-if="!expanded"
    class="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink-primary text-white shadow-lg transition-transform hover:scale-110"
    title="墨灵助手"
    @click="toggle"
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
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary text-white">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.4 1.06 4.58 2.78 6.18-.16 1.14-.64 2.7-1.66 3.9a.5.5 0 0 0 .44.82c2.14-.16 3.94-.94 5.16-1.66 1.02.28 2.12.44 3.28.44 5.52 0 10-3.94 10-8.8S17.52 2 12 2z" />
            </svg>
          </span>
          <span class="font-semibold">墨灵助手</span>
        </div>
        <div class="flex gap-2 text-xs">
          <button class="text-ink-text-muted hover:text-ink-danger" @click="clearConversation">清空</button>
          <button class="text-ink-text-muted hover:text-ink-text" @click="toggle">✕</button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div ref="listEl" class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div v-if="messages.length === 0" class="flex flex-col items-center gap-2 py-16 text-center">
          <p class="text-sm text-ink-text-secondary">我是墨灵助手，你的创作伙伴</p>
          <p class="text-xs leading-5 text-ink-text-muted">
            可以问我剧情构思、设定矛盾、写作技巧；<br />
            输入 @ 可引用百科词条；<br />
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
            class="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6"
            :class="
              m.role === 'user'
                ? 'rounded-br-sm bg-ink-primary text-white'
                : 'rounded-bl-sm bg-paper text-ink-text'
            "
          >
            <p class="whitespace-pre-wrap break-words">{{ m.content || (m.pending ? '…' : '') }}</p>
          </div>
        </div>
      </div>

      <!-- @ 召唤选择器 -->
      <div v-if="showPicker" class="border-t border-ink-border/60 px-4 py-2">
        <p class="mb-1 text-xs text-ink-text-muted">选择百科词条</p>
        <div class="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          <button
            v-for="w in pickerList"
            :key="w.id"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            @click="pickEntry(w)"
          >{{ w.name }}</button>
          <span v-if="pickerList.length === 0" class="px-1 text-xs text-ink-text-muted">百科暂无词条</span>
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
            class="min-w-0 flex-1 resize-none rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
            @input="onInput"
            @keydown.enter.exact.prevent="canSend && send()"
          />
          <button
            v-if="isBusy"
            class="rounded-lg bg-ink-danger px-3 py-2 text-xs text-white hover:brightness-110"
            @click="stopGen"
          >停止</button>
          <button
            v-else
            class="rounded-lg bg-ink-primary px-3 py-2 text-xs text-white transition-colors hover:bg-ink-primary-hover disabled:opacity-40"
            :disabled="!canSend"
            @click="send"
          >发送</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
