<script setup lang="ts">
/**
 * 正文工作台页：左章节树 + 中编辑器。
 * 数据编排：章节列表加载/CRUD、编辑器内容防抖自动保存（1.5s）+ Ctrl+S、切换章节前保存。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import type { Memory } from '../../../shared/memory.types'
import type { PlotEvent } from '../../../shared/plot.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { useMemorySync } from '@/composables/useMemorySync'
import { useWikiSync } from '@/composables/useWikiSync'
import { usePlotSync } from '@/composables/usePlotSync'
import { useAutoSync } from '@/composables/useAutoSync'
import ChapterSidebar from '@/components/ChapterSidebar.vue'
import ChapterEditor from '@/components/ChapterEditor.vue'
import AssistantDock from '@/components/AssistantDock.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SyncDialog from '@/components/sync/SyncDialog.vue'
import SyncCandidateDialog from '@/components/sync/SyncCandidateDialog.vue'

const route = useRoute()
const toast = useToast()
// 响应式 bookId（防同路由跨书导航时组件复用拿旧 id，M6 自测教训）
const bookId = computed(() => route.params.bookId as string)

const book = ref<Book | null>(null)
const chapters = ref<Chapter[]>([])
const activeChapter = ref<Chapter | null>(null)
const wikiEntries = ref<WikiEntry[]>([])
const memories = ref<Memory[]>([])
const plotEvents = ref<PlotEvent[]>([])
const pendingDelete = ref<Chapter | null>(null)
const loading = ref(true)

// ---- 联动同步（M10.5/M10.7）：把正文改动推送到百科/记忆/剧情；编排细节在各 composable ----
const memorySync = useMemorySync({ bookId, book, chapters, memories, toast })
const wikiSync = useWikiSync({ bookId, book, chapters, wikiEntries, toast })
const plotSync = usePlotSync({ bookId, book, chapters, events: plotEvents, toast })
const syncDialogVisible = ref(false)
// 自动同步提醒红点（useAutoSync 提醒档置位；打开同步弹窗即清除）
const { syncAlert, clearAlert } = useAutoSync()

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
    void plotSync.startExtract(
      opts.scope === 'current' ? 'single' : 'changed',
      activeChapter.value?.id
    )
  }
}

const syncBusy = computed(() => memorySync.isBusy.value || wikiSync.isBusy.value || plotSync.isBusy.value)

const editorRef = ref<InstanceType<typeof ChapterEditor> | null>(null)

/** 待写盘的最新编辑状态（html+字数） */
const pendingContent = ref<{ html: string; wordCount: number } | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let isSwitching = false

/** 编辑器选区文字（M9 助手上下文感知） */
const editorSelection = ref('')

function onSelectionChange(text: string): void {
  editorSelection.value = text
}

const totalWords = computed(() => chapters.value.reduce((s, c) => s + c.wordCount, 0))

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
    activeChapter.value = chapters.value[0] ?? null
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

/** 立即保存（跳过防抖）；切换章节/卸载前必须调用 */
async function flushSave(): Promise<void> {
  const pending = pendingContent.value
  const target = activeChapter.value
  if (!pending || !target) return
  pendingContent.value = null
  editorRef.value?.setSaveState('saving')
  try {
    const res = await window.api.chapters.update(target.id, {
      content: pending.html,
      wordCount: pending.wordCount
    })
    if (!res.ok) throw new Error(res.error)
    const updated = res.data
    const i = chapters.value.findIndex((c) => c.id === updated.id)
    if (i >= 0) chapters.value[i] = updated
    editorRef.value?.setSaveState('saved')
  } catch (err) {
    editorRef.value?.setSaveState('dirty')
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

function onContentChange(html: string, wordCount: number): void {
  pendingContent.value = { html, wordCount }
  editorRef.value?.setSaveState('dirty')
  // 本地即时更新字数显示（不等落盘）
  if (activeChapter.value) {
    const i = chapters.value.findIndex((c) => c.id === activeChapter.value!.id)
    if (i >= 0) chapters.value[i] = { ...chapters.value[i], wordCount }
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), 1500)
}

async function selectChapter(c: Chapter): Promise<void> {
  if (isSwitching) return
  if (activeChapter.value?.id === c.id) return
  isSwitching = true
  try {
    await flushSave() // 切走前保存当前章节
    activeChapter.value = c
  } finally {
    isSwitching = false
  }
}

async function createChapter(): Promise<void> {
  try {
    await flushSave()
    const res = await window.api.chapters.create({ bookId: bookId.value })
    if (!res.ok) throw new Error(res.error)
    chapters.value.push(res.data)
    activeChapter.value = res.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '新建章节失败')
  }
}

