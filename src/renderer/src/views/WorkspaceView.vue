<script setup lang="ts">
/**
 * 正文工作台页：左章节树 + 中编辑器。
 * 数据编排：章节列表加载/CRUD、编辑器内容防抖自动保存（1.5s）+ Ctrl+S、切换章节前保存。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import ChapterSidebar from '@/components/ChapterSidebar.vue'
import ChapterEditor from '@/components/ChapterEditor.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const toast = useToast()
const bookId = route.params.bookId as string

const book = ref<Book | null>(null)
const chapters = ref<Chapter[]>([])
const activeChapter = ref<Chapter | null>(null)
const pendingDelete = ref<Chapter | null>(null)
const loading = ref(true)

const editorRef = ref<InstanceType<typeof ChapterEditor> | null>(null)

/** 待写盘的最新编辑状态（html+字数） */
const pendingContent = ref<{ html: string; wordCount: number } | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let isSwitching = false

const totalWords = computed(() => chapters.value.reduce((s, c) => s + c.wordCount, 0))

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, chaptersRes] = await Promise.all([
      window.api.books.list(),
      window.api.chapters.list(bookId)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId) ?? null
    chapters.value = chaptersRes.data
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
    const res = await window.api.chapters.create({ bookId })
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
    const listRes = await window.api.chapters.list(bookId)
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
    const listRes = await window.api.chapters.list(bookId)
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
      @create="createChapter"
      @select="selectChapter"
      @rename="renameChapter"
      @remove="pendingDelete = $event"
      @move="moveChapter"
    />

    <ChapterEditor
      ref="editorRef"
      :key="activeChapter?.id ?? 'none'"
      :chapter="activeChapter"
      :book="book"
      @content-change="onContentChange"
      @title-change="(t) => activeChapter && renameChapter(activeChapter.id, t)"
      @save-now="flushSave"
    />

    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除「${pendingDelete?.title ?? ''}」？`"
      description="章节正文将一并删除且不可恢复。"
      @confirm="doDelete"
    />

    <div v-if="loading" class="fixed inset-0 z-30 flex items-center justify-center bg-paper/60">
      <p class="text-ink-text-muted">正在载入工作台…</p>
    </div>
  </div>
</template>
