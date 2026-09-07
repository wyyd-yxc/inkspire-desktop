<script setup lang="ts">
/**
 * 设定集页：世界观知识库（对照原站三栏布局）。
 * 左栏类型筛选+搜索；中栏词条卡片；右侧滑出编辑面板；AI 生成词条；构思台导入。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type {
  WikiAttribute,
  WikiEntry,
  WikiSystemRole,
  WikiType
} from '../../../shared/wiki.types'
import {
  WIKI_SYSTEM_ROLES,
  WIKI_SYSTEM_ROLE_LABELS,
  WIKI_TYPES,
  WIKI_TYPE_LABELS
} from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { useWikiSync } from '@/composables/useWikiSync'
import { useWikiCleanup } from '@/composables/useWikiCleanup'
import { useReverseSync } from '@/composables/useReverseSync'
import { isWikiNameDup } from '../services/syncService'
import { buildWikiGenerateMessages, genesisToWorldEntries, parseWikiGenerate } from '../services/wikiPrompts'
import { generateWriting } from '../services/aiWriting'
import AiWritingPanel from '@/components/AiWritingPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SyncCandidateDialog from '@/components/sync/SyncCandidateDialog.vue'
import WikiExtractDialog from '@/components/sync/WikiExtractDialog.vue'

const route = useRoute()
const toast = useToast()
// 响应式 bookId：同路由跨书导航时组件复用，setup 一次性捕获会拿到旧书 id（FK 失败，M6 自测教训）
const bookId = computed(() => route.params.bookId as string)

const book = ref<Pick<Book, 'title' | 'genre' | 'description'> | null>(null)
const entries = ref<WikiEntry[]>([])
const chapters = ref<Chapter[]>([])
const loading = ref(true)
const filterType = ref<WikiType | ''>('')
const keyword = ref('')

// 编辑面板
const panelVisible = ref(false)
const editing = ref<WikiEntry | null>(null) // null=新建
const form = reactive({
  type: 'character' as WikiType,
  name: '',
  summary: '',
  content: '',
  attributes: [] as WikiAttribute[],
  systemRole: '' as WikiSystemRole,
  injection: 'manual' as 'always' | 'manual'
})
const saving = ref(false)

// 删除确认
const pendingDelete = ref<WikiEntry | null>(null)

// AI 生成
const aiDialogVisible = ref(false)
const aiForm = reactive({ type: 'character' as WikiType, keywords: '' })
const aiPanel = ref<InstanceType<typeof AiWritingPanel> | null>(null)
const aiPanelVisible = ref(false)
const isBusy = ref(false)

// 构思台导入
const importing = ref(false)

/** 类型配色（卡片头像底色；M10.8 严肃化：低饱和墨系渐变） */
const typeColors: Record<WikiType, string> = {
  character: 'linear-gradient(135deg,#7a6f58,#57503f)',
  location: 'linear-gradient(135deg,#5c7d78,#3d615c)',
  item: 'linear-gradient(135deg,#a3835a,#7d6240)',
  faction: 'linear-gradient(135deg,#9a6a78,#6f4a58)',
  skill: 'linear-gradient(135deg,#5c7d94,#3f5c72)',
  lore: 'linear-gradient(135deg,#7d8a5f,#5c6844)'
}

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return entries.value.filter((w) => {
    if (filterType.value && w.type !== filterType.value) return false
    if (!kw) return true
    return (
      w.name.includes(kw) ||
      w.summary.includes(kw) ||
      w.content.includes(kw) ||
      w.attributes.some((a) => a.key.includes(kw) || a.value.includes(kw))
    )
  })
})

const typeCounts = computed(() => {
  const map = {} as Record<WikiType, number>
  for (const t of WIKI_TYPES) map[t] = entries.value.filter((w) => w.type === t).length
  return map
})

// 正文→设定集提取（M10.5，编排逻辑在 useWikiSync）
const {
  extractDialogVisible,
  extractScope,
  extractChapterId,
  unextracted,
  runProgress,
  isBusy: extractBusy,
  candidateDialogVisible,
  candidateTitle,
  candidateItems,
  candidateDescription,
  openExtractDialog,
  startWikiExtract,
  stopEverything,
  onCandidatesConfirm
} = useWikiSync({ bookId, book, chapters, wikiEntries: entries, toast })

