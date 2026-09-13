<script setup lang="ts">
/**
 * 全局书内导航壳（M15.5 布局重规划）：左侧常驻书内导航（返回书房/书名/功能入口/章节树/全书统计），
 * 书内 8 个功能页作为子路由共用此骨架，页面级返回栏全部移除；助手浮球升级为书内全局。
 * 壳拥有 book/chapters 与联动同步栈；子页面经 BOOK_SHELL_KEY 注入共享（见 shellContext.ts）。
 * 布局形态借鉴 Sudowrite/Novelcrafter 的三栏范式（左导航常驻+内容区），皮肤沿用案头纸墨令牌。
 */
import { computed, onMounted, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book } from '../../shared/book.types'
import type { Chapter } from '../../shared/chapter.types'
import type { WikiEntry } from '../../shared/wiki.types'
import type { Memory } from '../../shared/memory.types'
import type { PlotEvent } from '../../shared/plot.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { useAutoSync } from '@/composables/useAutoSync'
import { useMemorySync } from '@/composables/useMemorySync'
import { useWikiSync } from '@/composables/useWikiSync'
import { usePlotSync } from '@/composables/usePlotSync'
import { BOOK_SHELL_KEY } from './shellContext'
import ChapterSidebar from '@/components/ChapterSidebar.vue'
import AssistantDock from '@/components/AssistantDock.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SyncDialog from '@/components/sync/SyncDialog.vue'
import SyncCandidateDialog from '@/components/sync/SyncCandidateDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const bookId = computed(() => route.params.bookId as string)

const book = ref<Book | null>(null)
const chapters = ref<Chapter[]>([])
const wikiEntries = ref<WikiEntry[]>([])
const memories = ref<Memory[]>([])
const plotEvents = ref<PlotEvent[]>([])
const loading = ref(true)
const pendingDelete = ref<Chapter | null>(null)

/** 当前编辑章节 id：仅写作台路由由 ?ch= 驱动；其他功能页为空（章节树不高亮） */
const activeChapterId = computed(() =>
  route.name === 'workspace' ? ((route.query.ch as string) ?? '') : ''
)

/** 编辑器上下文：写作台页回写（见 WorkspaceView），助手浮球任意书内页面可读 */
const editorCtx = reactive({ title: '', content: '', selection: '' })

/** 章节重命名（壳统一实现；写作台标题行内编辑经 ctx 复用） */
async function renameChapter(id: string, title: string): Promise<void> {
  try {
    const res = await window.api.chapters.update(id, { title })
    if (!res.ok) throw new Error(res.error)
    const i = chapters.value.findIndex((c) => c.id === id)
    if (i >= 0) chapters.value[i] = res.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '重命名失败')
  }
}

provide(BOOK_SHELL_KEY, { bookId, book, chapters, activeChapterId, editorCtx, renameChapter })

