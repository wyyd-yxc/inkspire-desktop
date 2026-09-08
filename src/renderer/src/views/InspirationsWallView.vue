<script setup lang="ts">
/**
 * 灵感墙页：五类便签卡片墙（灵感/伏笔/片段/备忘/待办）+ 回收站。
 * 零 AI：作者主动记录的素材暂存区；「入画布」联动与回链角标见 SendToCanvasDialog（M11）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { Inspiration, InspirationKind } from '../../../shared/inspiration.types'
import { INSPIRATION_KIND_LABELS } from '../../../shared/inspiration.types'
import type { ChapterMeta } from '../../../shared/chapter.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { INSPIRATION_KIND_COLORS } from '@/services/inspirationStyle'
import InspirationEditDialog from '@/components/inspiration/InspirationEditDialog.vue'
import SendToCanvasDialog from '@/components/inspiration/SendToCanvasDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// 响应式路由参数：同路由跨书导航时 Vue Router 复用组件实例，静态捕获会停留在旧书数据
//（M10.5 承接期 useMemorySync 同款真 bug，照 PlotCanvasView 惯例修）
const bookId = computed(() => route.params.bookId as string)

const book = ref<Pick<Book, 'title' | 'genre' | 'description'> | null>(null)
const wikiEntries = ref<WikiEntry[]>([])
const chapters = ref<ChapterMeta[]>([])
const items = ref<Inspiration[]>([])
const loading = ref(true)

/** 筛选：'' 全部 / 五类之一 / 'recycled' 回收站 */
const filter = ref<'' | InspirationKind | 'recycled'>('')
const keyword = ref('')

const dialogVisible = ref(false)
const editing = ref<Inspiration | null>(null)
/** 彻底删除/清空回收站确认（ConfirmDialog 用 v-model 控显隐，pending 只存目标） */
const purgeVisible = ref(false)
const pendingPurge = ref<Inspiration | null>(null)
const clearVisible = ref(false)
const saving = ref(false)
/** 入画布弹窗 */
const sendVisible = ref(false)
const sendTarget = ref<Inspiration | null>(null)
const sending = ref(false)

const KINDS = Object.keys(INSPIRATION_KIND_LABELS) as InspirationKind[]

async function load(): Promise<void> {
  if (!isElectron) return
  loading.value = true
  try {
    const [booksRes, wikiRes, chaptersRes, listRes] = await Promise.all([
      window.api.books.list(),
      window.api.wiki.list(bookId.value),
      window.api.chapters.listMeta(bookId.value),
      window.api.inspirations.list(bookId.value)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    if (!listRes.ok) throw new Error(listRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    wikiEntries.value = wikiRes.data
    chapters.value = chaptersRes.data
    items.value = listRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '灵感墙加载失败')
  } finally {
    loading.value = false
  }
}

const activeItems = computed(() => items.value.filter((i) => !i.isRecycled))
const recycledItems = computed(() => items.value.filter((i) => i.isRecycled))

const pool = computed(() =>
  filter.value === 'recycled'
    ? recycledItems.value
    : filter.value === ''
      ? activeItems.value
      : activeItems.value.filter((i) => i.kind === filter.value)
)

const shown = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return pool.value
  return pool.value.filter((i) => i.title.includes(kw) || i.content.includes(kw))
})

const kindCounts = computed(() => {
  const map = {} as Record<InspirationKind, number>
  for (const k of KINDS) map[k] = activeItems.value.filter((i) => i.kind === k).length
  return map
})

function wikiName(id: string): string {
  return wikiEntries.value.find((w) => w.id === id)?.name ?? '已删词条'
}

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(item: Inspiration): void {
  editing.value = item
  dialogVisible.value = true
}