// 词条整理（M10.6：病态名修复/近似合并/引用转移，独立面板实例与提取面板并存）
const {
  cleanupRunning,
  candidateDialogVisible: mergeDialogVisible,
  candidateTitle: mergeTitle,
  candidateDescription: mergeDescription,
  candidateItems: mergeItems,
  runCleanup,
  confirmMerges,
  stopEverything: stopCleanup
} = useWikiCleanup({ bookId, wikiEntries: entries, chapters, toast })

// 反向受限更新（M10.7）：词条名变更 → 扫描正文与关联模块旧表述（独立面板实例）
const {
  scanning: reverseScanning,
  candidateDialogVisible: reverseDialogVisible,
  candidateTitle: reverseTitle,
  candidateDescription: reverseDescription,
  candidateItems: reverseItems,
  propagate: reversePropagate,
  applyEdits: reverseApply
} = useReverseSync({ bookId, toast })
/** 待确认的反向传播载荷（用户确认后执行） */
const pendingReverse = ref<{ oldValue: string; newValue: string; context: string } | null>(null)

function confirmReverse(): void {
  const p = pendingReverse.value
  pendingReverse.value = null
  if (p) void reversePropagate({ kind: 'wiki', ...p })
}

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, wikiRes, chaptersRes] = await Promise.all([
      window.api.books.list(),
      window.api.wiki.list(bookId.value),
      window.api.chapters.list(bookId.value)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    entries.value = wikiRes.data
    chapters.value = chaptersRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editing.value = null
  form.type = (filterType.value as WikiType) || 'character'
  form.name = ''
  form.summary = ''
  form.content = ''
  form.attributes = []
  form.systemRole = ''
  form.injection = 'manual'
  panelVisible.value = true
}

function openEdit(w: WikiEntry): void {
  editing.value = w
  form.type = w.type
  form.name = w.name
  form.summary = w.summary
  form.content = w.content
  form.attributes = w.attributes.map((a) => ({ ...a }))
  form.systemRole = w.systemRole
  form.injection = w.injection
  panelVisible.value = true
}

function addAttribute(): void {
  form.attributes.push({ key: '', value: '' })
}
function removeAttribute(i: number): void {
  form.attributes.splice(i, 1)
}

/** 保存（新建或更新）。保存前 checkDup 预检（M10.6）；Vue 响应式对象过 IPC 必须 toRaw+深拷贝（踩坑 #11） */
async function save(): Promise<void> {
  if (!form.name.trim()) {
    toast.error('词条名称不能为空')
    return
  }
  saving.value = true
  try {
    const dup = await window.api.wiki.checkDup(
      bookId.value,
      form.name,
      form.type,
      editing.value?.id
    )
    if (dup.ok && dup.data.duplicate) {
      toast.error(`已存在重复词条「${dup.data.matchedName}」，请换一个名称或直接编辑那条`)
      return
    }
    const plain = JSON.parse(JSON.stringify({
      type: form.type,
      name: form.name,
      summary: form.summary,
      content: form.content,
      attributes: form.attributes.filter((a) => a.key.trim()),
      systemRole: form.systemRole,
      injection: form.injection
    }))
    const res = editing.value
      ? await window.api.wiki.update(editing.value.id, plain)
      : await window.api.wiki.create({ bookId: bookId.value, ...plain })
    if (!res.ok) throw new Error(res.error)
    const i = entries.value.findIndex((w) => w.id === res.data.id)
    if (i >= 0) entries.value[i] = res.data
    else entries.value.push(res.data)
    panelVisible.value = false
    toast.success(`词条「${res.data.name}」已保存`)
    // 反向受限更新（M10.7）：改名后询问是否扫描正文与关联模块中的旧表述
    if (editing.value && editing.value.name !== res.data.name) {
      pendingReverse.value = {
        oldValue: editing.value.name,
        newValue: res.data.name,
        context: `词条简介：${res.data.summary.slice(0, 60)}`
      }
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function doDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  try {
    const res = await window.api.wiki.remove(target.id)
    if (!res.ok) throw new Error(res.error)
    entries.value = entries.value.filter((w) => w.id !== target.id)
    toast.success(`「${target.name}」已删除`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败')
  } finally {
    pendingDelete.value = null
  }
}

// ---- AI 生成词条 ----
function openAiDialog(): void {
  aiForm.type = (filterType.value as WikiType) || 'character'
  aiForm.keywords = ''
  aiDialogVisible.value = true
}

/** 确认 AI 生成弹窗 → 发起流式生成 */
async function startAiGenerate(): Promise<void> {
  if (isBusy.value || !book.value) return
  aiDialogVisible.value = false
  isBusy.value = true
  aiPanelVisible.value = true
  aiPanel.value?.reset()
  await new Promise((r) => setTimeout(r, 50)) // 等面板挂载
  try {
    const messages = buildWikiGenerateMessages(
      book.value,
      aiForm.type,
      aiForm.keywords,
      entries.value.map((w) => w.name)
    )
    await generateWriting(messages, {
      onChunk: (t) => aiPanel.value?.append(t),
      onDone: () => aiPanel.value?.finish(),
      onError: (m) => {
        aiPanel.value?.fail()
        toast.error(m)
      }
    })
  } catch (err) {
    aiPanel.value?.fail()
    toast.error(err instanceof Error ? err.message : '生成失败')
  } finally {
    isBusy.value = false
  }
}

/** 采纳 AI 生成的词条 → 填入编辑面板（用户确认后保存） */
function acceptAiEntry(text: string): void {
  const parsed = parseWikiGenerate(text, aiForm.type)
  if (!parsed) {
    toast.error('AI 输出格式异常，无法解析。可手动复制有用部分')
    return
  }
  editing.value = null
  form.type = aiForm.type
  form.name = parsed.name
  form.summary = parsed.summary
  form.content = parsed.content
  form.attributes = parsed.attributes
  form.systemRole = parsed.systemRole
  form.injection = 'manual'
  aiPanelVisible.value = false
  panelVisible.value = true
  toast.success('已填入词条内容，请检查后保存')
}

// ---- 构思台导入 ----
async function importFromGenesis(): Promise<void> {
  if (importing.value || !isElectron) return
  importing.value = true
  try {
    const genesisRes = await window.api.genesis.get(bookId.value)
    if (!genesisRes.ok) throw new Error(genesisRes.error)
    const step3Rec = genesisRes.data.find((s) => s.step === 3)
    if (!step3Rec?.data) {
      toast.error('请先在构思台完成「世界构建」起草，再来导入')
      return
    }
    const world = step3Rec.data as { protagonist: string; worldRules: string }
    const candidates = genesisToWorldEntries(world)
    // 幂等：M10.6 统一 isWikiNameDup（与构思台推送入口同强度）
    let created = 0
    for (const c of candidates) {
      if (entries.value.some((w) => isWikiNameDup(c.name, c.type, w.name, w.type))) continue
      const res = await window.api.wiki.create({
        bookId: bookId.value,
        type: c.type,
        name: c.name,
        summary: c.summary,
        content: c.content,
        systemRole: c.systemRole,
        injection: c.injection
      })
      if (res.ok) {
        entries.value.push(res.data)
        created++
      }
    }
    toast.success(created ? `已导入 ${created} 条词条` : '构思台内容均已导入过，无新增')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '导入失败')
  } finally {
    importing.value = false
  }
}

watch(bookId, () => void loadAll())
onMounted(() => void loadAll())
</script>

<template>
  <div class="flex h-full">
    <!-- 左栏：类型筛选 + 搜索 -->
    <aside class="flex w-52 shrink-0 flex-col border-r border-ink-border/60 bg-surface">
      <div class="border-b border-ink-border/60 px-4 py-3">
        <router-link :to="`/book/${bookId}/write`" class="text-xs text-ink-text-muted hover:text-ink-primary">← 写作台</router-link>
        <p class="mt-2 text-sm font-semibold">设定集</p>
        <p class="truncate text-xs text-ink-text-muted" :title="book?.title">{{ book?.title ?? '…' }}</p>
      </div>
      <div class="px-3 py-3">
        <input
          v-model="keyword"
          placeholder="搜索词条…"
          class="w-full rounded-lg border border-ink-border px-2.5 py-1.5 text-sm outline-none focus:border-ink-primary"
        />
      </div>
      <div class="flex flex-col gap-0.5 px-2">
        <button
          class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filterType === '' ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filterType = ''"
        >
          全部 <span class="text-xs text-ink-text-muted">{{ entries.length }}</span>
        </button>
        <button
          v-for="t in WIKI_TYPES"
          :key="t"
          class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filterType === t ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filterType = t"
        >
          {{ WIKI_TYPE_LABELS[t] }} <span class="text-xs text-ink-text-muted">{{ typeCounts[t] }}</span>
        </button>
      </div>
      <div class="mt-auto flex flex-col gap-1.5 p-3">
        <button
          class="rounded-lg bg-ink-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-ink-primary-hover"
          @click="openCreate"
        >+ 新建词条</button>
        <button
          class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary disabled:opacity-50"
          :disabled="importing"
          @click="importFromGenesis"
        >{{ importing ? '导入中…' : '从构思台导入' }}</button>
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          @click="openExtractDialog"
        >从正文提取</button>
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          @click="openAiDialog"
        >AI 生成词条</button>
        <button
          class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary disabled:opacity-50"
          :disabled="cleanupRunning"
          title="修复病态词条名、合并同一实体的重复词条（引用自动转移）"
          @click="runCleanup"
        >{{ cleanupRunning ? '整理中…' : '整理词条' }}</button>
      </div>
    </aside>

    <!-- 中栏：词条卡片 -->
    <main class="min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-4xl px-6 py-5">
        <div v-if="loading" class="py-24 text-center text-ink-text-muted">加载中…</div>
        <div v-else-if="filtered.length === 0" class="flex flex-col items-center gap-3 py-24">
          <p class="text-ink-text-secondary">{{ entries.length ? '没有匹配的词条' : '还没有词条' }}</p>
          <p class="text-sm text-ink-text-muted">左侧「新建词条 / AI 生成 / 从构思台导入」任选</p>
        </div>
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          <div
            v-for="w in filtered"
            :key="w.id"
            class="cursor-pointer rounded-card bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
            @click="openEdit(w)"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                :style="{ backgroundImage: typeColors[w.type] }"
              >{{ w.name.slice(0, 1) }}</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <h3 class="truncate font-semibold">{{ w.name }}</h3>
                  <span
                    v-if="w.injection === 'always'"
                    class="shrink-0 rounded-full bg-ink-primary-soft px-1.5 py-0.5 text-[10px] text-ink-primary"
                    title="全书长期生效：AI 写作自动携带"
                  >常驻</span>
                </div>
                <p class="text-xs text-ink-text-muted">{{ WIKI_TYPE_LABELS[w.type] }}<template v-if="w.systemRole"> · {{ WIKI_SYSTEM_ROLE_LABELS[w.systemRole] }}</template></p>
              </div>
            </div>
            <p class="mt-2 line-clamp-2 min-h-8 text-sm text-ink-text-secondary">{{ w.summary || '暂无简介' }}</p>
            <div v-if="w.attributes.length" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="a in w.attributes.slice(0, 3)"
                :key="a.key"
                class="rounded bg-paper px-1.5 py-0.5 text-xs text-ink-text-secondary"
              >{{ a.key }}:{{ a.value }}</span>
              <span v-if="w.attributes.length > 3" class="px-1 text-xs text-ink-text-muted">+{{ w.attributes.length - 3 }}</span>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 右侧编辑面板 -->
    <teleport to="body">
      <div v-if="panelVisible" class="fixed inset-0 z-40 flex justify-end bg-black/20" @click.self="panelVisible = false">
        <div class="flex h-full w-[440px] flex-col bg-surface shadow-2xl">
          <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3.5">
            <h2 class="font-semibold">{{ editing ? '编辑词条' : '新建词条' }}</h2>
            <button class="text-ink-text-muted hover:text-ink-text" @click="panelVisible = false">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4">
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">名称 *</span>
                <input v-model="form.name" maxlength="30" class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">类型</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="t in WIKI_TYPES"
                    :key="t"
                    class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    :class="form.type === t ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                    @click="form.type = t"
                  >{{ WIKI_TYPE_LABELS[t] }}</button>
                </div>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">一句话简介</span>
                <input v-model="form.summary" maxlength="60" class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">详细设定</span>
                <textarea v-model="form.content" rows="6" class="resize-y rounded-lg border border-ink-border px-3 py-2 text-sm leading-6 outline-none focus:border-ink-primary" />
              </label>
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-ink-text-secondary">属性</span>
                  <button class="text-xs text-ink-primary hover:underline" @click="addAttribute">+ 添加</button>
                </div>
                <div v-for="(a, i) in form.attributes" :key="i" class="flex items-center gap-1.5">
                  <input v-model="a.key" placeholder="属性名" class="w-24 rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
                  <input v-model="a.value" placeholder="属性值" class="min-w-0 flex-1 rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
                  <button class="text-ink-text-muted hover:text-ink-danger" @click="removeAttribute(i)">✕</button>
                </div>
              </div>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">系统角色（重要程度）</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    :class="form.systemRole === '' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                    @click="form.systemRole = ''"
                  >不标注</button>
                  <button
                    v-for="r in WIKI_SYSTEM_ROLES"
                    :key="r"
                    class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    :class="form.systemRole === r ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                    @click="form.systemRole = r"
                  >{{ WIKI_SYSTEM_ROLE_LABELS[r] }}</button>
                </div>
              </label>
              <div class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">AI 注入模式</span>
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="form.injection" type="radio" value="manual" /> 仅手动引用
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="form.injection" type="radio" value="always" /> 全书长期生效（AI 写作自动携带）
                </label>
                <p class="text-xs text-ink-text-muted">词条不是越多越好，常驻词条过多会挤占 AI 上下文</p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between border-t border-ink-border/60 px-5 py-3">
            <button
              v-if="editing"
              class="text-sm text-ink-danger hover:underline"
              @click="pendingDelete = editing; panelVisible = false"
            >删除词条</button>
            <span v-else />
            <button
              class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
              :disabled="saving"
              @click="save"
            >{{ saving ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- AI 生成设置弹窗 -->
    <teleport to="body">
      <div v-if="aiDialogVisible" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" @click.self="aiDialogVisible = false">
        <div class="w-[420px] rounded-2xl bg-surface p-6 shadow-card">
          <h2 class="mb-4 text-lg font-semibold">AI 生成词条</h2>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">词条类型</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="t in WIKI_TYPES"
                  :key="t"
                  class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="aiForm.type === t ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                  @click="aiForm.type = t"
                >{{ WIKI_TYPE_LABELS[t] }}</button>
              </div>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">关键词 / 要求（留空由 AI 发挥）</span>
              <textarea v-model="aiForm.keywords" rows="2" placeholder="如：女主角的师父，冷面热心，剑修" class="resize-none rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
            </label>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft" @click="aiDialogVisible = false">取消</button>
            <button class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover" @click="startAiGenerate">开始生成</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- AI 流式面板 -->
    <AiWritingPanel
      ref="aiPanel"
      :visible="aiPanelVisible"
      kind="polish"
      @accept="acceptAiEntry"
      @retry="startAiGenerate"
      @stop="aiPanelVisible = false; isBusy = false"
      @close="aiPanelVisible = false; isBusy = false"
    />

    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除词条「${pendingDelete?.name ?? ''}」？`"
      description="删除后 AI 写作将不再携带该设定。"
      @confirm="doDelete"
    />

    <!-- 正文提取词条（M10.5） -->
    <WikiExtractDialog
      v-model:scope="extractScope"
      v-model:chapter-id="extractChapterId"
      :visible="extractDialogVisible"
      :busy="extractBusy"
      :progress="runProgress"
      :unextracted-count="unextracted.length"
      :chapters="chapters"
      @start="startWikiExtract"
      @close="extractDialogVisible = false"
    />
    <SyncCandidateDialog
      :visible="candidateDialogVisible"
      :title="candidateTitle"
      :description="candidateDescription"
      :items="candidateItems"
      confirm-text="入库所选项"
      @confirm="onCandidatesConfirm"
      @close="candidateDialogVisible = false"
    />
    <SyncCandidateDialog
      :visible="mergeDialogVisible"
      :title="mergeTitle"
      :description="mergeDescription"
      :items="mergeItems"
      confirm-text="合并所选项"
      @confirm="confirmMerges"
      @close="mergeDialogVisible = false; stopCleanup()"
    />
    <!-- 反向受限更新（M10.7）：确认扫描 + 原文→建议勾选面板 -->
    <ConfirmDialog
      :model-value="pendingReverse !== null"
      title="同步旧表述？"
      :description="`词条名已从「${pendingReverse?.oldValue ?? ''}」改为「${pendingReverse?.newValue ?? ''}」。要扫描正文与记忆/剧情中的旧表述并给出替换建议吗？（逐处勾选，只改你确认的）`"
      :confirm-text="reverseScanning ? '扫描中…' : '扫描'"
      @update:model-value="pendingReverse = null"
      @confirm="confirmReverse"
    />
    <SyncCandidateDialog
      :visible="reverseDialogVisible"
      :title="reverseTitle"
      :description="reverseDescription"
      :items="reverseItems"
      confirm-text="应用所选项"
      @confirm="reverseApply"
      @close="reverseDialogVisible = false"
    />
  </div>
</template>
