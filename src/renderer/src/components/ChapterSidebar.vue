<script setup lang="ts">
/**
 * 章节侧栏：章节列表（新增/选中/重命名/删除/上下移），底部显示全书总字数。
 * 重命名采用行内编辑（双击或按钮进入编辑态）。
 */
import { computed, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { Chapter } from '../../../shared/chapter.types'

const props = defineProps<{
  chapters: Chapter[]
  activeId: string
  totalWords: number
  bookTitle: string
  bookId: string
}>()

const emit = defineEmits<{
  create: []
  select: [chapter: Chapter]
  rename: [id: string, title: string]
  remove: [chapter: Chapter]
  move: [id: string, dir: -1 | 1]
}>()

const router = useRouter()

const editingId = ref('')
const editingTitle = ref('')
/** v-for 内的函数式 ref 收集（Vue3 中 v-for 的字符串 ref 是数组，改用 id 映射避免误用） */
const editInputs = new Map<string, HTMLInputElement>()

function setEditInputRef(id: string, el: unknown): void {
  if (el instanceof HTMLInputElement) editInputs.set(id, el)
  else editInputs.delete(id)
}

/** 进入重命名编辑态 */
async function startRename(c: Chapter): Promise<void> {
  editingId.value = c.id
  editingTitle.value = c.title
  await nextTick()
  const input = editInputs.get(c.id)
  input?.focus()
  input?.select()
}

/** 提交重命名 */
function commitRename(): void {
  const id = editingId.value
  const title = editingTitle.value.trim()
  editingId.value = ''
  if (id && title) emit('rename', id, title)
}

const wordsLabel = computed(() => props.totalWords.toLocaleString('zh-CN'))
</script>

<template>
  <aside class="flex h-full w-60 shrink-0 flex-col border-r border-ink-border/60 bg-surface">
    <!-- 书籍信息 -->
    <div class="border-b border-ink-border/60 px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <router-link
          to="/"
          class="flex items-center gap-1 text-xs text-ink-text-muted transition-colors hover:text-ink-primary"
        >
          ← 书斋
        </router-link>
        <div class="flex items-center gap-1.5">
          <router-link
            :to="`/book/${bookId}/genesis`"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            title="创世台"
          >创世台</router-link>
          <router-link
            :to="`/book/${bookId}/wiki`"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            title="万物百科"
          >百科</router-link>
          <button
            class="rounded-full bg-ink-primary px-3 py-1 text-xs text-white transition-colors hover:bg-ink-primary-hover"
            @click="emit('create')"
          >+ 新章节</button>
        </div>
      </div>
      <p class="mt-2 truncate text-sm font-semibold" :title="bookTitle">{{ bookTitle }}</p>
    </div>

    <!-- 章节列表 -->
    <div class="flex-1 overflow-y-auto py-2">
      <p v-if="chapters.length === 0" class="px-4 py-8 text-center text-xs text-ink-text-muted">
        还没有章节，点上方「+ 新章节」开始
      </p>
      <div
        v-for="(c, i) in chapters"
        :key="c.id"
        class="group mx-2 mb-1 flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 transition-colors"
        :class="c.id === activeId ? 'bg-ink-primary-soft' : 'hover:bg-paper'"
        @click="emit('select', c)"
      >
        <span class="w-5 shrink-0 text-center text-xs text-ink-text-muted">{{ i + 1 }}</span>

        <input
          v-if="editingId === c.id"
          :ref="(el) => setEditInputRef(c.id, el)"
          v-model="editingTitle"
          class="min-w-0 flex-1 rounded border border-ink-primary bg-surface px-1.5 py-0.5 text-sm outline-none"
          @click.stop
          @keyup.enter="commitRename"
          @keyup.escape="editingId = ''"
          @blur="commitRename"
        />
        <template v-else>
          <span class="min-w-0 flex-1 truncate text-sm" :class="c.id === activeId ? 'text-ink-primary font-medium' : ''">
            {{ c.title }}
          </span>
          <span class="shrink-0 text-xs text-ink-text-muted group-hover:hidden">
            {{ c.wordCount ? c.wordCount.toLocaleString('zh-CN') + '字' : '' }}
          </span>
        </template>

        <!-- hover 操作 -->
        <div v-if="editingId !== c.id" class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary"
            title="章节画布"
            @click.stop="router.push(`/book/${props.bookId}/canvas/${c.id}`)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary disabled:opacity-30"
            :disabled="i === 0"
            title="上移"
            @click.stop="emit('move', c.id, -1)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary disabled:opacity-30"
            :disabled="i === chapters.length - 1"
            title="下移"
            @click.stop="emit('move', c.id, 1)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary"
            title="重命名"
            @click.stop="startRename(c)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-danger"
            title="删除章节"
            @click.stop="emit('remove', c)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div class="border-t border-ink-border/60 px-4 py-2.5 text-xs text-ink-text-muted">
      全书共 <span class="font-medium text-ink-text-secondary">{{ chapters.length }}</span> 章 ·
      <span class="font-medium text-ink-text-secondary">{{ wordsLabel }}</span> 字
    </div>
  </aside>
</template>
