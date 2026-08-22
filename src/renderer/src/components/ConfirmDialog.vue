<script setup lang="ts">
/**
 * 通用危险操作确认弹窗：标题 + 描述 + 取消/确认（红色）。
 * 用 v-model 控制显隐；确认时 emit('confirm')，具体操作由父组件执行。
 */
const visible = defineModel<boolean>({ default: false })

defineProps<{
  title: string
  description: string
  confirmText?: string
}>()

const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="visible = false"
    >
      <div class="w-[400px] rounded-2xl bg-surface p-6 shadow-card">
        <h2 class="mb-2 text-base font-semibold">{{ title }}</h2>
        <p class="mb-6 text-sm leading-relaxed text-ink-text-secondary">{{ description }}</p>
        <div class="flex justify-end gap-3">
          <button
            class="rounded-lg px-4 py-2 text-ink-text-secondary transition-colors hover:bg-ink-primary-soft"
            @click="visible = false"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-ink-danger px-4 py-2 text-white transition-colors hover:brightness-110"
            @click="emit('confirm'); visible = false"
          >
            {{ confirmText ?? '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>