async function renameChapter(id: string, title: string): Promise<void> {
  try {
    const res = await window.api.chapters.update(id, { title })
    if (!res.ok) throw new Error(res.error)
    const i = chapters.value.findIndex((c) => c.id === id)
    if (i >= 0) chapters.value[i] = res.data
    if (activeChapter.value?.id === id) activeChapter.value = res.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '重命名失败')
  }
}

async function moveChapter(id: string, dir: -1 | 1): Promise<void> {
  try {
    await flushSave()
    const res = await window.api.chapters.move(id, dir)
    if (!res.ok) throw new Error(res.error)
    if (!res.data) return // 已在边界
    const listRes = await window.api.chapters.list(bookId.value)
    if (listRes.ok) {
      chapters.value = listRes.data
      // 保持选中项跟随
      activeChapter.value = chapters.value.find((c) => c.id === activeChapter.value?.id) ?? chapters.value[0] ?? null
    }
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
    if (activeChapter.value?.id === target.id) {
      activeChapter.value = chapters.value[0] ?? null
    }
    toast.success(`「${target.title}」已删除`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败')
  } finally {
    pendingDelete.value = null
  }
}

/** 全局 Ctrl+S 兜底（编辑区 handleKeyDown 之外的焦点位置，如标题输入框） */
function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    void flushSave()
  }
}

onMounted(() => {
  void loadAll()
  window.addEventListener('keydown', onGlobalKeydown)
})
watch(bookId, () => void loadAll())
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  // 卸载前同步保存（路由切走）；异步竞态由 pendingContent 幂等性兜底
  void flushSave()
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div class="flex h-full">
    <ChapterSidebar
      :chapters="chapters"
      :active-id="activeChapter?.id ?? ''"
      :total-words="totalWords"
      :book-title="book?.title ?? '…'"
      :book-id="bookId"
      :sync-alert="syncAlert"
      @create="createChapter"
      @select="selectChapter"
      @rename="renameChapter"
      @remove="pendingDelete = $event"
      @move="moveChapter"
      @sync="openSyncDialog"
    />

    <ChapterEditor
      ref="editorRef"
      :key="activeChapter?.id ?? 'none'"
      :chapter="activeChapter"
      :book="book"
      :book-id="bookId"
      @content-change="onContentChange"
      @selection-change="onSelectionChange"
      @title-change="(t) => activeChapter && renameChapter(activeChapter.id, t)"
      @save-now="flushSave"
    />

    <AssistantDock
      :book-id="bookId"
      :book="book"
      :chapter-title="activeChapter?.title ?? ''"
      :chapter-content="activeChapter?.content?.replace(/<[^>]+>/g, '') ?? ''"
      :selection-text="editorSelection"
    />

    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除「${pendingDelete?.title ?? ''}」？`"
      description="章节正文将一并删除且不可恢复。"
      @confirm="doDelete"
    />

    <!-- 联动同步（M10.5/M10.7）：配置弹窗 + 三条候选确认面板 -->
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

    <div v-if="loading" class="fixed inset-0 z-30 flex items-center justify-center bg-paper/60">
      <p class="text-ink-text-muted">正在载入工作台…</p>
    </div>
  </div>
</template>
