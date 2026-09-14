<script setup lang="ts">
/**
 * 设置中心「外观」分区（M17）：浅色（案头纸墨）/ 深色（深夜书房）/ 跟随系统。
 * 即改即存（settings 键 ui.theme）；实际主题由 composables/useTheme 切换 html[data-theme]。
 */
import { computed } from 'vue'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const { mode, setMode } = useTheme()

const OPTIONS: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'light', label: '浅色', hint: '案头纸墨' },
  { value: 'dark', label: '深色', hint: '深夜书房' },
  { value: 'system', label: '跟随系统', hint: '随系统设置切换' }
]

const current = computed(() => mode.value)

async function pick(v: ThemeMode): Promise<void> {
  if (v === mode.value) return
  await setMode(v)
  const label = OPTIONS.find((o) => o.value === v)?.label ?? v
  toast.success(`外观已切换为「${label}」`)
}
</script>

<template>
  <section class="mb-6 rounded-card bg-surface p-5 shadow-card">
    <h2 class="mb-1 font-semibold">外观</h2>
    <p class="mb-4 text-sm leading-relaxed text-ink-text-secondary">
      切换界面主题。浅色为案头纸墨（默认），深色为深夜书房（夜间写作更护眼）。
    </p>
    <div class="flex gap-2">
      <button
        v-for="o in OPTIONS"
        :key="o.value"
        class="flex flex-col items-start rounded-lg border px-4 py-2.5 text-left transition-colors"
        :class="
          current === o.value
            ? 'border-ink-primary bg-ink-primary-soft'
            : 'border-ink-border hover:border-ink-primary'
        "
        @click="pick(o.value)"
      >
        <span class="text-sm font-medium" :class="current === o.value ? 'text-ink-primary' : 'text-ink-text'">
          {{ o.label }}
        </span>
        <span class="mt-0.5 text-xs text-ink-text-muted">{{ o.hint }}</span>
      </button>
    </div>
  </section>
</template>