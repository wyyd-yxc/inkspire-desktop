<script setup lang="ts">
/**
 * 分歧推演结果弹窗：并列展示各方向候选事件卡，择一采纳上画布（照原站「选择最合适的一条继续」）。
 */
import type { PlotDirectionDraft } from '../../services/plotPrompts'
import { tagColor } from '../../services/plotStyle'

defineProps<{
  directions: PlotDirectionDraft[]
  anchorTitle: string
}>()

const emit = defineEmits<{
  adopt: [dir: PlotDirectionDraft]
  close: []
}>()
</script>

<template>
  <teleport to="body">
    <div
      v-if="directions.length"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="emit('close')"
    >
      <div class="max-h-[85%] w-[880px] overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">分歧推演 · 从「{{ anchorTitle }}」出发的 {{ directions.length }} 条走向</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="emit('close')">✕</button>
        </div>
        <p class="mt-1 text-xs text-ink-text-muted">
          对比各方向候选事件，点「采纳此方向」把该组事件铺上画布（其余方向不保留）
        </p>
        <div class="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div
            v-for="(d, i) in directions"
            :key="i"
            class="flex flex-col rounded-xl border border-ink-border/70 p-3 transition-colors hover:border-ink-primary/50"
          >
            <div class="flex items-center gap-2">
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-white"
                :style="{ background: tagColor(d.name) }"
              >{{ d.name }}</span>
              <span class="min-w-0 flex-1 truncate text-xs text-ink-text-secondary" :title="d.summary">{{ d.summary }}</span>
              <span class="shrink-0 text-[10px] text-ink-text-muted">{{ d.events.length }} 事件</span>
            </div>
            <ol class="mt-2 flex-1 space-y-1.5">
              <li v-for="(e, j) in d.events" :key="j" class="rounded-lg bg-paper px-2.5 py-1.5">
                <p class="text-xs font-medium">{{ j + 1 }}. {{ e.title }}</p>
                <p class="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-text-secondary">{{ e.description }}</p>
              </li>
            </ol>
            <button
              class="mt-3 rounded-lg bg-ink-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-ink-primary-hover"
              @click="emit('adopt', d)"
            >采纳此方向</button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
