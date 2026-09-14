<script setup lang="ts">
/**
 * 通用候选确认弹窗（M10.5）：同步/抽取/合并类产出的勾选式采纳面板。
 * 纯展示组件：条目由父组件给定，确认时回传勾选项；禁用项灰显不可勾（如已存在）。
 */
import { computed, ref, watch } from 'vue'
import type { SyncCandidateItem } from '../../../../shared/sync.types'

interface Props {
  visible: boolean
  title: string
  description?: string
  confirmText?: string
  items: SyncCandidateItem[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [items: SyncCandidateItem[]]
  close: []
}>()

// 打开时复制一份本地勾选态，避免直接改父组件数据
const local = ref<SyncCandidateItem[]>([])

watch(
  () => props.visible,
  (v) => {
    if (v) local.value = props.items.map((it) => ({ ...it }))
  },
  { immediate: true }
)

const selectable = computed(() => local.value.filter((it) => !it.disabled))
const allChecked = computed(
  () => selectable.value.length > 0 && selectable.value.every((it) => it.checked)
)
const checkedCount = computed(() => local.value.filter((it) => it.checked && !it.disabled).length)

function toggleAll(): void {
  const next = !allChecked.value
  for (const it of selectable.value) it.checked = next
}

function confirm(): void {
  emit(
    'confirm',
    local.value.filter((it) => it.checked && !it.disabled)
  )
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="emit('close')"
    >
      <div class="flex max-h-[82%] w-[560px] flex-col rounded-[12px] bg-surface shadow-2xl">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
          <h2 class="font-semibold">{{ title }}</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="emit('close')">✕</button>
        </div>
        <div class="px-5 py-3">
          <p v-if="description" class="text-xs text-ink-text-muted">{{ description }}</p>
          <label class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-text-secondary">
            <input type="checkbox" :checked="allChecked" @change="toggleAll" />
            全选（已选 {{ checkedCount }}/{{ selectable.length }}）
          </label>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          <label
            v-for="it in local"
            :key="it.key"
            class="mb-1.5 flex cursor-pointer items-start gap-2 rounded-lg border border-ink-border/60 px-3 py-2 transition-colors hover:border-ink-primary/50"
            :class="it.disabled ? 'opacity-50' : ''"
          >
            <input
              type="checkbox"
              class="mt-1"
              :checked="it.checked"
              :disabled="it.disabled"
              @change="it.checked = !it.checked"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span
                  v-if="it.tag"
                  class="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] text-white"
                  :style="it.tagColor ? { background: it.tagColor } : { background: '#6b5f4a' }"
                >{{ it.tag }}</span>
                <span class="min-w-0 flex-1 truncate text-sm" :title="it.title">{{ it.title }}</span>
                <span v-if="it.disabled" class="shrink-0 text-[10px] text-ink-text-muted">已存在，跳过</span>
              </span>
              <span v-if="it.oldText" class="mt-1 block rounded-sm bg-paper px-2 py-1">
                <span class="block text-[11px] leading-4 text-ink-text-secondary">原文：{{ it.oldText }}</span>
                <span class="mt-0.5 block text-[11px] leading-4 text-ink-primary">改为：{{ it.newText }}</span>
              </span>
              <span v-else-if="it.detail" class="mt-0.5 block text-xs leading-5 text-ink-text-secondary">{{ it.detail }}</span>
              <span v-if="it.source" class="mt-0.5 block text-[10px] text-ink-text-muted">{{ it.source }}</span>
            </span>
          </label>
        </div>
        <div class="flex justify-end gap-2 border-t border-ink-border/60 px-5 py-3">
          <button
            class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
            @click="emit('close')"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="checkedCount === 0"
            @click="confirm"
          >{{ confirmText ?? '采纳所选项' }}（{{ checkedCount }}）</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
