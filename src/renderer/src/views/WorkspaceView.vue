<script setup lang="ts">
/**
 * 写作台页（M15.5 起为书内壳的子页）：章节树/同步栈/助手浮球已上移 BookShellLayout，
 * 本页专注编辑器编排——内容防抖自动保存（1.5s）+ Ctrl+S、路由 ?ch= 驱动选章（切章前保存旧章）。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import type { WikiEntry } from '../../../shared/wiki.types'
import type { Memory } from '../../../shared/memory.types'
import type { PlotEvent } from '../../../shared/plot.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { BOOK_SHELL_KEY } from '../layouts/shellContext'
import ChapterEditor from '@/components/ChapterEditor.vue'

const route = useRoute()
const toast = useToast()

const shell = inject(BOOK_SHELL_KEY)
if (!shell) throw new Error('写作台必须在书内导航壳内使用')
const { bookId, book, chapters, activeChapterId, editorCtx, renameChapter } = shell

const activeChapter = computed(
  () => chapters.value.find((c) => c.id === activeChapterId.value) ?? chapters.value[0] ?? null
)

const wikiEntries = ref<WikiEntry[]>([])
const memories = ref<Memory[]>([])
const plotEvents = ref<PlotEvent[]>([])
const loading = ref(true)

async function loadContexts(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [wikiRes, memRes, plotRes] = await Promise.all([
      window.api.wiki.list(bookId.value),
      window.api.memories.list(bookId.value),
      window.api.plot.list(bookId.value)
    ])
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    if (!memRes.ok) throw new Error(memRes.error)
    if (!plotRes.ok) throw new Error(plotRes.error)
    wikiEntries.value = wikiRes.data
    memories.value = memRes.data
    plotEvents.value = plotRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

const editorRef = ref<InstanceType<typeof ChapterEditor> | null>(null)

/** 待写盘的最新编辑状态（html+字数+归属章 id：路由切换后仍能落对章） */
const pendingContent = ref<{ html: string; wordCount: number; chapterId: string } | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null

/** 立即保存（跳过防抖）：按 pending 归属章落盘——首次切离默认章（无 ?ch 旧值）同样正确 */
async function flushSave(): Promise<void> {
  const pending = pendingContent.value
  if (!pending) return
  const target = chapters.value.find((c) => c.id === pending.chapterId)
  if (!target) {
    pendingContent.value = null // 归属章已被删除：丢弃草稿
    return
  }
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
  if (!activeChapter.value) return
  pendingContent.value = { html, wordCount, chapterId: activeChapter.value.id }
  editorRef.value?.setSaveState('dirty')
  // 本地即时更新字数显示（不等落盘；壳章节树同数组实时跟随）
  const i = chapters.value.findIndex((c) => c.id === activeChapter.value!.id)
  if (i >= 0) chapters.value[i] = { ...chapters.value[i], wordCount }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushSave(), 1500)
}

/** 路由切章（壳章节树点击/新建/删除驱动）：切走前保存未落盘草稿（按归属章落盘） */
watch(
  () => route.query.ch,
  () => {
    if (route.name !== 'workspace') return
    void flushSave()
  }
)

/** 编辑器选区文字（M9 助手上下文感知）：写入壳上下文供助手浮球读取 */
function onSelectionChange(text: string): void {
  editorCtx.selection = text
}

/** 助手上下文回写：标题/正文跟随当前章节；离开写作台时清空（onBeforeUnmount） */
watchEffect(() => {
  editorCtx.title = activeChapter.value?.title ?? ''
  editorCtx.content = (activeChapter.value?.content ?? '').replace(/<[^>]+>/g, '')
})

/** 全局 Ctrl+S 兜底（编辑区 handleKeyDown 之外的焦点位置，如标题输入框） */
function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    void flushSave()
  }
}

onMounted(() => {
  void loadContexts()
  window.addEventListener('keydown', onGlobalKeydown)
})
watch(bookId, () => void loadContexts())
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  // 卸载前同步保存（路由切走）；异步竞态由 pendingContent 幂等性兜底
  void flushSave()
  if (saveTimer) clearTimeout(saveTimer)
  editorCtx.title = ''
  editorCtx.content = ''
  editorCtx.selection = ''
})
</script>

<template>
  <div class="h-full">
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

    <div v-if="loading" class="fixed inset-0 z-30 flex items-center justify-center bg-paper/60">
      <p class="text-ink-text-muted">正在载入写作台…</p>
    </div>
  </div>
</template>
