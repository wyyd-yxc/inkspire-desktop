<script setup lang="ts">
/**
 * 书斋页：全部作品的管理中心。
 * 布局：顶部标题栏（墨灵 logo + 新建按钮）+ 书籍卡片网格 + 空状态引导。
 */
import { onMounted, ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import { bookService } from '../services/books'
import { useToast } from '@/composables/useToast'
import BookCard from '@/components/BookCard.vue'
import BookCreateDialog from '@/components/BookCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const toast = useToast()
const books = ref<Book[]>([])
const loading = ref(true)

const showCreate = ref(false)
const pendingDelete = ref<Book | null>(null)

/** 拉取书籍列表 */
async function refresh(): Promise<void> {
  loading.value = true
  try {
    books.value = await bookService.list()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载书架失败')
  } finally {
    loading.value = false
  }
}

/** 确认删除：调服务并刷新 */
async function doDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  try {
    const ok = await bookService.remove(target.id)
    if (!ok) throw new Error('书籍不存在')
    toast.success(`《${target.title}》已删除`)
    await refresh()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败')
  } finally {
    pendingDelete.value = null
  }
}

onMounted(refresh)
</script>

<template>
  <div class="h-full overflow-y-auto">
    <!-- 顶栏 -->
    <header class="sticky top-0 z-10 flex items-center justify-between border-b border-ink-border/60 bg-paper/80 px-8 py-4 backdrop-blur">
      <div class="flex items-baseline gap-3">
        <h1 class="text-xl font-bold tracking-widest text-ink-primary">墨灵</h1>
        <span class="text-sm text-ink-text-muted">书斋</span>
      </div>
      <div class="flex items-center gap-3">
        <router-link
          to="/settings"
          class="flex h-9 w-9 items-center justify-center rounded-full border border-ink-border text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
          title="设置中心"
        >
          <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </router-link>
        <button
          class="flex items-center gap-1.5 rounded-full bg-ink-primary px-4 py-2 text-sm text-white shadow-card transition-colors hover:bg-ink-primary-hover"
          @click="showCreate = true"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建书籍
        </button>
      </div>
    </header>

    <!-- 内容区 -->
    <main class="px-8 py-6">
      <!-- 加载中 -->
      <div v-if="loading" class="py-24 text-center text-ink-text-muted">正在加载书斋…</div>

      <!-- 空状态 -->
      <div v-else-if="books.length === 0" class="flex flex-col items-center gap-4 py-24">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-ink-primary-soft">
          <svg viewBox="0 0 24 24" class="h-9 w-9 text-ink-primary" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
            <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
          </svg>
        </div>
        <p class="text-ink-text-secondary">还没有作品，从一个书名开始你的故事</p>
        <button
          class="rounded-full bg-ink-primary px-6 py-2.5 text-white transition-colors hover:bg-ink-primary-hover"
          @click="showCreate = true"
        >
          新建第一本书
        </button>
      </div>

      <!-- 书籍网格 -->
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
        <BookCard
          v-for="b in books"
          :key="b.id"
          :book="b"
          @delete="pendingDelete = $event"
        />
      </div>
    </main>

    <!-- 弹窗们 -->
    <BookCreateDialog v-model="showCreate" @created="refresh" />
    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除《${pendingDelete?.title ?? ''}》？`"
      description="删除后书籍数据不可恢复，请谨慎操作。"
      @confirm="doDelete"
    />
  </div>
</template>