// ---- 功能导航（场景规划按章进入，入口在章节树行内，不设导航项）----
const NAV = [
  { name: 'workspace', label: '写作台' },
  { name: 'genesis', label: '构思台' },
  { name: 'wiki', label: '设定集' },
  { name: 'plot', label: '情节大纲' },
  { name: 'memory', label: '叙事档案' },
  { name: 'inspirations', label: '灵感墙' },
  { name: 'stats', label: '创作统计' }
] as const

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, chaptersRes, wikiRes, memRes, plotRes] = await Promise.all([
      window.api.books.list(),
      window.api.chapters.list(bookId.value),
      window.api.wiki.list(bookId.value),
      window.api.memories.list(bookId.value),
      window.api.plot.list(bookId.value)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    if (!memRes.ok) throw new Error(memRes.error)
    if (!plotRes.ok) throw new Error(plotRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    chapters.value = chaptersRes.data
    wikiEntries.value = wikiRes.data
    memories.value = memRes.data
    plotEvents.value = plotRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

// ---- 章节操作（章节树事件；select/create 经路由 ?ch= 驱动写作台切章，切章保存由写作台 watch 兜底）----
function selectChapter(c: Chapter): void {
  if (route.name === 'workspace' && route.query.ch === c.id) return
  void router.push({ path: `/book/${bookId.value}/write`, query: { ch: c.id } })
}

async function createChapter(): Promise<void> {
  try {
    const res = await window.api.chapters.create({ bookId: bookId.value })
    if (!res.ok) throw new Error(res.error)
    chapters.value.push(res.data)
    void router.push({ path: `/book/${bookId.value}/write`, query: { ch: res.data.id } })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '新建章节失败')
  }
}

async function moveChapter(id: string, dir: -1 | 1): Promise<void> {
  try {
    const res = await window.api.chapters.move(id, dir)
    if (!res.ok) throw new Error(res.error)
    if (!res.data) return // 已在边界
    const listRes = await window.api.chapters.list(bookId.value)
    if (listRes.ok) chapters.value = listRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '移动失败')
  }
}

async function doDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  try {
    const res = await window.api.chapters.remove(target.id)
    if (!res.ok) throw new Error(res.error)
    const listRes = await window.api.chapters.list(bookId.value)
    if (listRes.ok) chapters.value = listRes.data
    // 删除的是当前编辑章节：回写作台默认首章（旧章已从数组移除，写作台切章 watch 不会误存）
    if (route.name === 'workspace' && route.query.ch === target.id) {
      void router.push({ path: `/book/${bookId.value}/write` })
    }
    toast.success(`「${target.title}」已删除`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败')
  } finally {
    pendingDelete.value = null
  }
}

// ---- 联动同步栈（自写作台上移：任意书内页面可发起；编排细节在各 composable）----
const memorySync = useMemorySync({ bookId, book, chapters, memories, toast })
const wikiSync = useWikiSync({ bookId, book, chapters, wikiEntries, toast })
const plotSync = usePlotSync({ bookId, book, chapters, events: plotEvents, toast })
const syncDialogVisible = ref(false)
// 自动同步提醒红点（useAutoSync 提醒档置位；打开同步弹窗即清除）
const { syncAlert, clearAlert } = useAutoSync()

const activeChapter = computed(() => chapters.value.find((c) => c.id === activeChapterId.value) ?? null)

async function openSyncDialog(): Promise<void> {
  await Promise.all([memorySync.refreshWatermark(), wikiSync.refreshWatermark(), plotSync.refreshWatermark()])
  clearAlert()
  syncDialogVisible.value = true
}

function startSync(opts: { wiki: boolean; memory: boolean; plot: boolean; scope: 'changed' | 'current' }): void {
  syncDialogVisible.value = false
  if (opts.memory) {
    memorySync.extractScope.value = opts.scope === 'current' ? 'single' : 'unextracted'
    if (opts.scope === 'current' && activeChapter.value) {
      memorySync.extractChapterId.value = activeChapter.value.id
    }
    void memorySync.startExtract()
  }
  if (opts.wiki) {
    wikiSync.extractScope.value = opts.scope
    if (opts.scope === 'current' && activeChapter.value) {
      wikiSync.extractChapterId.value = activeChapter.value.id
    }
    void wikiSync.startWikiExtract()
  }
  if (opts.plot) {
    void plotSync.startExtract(opts.scope === 'current' ? 'single' : 'changed', activeChapter.value?.id)
  }
}

const syncBusy = computed(() => memorySync.isBusy.value || wikiSync.isBusy.value || plotSync.isBusy.value)

onMounted(() => void loadAll())
watch(bookId, () => void loadAll())
</script>

<template>
  <div class="flex h-full">
    <!-- 左侧书内导航（常驻） -->
    <aside class="flex h-full w-60 shrink-0 flex-col border-r border-ink-border/60 bg-surface">
      <div class="border-b border-ink-border/60 px-4 py-3">
        <router-link
          to="/"
          class="flex items-center gap-1 text-xs text-ink-text-muted transition-colors hover:text-ink-primary"
        >← 书房</router-link>
        <p class="mt-1.5 truncate text-sm font-semibold" :title="book?.title">{{ book?.title ?? '…' }}</p>
      </div>

      <nav class="border-b border-ink-border/60 px-2 py-2">
        <router-link
          v-for="item in NAV"
          :key="item.name"
          :to="`/book/${bookId}/${item.name === 'workspace' ? 'write' : item.name}`"
          class="mb-0.5 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="route.name === item.name ? 'bg-ink-primary-soft font-medium text-ink-primary' : 'text-ink-text-secondary hover:bg-paper'"
        >{{ item.label }}</router-link>
        <button
          class="relative mt-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm text-ink-text-secondary transition-colors hover:bg-paper"
          title="同步：把正文改动推送到设定集与叙事档案"
          @click="openSyncDialog"
        >同步<span
          v-if="syncAlert"
          class="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-ink-danger"
        /></button>
      </nav>

      <ChapterSidebar
        :chapters="chapters"
        :active-id="activeChapterId"
        :book-id="bookId"
        @create="createChapter"
        @select="selectChapter"
        @rename="renameChapter"
        @remove="pendingDelete = $event"
        @move="moveChapter"
      />

      <div v-if="loading" class="absolute inset-0 z-30 flex items-center justify-center bg-paper/60">
        <p class="text-ink-text-muted">正在载入…</p>
      </div>
    </aside>

    <!-- 内容区：书内功能页 -->
    <main class="min-w-0 flex-1">
      <router-view />
    </main>

    <!-- 墨灵助手（书内全局，M15.5 自「仅写作台」升级） -->
    <AssistantDock
      :book-id="bookId"
      :book="book"
      :chapter-title="editorCtx.title"
      :chapter-content="editorCtx.content"
      :selection-text="editorCtx.selection"
    />

    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除「${pendingDelete?.title ?? ''}」？`"
      description="章节正文将一并删除且不可恢复。"
      @confirm="doDelete"
    />

    <!-- 联动同步弹窗与三条候选确认面板 -->
    <SyncDialog
      :visible="syncDialogVisible"
      :busy="syncBusy"
      :changed-wiki-count="wikiSync.unextracted.value.length"
      :changed-memory-count="memorySync.unextracted.value.length"
      :changed-plot-count="plotSync.unextracted.value.length"
      :can-sync-current="!!(activeChapter && activeChapter.wordCount > 0)"
      @start="startSync"
      @close="syncDialogVisible = false"
    />
    <SyncCandidateDialog
      :visible="wikiSync.candidateDialogVisible.value"
      :title="wikiSync.candidateTitle.value"
      :description="wikiSync.candidateDescription.value"
      :items="wikiSync.candidateItems.value"
      confirm-text="入库所选项"
      @confirm="wikiSync.onCandidatesConfirm"
      @close="wikiSync.candidateDialogVisible.value = false"
    />
    <SyncCandidateDialog
      :visible="memorySync.candidateDialogVisible.value"
      :title="memorySync.candidateTitle.value"
      :description="memorySync.candidateDescription.value"
      :items="memorySync.candidateItems.value"
      :confirm-text="memorySync.candidateTitle.value.includes('合并') ? '合并所选项' : '入库所选项'"
      @confirm="memorySync.onCandidatesConfirm"
      @close="memorySync.candidateDialogVisible.value = false"
    />
    <SyncCandidateDialog
      :visible="plotSync.candidateDialogVisible.value"
      title="采纳剧情事件候选"
      :description="plotSync.candidateDescription.value"
      :items="plotSync.candidateItems.value"
      confirm-text="上画布"
      @confirm="plotSync.onCandidatesConfirm"
      @close="plotSync.candidateDialogVisible.value = false"
    />
  </div>
</template>
