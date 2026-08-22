<script setup lang="ts">
/**
 * 书籍卡片：封面（默认渐变+书名首字）+ 书名 + 分类标签 + 简介 + 更新时间。
 * hover 显示操作按钮（删除）；点击卡片进入创作（M3 接路由）。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import { BOOK_GENRES } from '../../../shared/book.types'

const props = defineProps<{ book: Book }>()
const emit = defineEmits<{ delete: [book: Book] }>()
const router = useRouter()

/** 封面渐变按书名 hash 稳定取色，避免每次渲染闪变 */
const coverStyle = computed(() => {
  const palettes = [
    'linear-gradient(135deg,#8b7cf0,#5b4bd1)',
    'linear-gradient(135deg,#7cc7b8,#3d8b79)',
    'linear-gradient(135deg,#f0a58b,#c96a4a)',
    'linear-gradient(135deg,#8ba6e8,#4a6bc9)',
    'linear-gradient(135deg,#d897c9,#a55a92)'
  ]
  let h = 0
  for (const ch of props.book.title) h = (h * 31 + ch.codePointAt(0)!) % 997
  return { backgroundImage: palettes[h % palettes.length] }
})

const genreLabel = computed(() =>
  (BOOK_GENRES as readonly string[]).includes(props.book.genre) ? props.book.genre : '未分类'
)

const statusLabel: Record<string, string> = {
  writing: '创作中',
  finished: '已完结',
  archived: '已封存'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** 点击卡片进入正文工作台 */
function openBook(): void {
  void router.push(`/book/${props.book.id}/write`)
}
</script>

<template>
  <div
    class="group relative flex cursor-pointer flex-col overflow-hidden rounded-card bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    @click="openBook"
  >
    <!-- 封面区 -->
    <div class="relative flex h-40 items-center justify-center text-white" :style="coverStyle">
      <span class="text-5xl font-bold drop-shadow-md">{{ book.title.slice(0, 1) }}</span>
      <span
        v-if="book.status !== 'writing'"
        class="absolute left-2 top-2 rounded-full bg-black/25 px-2 py-0.5 text-xs"
      >
        {{ statusLabel[book.status] }}
      </span>
    </div>

    <!-- 信息区 -->
    <div class="flex flex-1 flex-col gap-1.5 p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="truncate font-semibold">{{ book.title }}</h3>
        <span class="shrink-0 rounded-full bg-ink-primary-soft px-2 py-0.5 text-xs text-ink-primary">
          {{ genreLabel }}
        </span>
      </div>
      <p class="line-clamp-2 min-h-8 text-sm text-ink-text-secondary">
        {{ book.description || '暂无简介' }}
      </p>
      <p class="mt-auto pt-1 text-xs text-ink-text-muted">更新于 {{ formatDate(book.updatedAt) }}</p>
    </div>

    <!-- hover 删除按钮 -->
    <button
      class="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white transition-colors hover:bg-ink-danger group-hover:flex"
      title="删除此书"
      @click.stop="emit('delete', book)"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  </div>
</template>
