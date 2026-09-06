/**
 * 剧情画布渲染层样式常量：连线四类型视觉（颜色/线型/展示名）与标签取色。
 * 前三类承接章节画布 M7.5 配色，reference 引用为 M10 新增（绿点线）。
 */
import type { PlotEdgeType } from '../../../shared/plot.types'

export const PLOT_EDGE_STYLES: Record<PlotEdgeType, { stroke: string; dash: string; label: string }> = {
  main: { stroke: '#c9a227', dash: '0', label: '主线' },
  logic: { stroke: '#5b9bd1', dash: '6 4', label: '逻辑' },
  relation: { stroke: '#9d97b5', dash: '2 4', label: '关联' },
  reference: { stroke: '#58a27a', dash: '1 4', label: '引用' }
}

/** 标签色板：事件节点左侧色条按首个标签取色（同一标签恒同色，标签决定节点视觉色，照原站文档） */
const TAG_PALETTE = ['#6c5ce7', '#c9a227', '#5b9bd1', '#3fa66a', '#e07b54', '#8b5fbf', '#d16a8a', '#4aa8a2']

export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}