async function saveDialog(payload: {
  kind: InspirationKind
  title: string
  content: string
  wikiRefs: string[]
}): Promise<void> {
  if (!payload.title.trim()) {
    toast.error('标题不能为空')
    return
  }
  if (!isElectron || saving.value) return
  saving.value = true
  try {
    const res = editing.value
      ? await window.api.inspirations.update(editing.value.id, payload)
      : await window.api.inspirations.create({ bookId: bookId.value, ...payload })
    if (!res.ok) throw new Error(res.error)
    toast.success(editing.value ? '便签已保存' : '便签已贴上墙')
    dialogVisible.value = false
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/** 软删/恢复（回收站切换） */
async function setRecycled(item: Inspiration, recycled: boolean): Promise<void> {
  if (!isElectron) return
  const res = await window.api.inspirations.update(item.id, { isRecycled: recycled })
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success(recycled ? '已移入回收站' : '已恢复到墙上')
  await load()
}

/** 打开「入画布」目标选择 */
function openSend(item: Inspiration): void {
  sendTarget.value = item
  sendVisible.value = true
}

/** 确认送入画布：建节点（标题←便签标题，内容→描述/摘要）→ 便签写回链 */
async function onSendConfirm(target: { kind: 'plot' | 'scene'; chapterId: string }): Promise<void> {
  const item = sendTarget.value
  if (!isElectron || !item || sending.value) return
  sending.value = true
  try {
    let refId = ''
    if (target.kind === 'plot') {
      const res = await window.api.plot.create({
        bookId: bookId.value,
        title: item.title,
        description: item.content,
        wikiRefs: [...item.wikiRefs]
      })
      if (!res.ok) throw new Error(res.error)
      refId = res.data.id
    } else {
      const res = await window.api.scenes.create({
        chapterId: target.chapterId,
        title: item.title,
        summary: item.content,
        wikiRefs: [...item.wikiRefs]
      })
      if (!res.ok) throw new Error(res.error)
      refId = res.data.id
    }
    const link = await window.api.inspirations.update(item.id, { refType: target.kind, refId })
    if (!link.ok) throw new Error(link.error)
    toast.success('已送入画布，便签标记「已入画布」')
    sendVisible.value = false
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '送入画布失败')
  } finally {
    sending.value = false
  }
}

/** 解绑回链（节点保留在画布上，仅断开便签与节点的关联） */
async function unbind(item: Inspiration): Promise<void> {
  if (!isElectron) return
  const res = await window.api.inspirations.update(item.id, { refType: '' })
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success('已解绑，可重新送入画布')
  await load()
}

/** 跳转查看回链节点（情节大纲直达；场景先反查所在章节） */
async function openCanvas(item: Inspiration): Promise<void> {
  if (item.refType === 'plot') {
    router.push(`/book/${bookId.value}/plot`)
    return
  }
  if (item.refType === 'scene') {
    const res = await window.api.scenes.get(item.refId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (!res.data) {
      toast.error('该场景已不存在，可解绑后重新送入')
      return
    }
    router.push(`/book/${bookId.value}/canvas/${res.data.chapterId}`)
  }
}

watch(bookId, () => void load())

/** 彻底删除（仅回收站内，DAO 兜底校验） */
async function purge(): Promise<void> {
  const item = pendingPurge.value
  if (!isElectron || !item) return
  const res = await window.api.inspirations.remove(item.id)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success('便签已彻底删除')
  pendingPurge.value = null
  await load()
}

async function clearRecycleBin(): Promise<void> {
  if (!isElectron) return
  // 原子清空下沉主进程（r1 静态审查中-2：逐条循环删非原子）
  const res = await window.api.inspirations.clearRecycled(bookId.value)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success(`回收站已清空（${res.data} 张）`)
  await load()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="flex h-full">
    <!-- 左栏：类别筛选 + 回收站 + 操作 -->
    <aside class="flex w-52 shrink-0 flex-col border-r border-ink-border/60 bg-surface">
      <div class="border-b border-ink-border/60 px-4 py-3">
        <router-link :to="`/book/${bookId}/write`" class="text-xs text-ink-text-muted hover:text-ink-primary">← 写作台</router-link>
        <p class="mt-2 text-sm font-semibold">灵感墙</p>
        <p class="truncate text-xs text-ink-text-muted" :title="book?.title">{{ book?.title ?? '…' }}</p>
      </div>
      <div class="px-2 py-3">
        <button
          class="mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filter === '' ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filter = ''"
        >
          全部 <span class="text-xs text-ink-text-muted">{{ activeItems.length }}</span>
        </button>
        <button
          v-for="k in KINDS"
          :key="k"
          class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filter === k ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filter = k"
        >
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :style="{ background: INSPIRATION_KIND_COLORS[k] }" />
            {{ INSPIRATION_KIND_LABELS[k] }}
          </span>
          <span class="text-xs text-ink-text-muted">{{ kindCounts[k] }}</span>
        </button>
        <div class="my-2 border-t border-ink-border/40" />
        <button
          class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filter === 'recycled' ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filter = 'recycled'"
        >
          <span class="flex items-center gap-1.5">回收站</span>
          <span class="text-xs text-ink-text-muted">{{ recycledItems.length }}</span>
        </button>
      </div>
      <div class="mt-auto flex flex-col gap-1.5 p-3">
        <button
          class="rounded-lg bg-ink-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-ink-primary-hover"
          @click="openCreate"
        >+ 新便签</button>
        <button
          v-if="filter === 'recycled' && recycledItems.length > 0"
          class="rounded-lg border border-ink-danger px-3 py-1.5 text-xs text-ink-danger transition-colors hover:bg-ink-danger/5"
          @click="clearVisible = true"
        >清空回收站</button>
      </div>
    </aside>

    <!-- 主区：搜索 + 便签网格 -->
    <main class="min-w-0 flex-1 overflow-y-auto">
      <div class="flex items-center gap-3 border-b border-ink-border/60 bg-surface/60 px-5 py-3">
        <input
          v-model="keyword"
          placeholder="搜索标题或内容…"
          class="w-64 rounded-lg border border-ink-border px-3 py-1.5 text-sm outline-none focus:border-ink-primary"
        />
        <span class="text-xs text-ink-text-muted">
          {{ filter === 'recycled' ? '回收站内的便签可恢复或彻底删除' : '点击便签编辑；选中正文可「存为灵感」' }}
        </span>
      </div>
      <div v-if="loading" class="px-5 py-10 text-center text-sm text-ink-text-muted">加载中…</div>
      <div v-else-if="shown.length === 0" class="px-5 py-16 text-center">
        <p class="text-sm text-ink-text-secondary">
          {{ filter === 'recycled' ? '回收站是空的' : '墙上还没有便签' }}
        </p>
        <p class="mt-1 text-xs text-ink-text-muted">
          {{ filter === 'recycled' ? '删除的便签会先进入回收站' : '随手记下灵感、伏笔、片段，之后可送入情节大纲或场景规划' }}
        </p>
        <button
          v-if="filter !== 'recycled'"
          class="mt-4 rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white hover:bg-ink-primary-hover"
          @click="openCreate"
        >+ 新便签</button>
      </div>
      <div v-else class="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <article
          v-for="it in shown"
          :key="it.id"
          class="flex flex-col rounded-lg border border-ink-border bg-surface shadow-sm"
          :class="it.isRecycled ? 'opacity-60' : ''"
        >
          <div class="flex items-center gap-1.5 border-b border-ink-border/50 px-3.5 py-2" :style="{ background: INSPIRATION_KIND_COLORS[it.kind] + '14' }">
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: INSPIRATION_KIND_COLORS[it.kind] }" />
            <span class="text-xs font-medium" :style="{ color: INSPIRATION_KIND_COLORS[it.kind] }">
              {{ INSPIRATION_KIND_LABELS[it.kind] }}
            </span>
            <span v-if="it.refType" class="ml-auto rounded-full bg-ink-primary-soft px-1.5 py-0.5 text-[10px] text-ink-text-secondary">
              已入画布
            </span>
          </div>
          <div class="min-h-0 flex-1 px-3.5 py-2.5" @click="!it.isRecycled && openEdit(it)">
            <p class="font-serif text-sm font-semibold leading-6">{{ it.title }}</p>
            <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-ink-text-secondary line-clamp-5">
              {{ it.content || '（无内容）' }}
            </p>
          </div>
          <div class="flex flex-wrap gap-1 px-3.5 pb-1" v-if="it.wikiRefs.length || it.source">
            <span
              v-for="rid in it.wikiRefs"
              :key="rid"
              class="rounded-full bg-ink-primary-soft px-1.5 py-0.5 text-[10px] text-ink-text-secondary"
              :class="wikiEntries.some((w) => w.id === rid) ? '' : 'line-through opacity-60'"
            >@{{ wikiName(rid) }}</span>
            <span v-if="it.source" class="ml-auto text-[10px] text-ink-text-muted" :title="it.source">{{ it.source }}</span>
          </div>
          <div class="flex items-center gap-2 border-t border-ink-border/50 px-3.5 py-1.5 text-xs">
            <template v-if="!it.isRecycled">
              <button class="text-ink-text-secondary hover:text-ink-primary" @click="openEdit(it)">编辑</button>
              <template v-if="!it.refType">
                <button class="text-ink-primary hover:underline" @click="openSend(it)">入画布</button>
              </template>
              <template v-else>
                <button class="text-ink-primary hover:underline" @click="openCanvas(it)">查看</button>
                <button class="text-ink-text-muted hover:text-ink-danger" @click="unbind(it)">解绑</button>
              </template>
              <button class="ml-auto text-ink-text-muted hover:text-ink-danger" @click="setRecycled(it, true)">移入回收站</button>
            </template>
            <template v-else>
              <button class="text-ink-success hover:underline" @click="setRecycled(it, false)">恢复</button>
              <button class="ml-auto text-ink-danger hover:underline" @click="pendingPurge = it; purgeVisible = true">彻底删除</button>
            </template>
          </div>
        </article>
      </div>
    </main>

    <InspirationEditDialog
      :visible="dialogVisible"
      :inspiration="editing"
      :wiki-entries="wikiEntries"
      :default-kind="filter !== '' && filter !== 'recycled' ? filter : 'idea'"
      @close="dialogVisible = false"
      @submit="saveDialog"
      @remove="editing && setRecycled(editing, true)"
    />
    <SendToCanvasDialog
      :visible="sendVisible"
      :inspiration="sendTarget"
      :chapters="chapters"
      @close="sendVisible = false"
      @confirm="onSendConfirm"
    />
    <ConfirmDialog
      v-model="purgeVisible"
      title="彻底删除便签"
      :description="`「${pendingPurge?.title ?? ''}」将被永久删除，无法恢复。确定吗？`"
      confirm-text="彻底删除"
      @confirm="purge"
    />
    <ConfirmDialog
      v-model="clearVisible"
      title="清空回收站"
      :description="`回收站内 ${recycledItems.length} 张便签将被永久删除，无法恢复。确定吗？`"
      confirm-text="清空"
      @confirm="clearRecycleBin"
    />
  </div>
</template>
