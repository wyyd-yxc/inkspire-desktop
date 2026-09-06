<script setup lang="ts">
/**
 * 全局 toast 呈现容器：固定悬浮于顶部中央，自动消失（见 useToast.ts）。
 */
import { useToast } from '@/composables/useToast'

const toast = useToast()

const kindClass: Record<string, string> = {
  success: 'border-ink-success/40 text-ink-success',
  error: 'border-ink-danger/40 text-ink-danger',
  info: 'border-ink-primary/40 text-ink-primary'
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-5 z-50 flex flex-col items-center gap-2">
    <transition-group name="toast">
      <div
        v-for="t in toast.items.value"
        :key="t.id"
        class="rounded-lg border bg-surface px-4 py-2 text-sm shadow-card"
        :class="kindClass[t.kind]"
      >
        {{ t.text }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
