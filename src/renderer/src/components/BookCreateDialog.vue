<script setup lang="ts">
/**
 * 新建书籍弹窗：书名（必填）+ 分类（单选）+ 简介（选填）。
 * 外部通过 v-model 控制显隐；确认时 emit('created', book)。
 */
import { reactive, ref, watch } from 'vue'
import { BOOK_GENRES, type Book, type BookGenre, type CreateBookInput } from '../../../shared/book.types'
import { bookService } from '../services/books'
import { useToast } from '@/composables/useToast'

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ created: [book: Book] }>()

const toast = useToast()
const submitting = ref(false)

const form = reactive<{ title: string; genre: BookGenre | ''; description: string }>({
  title: '',
  genre: '',
  description: ''
})

// 每次打开时重置表单
watch(visible, (v) => {
  if (v) {
    form.title = ''
    form.genre = ''
    form.description = ''
  }
})

/** 提交建书：校验书名 → 调服务 → 成功后关弹窗并通知父级 */
async function submit(): Promise<void> {
  if (!form.title.trim()) {
    toast.error('请填写书名')
    return
  }
  submitting.value = true
  try {
    const input: CreateBookInput = {
      title: form.title,
      genre: form.genre,
      description: form.description
    }
    const book = await bookService.create(input)
    toast.success(`《${book.title}》已创建`)
    visible.value = false
    emit('created', book)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '创建失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-scrim"
      @click.self="visible = false"
    >
      <div class="w-[480px] rounded-[12px] bg-surface p-6 shadow-card">
        <h2 class="mb-5 text-lg font-semibold">新建书籍</h2>

        <div class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">书名 *</span>
            <input
              v-model="form.title"
              type="text"
              maxlength="50"
              placeholder="给作品起一个名字"
              class="rounded-lg border border-ink-border-strong px-3 py-2 outline-none focus:border-ink-primary"
            />
          </label>

          <div class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">分类</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="g in BOOK_GENRES"
                :key="g"
                type="button"
                class="rounded-full border px-3 py-1 text-sm transition-colors"
                :class="
                  form.genre === g
                    ? 'border-ink-primary bg-ink-primary-soft text-ink-primary'
                    : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                "
                @click="form.genre = form.genre === g ? '' : g"
              >
                {{ g }}
              </button>
            </div>
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">简介</span>
            <textarea
              v-model="form.description"
              rows="3"
              maxlength="500"
              placeholder="一句话或一段话介绍这本书（选填）"
              class="resize-none rounded-lg border border-ink-border-strong px-3 py-2 outline-none focus:border-ink-primary"
            />
          </label>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-lg px-4 py-2 text-ink-text-secondary transition-colors hover:bg-ink-primary-soft"
            @click="visible = false"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-ink-primary px-5 py-2 text-on-primary transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? '创建中…' : '开始创作' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>
