<script setup lang="ts">
/**
 * 情节大纲事件节点卡片：毛玻璃 + 左侧标签渐变色条 + 标题/描述/标签/镶嵌词条图标。
 * 由 PlotCanvasView 经 Vue Flow 插槽 #node-event 渲染（纯展示，交互事件在视图层）。
 * 结构注意：连线手柄必须放在 overflow-hidden 内层卡片之外（否则手柄外半截被裁剪，
 * 中心点命中测试失败，拖线失灵——M10 自测实锤）。
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { PlotEvent } from '../../../../shared/plot.types'
import { tagColor } from '../../services/plotStyle'

interface Props {
  event: PlotEvent
  /** 词条名（视图层按 wikiRefs 解析后传入） */
  wikiNames: string[]
  selected: boolean
  /** 搜索命中高亮 */
  hit: boolean
  /** 搜索未命中置暗 */
  dim: boolean
}

const props = defineProps<Props>()

/** 左侧标签色条：取首个标签色做渐变；无标签回退灰紫 */
const barBackground = computed(() =>
  `linear-gradient(90deg, ${tagColor(props.event.tags[0] ?? '')}, #d8d2c2)`
)
</script>

<template>
  <!-- 外层：手柄挂载层（不裁剪）；置暗态作用于整体 -->
  <div class="w-[280px] cursor-pointer" :class="dim ? 'opacity-30' : ''">
    <!-- 连线手柄：左入右出（拖动边缘连线表达事件关系） -->
    <Handle type="target" :position="Position.Left" class="!h-3 !w-3 !border-2 !border-surface !bg-ink-primary" />
    <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !border-2 !border-surface !bg-ink-primary" />
    <!-- 内层：裁剪容器，圆角色条不溢出圆角 -->
    <div
      class="overflow-hidden rounded-xl border-2 bg-surface/85 shadow-card backdrop-blur-sm transition-all hover:shadow-lg"
      :class="[
        selected || hit ? 'border-ink-primary' : 'border-ink-border/70',
        hit ? 'ring-2 ring-ink-primary/40' : ''
      ]"
    >
      <div class="h-1.5 w-full" :style="{ background: barBackground }" />
      <div class="p-3">
        <h3 class="min-w-0 truncate text-sm font-semibold">{{ event.title }}</h3>
        <p class="mt-1.5 line-clamp-3 min-h-[3.6em] text-xs leading-5 text-ink-text-secondary">
          {{ event.description || '（无描述，双击编辑）' }}
        </p>
        <div v-if="event.tags.length" class="mt-2 flex flex-wrap items-center gap-1">
          <span
            v-for="t in event.tags.slice(0, 3)"
            :key="t"
            class="rounded-full px-1.5 py-0.5 text-[10px] text-white"
            :style="{ background: tagColor(t) }"
          >{{ t }}</span>
        </div>
        <div v-if="wikiNames.length" class="mt-1.5 flex flex-wrap gap-1">
          <span
            v-for="n in wikiNames.slice(0, 4)"
            :key="n"
            class="rounded border border-ink-border bg-paper px-1 text-[10px] text-ink-text-muted"
          >📖 {{ n }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
