<script setup lang="ts">
/**
 * 灵感墙页：五类便签卡片墙（灵感/伏笔/片段/备忘/待办）+ 回收站。
 * 零 AI：作者主动记录的素材暂存区；「入画布」联动与回链角标见 SendToCanvasDialog（M11）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { Inspiration, InspirationKind } from '../../../shared/inspiration.types'
import { INSPIRATION_KIND_LABELS } from '../../../shared/inspiration.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { INSPIRATION_KIND_COLORS } from '@/services/inspirationStyle'
import InspirationEditDialog from '@/components/inspiration/InspirationEditDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const toast = useToast()
const bookId = route.params.bookId as string

const book = ref<Pick<Book, 'title' | 'genre' | 'description'> | null>(null)
const wikiEntries = ref<WikiEntry[]>([])
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

const KINDS = Object.keys(INSPIRATION_KIND_LABELS) as InspirationKind[]

async function load(): Promise<void> {
  if (!isElectron) return
  loading.value = true
  try {
    const [booksRes, wikiRes, listRes] = await Promise.all([
      window.api.books.list(),
      window.api.wiki.list(bookId),
      window.api.inspirations.list(bookId)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    if (!listRes.ok) throw new Error(listRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId) ?? null
    wikiEntries.value = wikiRes.data
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
      : await window.api.inspirations.create({ bookId, ...payload })
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
  for (const item of recycledItems.value) {
    const res = await window.api.inspirations.remove(item.id)
    if (!res.ok) {
      toast.error(res.error)
      break
    }
  }
  toast.success('回收站已清空')
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
