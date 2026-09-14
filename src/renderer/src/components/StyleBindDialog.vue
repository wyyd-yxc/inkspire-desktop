<script setup lang="ts">
/**
 * 书籍风格包绑定小弹窗（M12）：不绑定（用构思台预设）/ 选择一个用户风格包。
 * 纯表单组件：保存走 books:update（styleProfileId），父层经 saved 事件刷新书列表。
 */
import { ref, watch } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { StyleProfile } from '../../../shared/style.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ book: Book }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [book: Book] }>()

const toast = useToast()
const saving = ref(false)
const styles = ref<StyleProfile[]>([])
/** '' = 不绑定 */
const selection = ref('')

watch(visible, async (v) => {
  if (!v) return
  selection.value = props.book.styleProfileId ?? ''
  if (!isElectron) return
  const res = await window.api.styles.list()
  if (res.ok) styles.value = res.data
})

async function save(): Promise<void> {
  if (!isElectron || saving.value) return
  saving.value = true
  try {
    const res = await window.api.books.update(props.book.id, {
      styleProfileId: selection.value || null
    })
    if (!res.ok) throw new Error(res.error)
    toast.success(
      selection.value
        ? `已绑定文风包「${styles.value.find((s) => s.id === selection.value)?.name ?? ''}」`
        : '已解绑文风包，将使用构思台「基调」步的预设文风'
    )
    visible.value = false
    emit('saved', res.data)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '绑定失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
      @click.self="visible = false"
    >
      <div class="flex max-h-[80vh] w-[420px] flex-col rounded-[12px] bg-surface shadow-card">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
          <h2 class="text-base font-semibold">绑定文风 · {{ book.title }}</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="visible = false">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-3">
          <p class="mb-2 text-xs text-ink-text-muted">
            绑定后 AI 写作遵守此包；不绑定则用构思台「基调」步的预设文风（绑定优先）。
          </p>
          <label
            class="mb-1.5 flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
            :class="selection === '' ? 'border-ink-primary bg-ink-primary-soft/50' : 'border-ink-border'"
          >
            <input v-model="selection" type="radio" name="style-bind" value="" class="mt-1" />
            <span>
              <span class="font-medium">不绑定</span>
              <span class="ml-1 text-xs text-ink-text-muted">使用构思台「基调」步的预设文风</span>
            </span>
          </label>
          <p v-if="styles.length === 0" class="px-1 py-2 text-xs text-ink-text-muted">
            还没有自建风格包，可到「设置 → 作品风格包」创建
          </p>
          <label
            v-for="s in styles"
            :key="s.id"
            class="mb-1.5 flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
            :class="selection === s.id ? 'border-ink-primary bg-ink-primary-soft/50' : 'border-ink-border'"
          >
            <input v-model="selection" type="radio" name="style-bind" :value="s.id" class="mt-1" />
            <span class="min-w-0">
              <span class="font-medium">{{ s.name }}</span>
              <span class="block truncate text-xs text-ink-text-secondary" :title="s.tone">{{ s.tone }}</span>
            </span>
          </label>
        </div>
        <div class="flex justify-end gap-3 border-t border-ink-border/60 px-5 py-3">
          <button
            class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary transition-colors hover:bg-ink-primary-soft"
            @click="visible = false"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-4 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover disabled:opacity-40"
            :disabled="saving"
            @click="save"
          >{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
