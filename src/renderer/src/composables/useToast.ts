/**
 * 全局轻量提示（toast）：任意组件调 toast.success/error()，App.vue 挂 <ToastHost/> 呈现。
 * 不引第三方库，避免为一个提示功能增加依赖。
 */
import { ref } from 'vue'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

const items = ref<ToastItem[]>([])
let seq = 0

function push(kind: ToastKind, text: string, durationMs = 2600): void {
  const id = ++seq
  items.value.push({ id, kind, text })
  setTimeout(() => {
    items.value = items.value.filter((t) => t.id !== id)
  }, durationMs)
}

export function useToast() {
  return {
    items,
    success: (text: string) => push('success', text),
    error: (text: string) => push('error', text, 4000),
    info: (text: string) => push('info', text)
  }
}
