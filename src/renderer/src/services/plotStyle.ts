/**
 * 情节大纲渲染层样式常量：连线四类型视觉（颜色/线型/展示名）与标签取色。
 * M10.8 严肃化：低饱和墨系配色（炭/黛/赭/青灰/橄榄/绛），降低彩度。
 */
import type { PlotEdgeType } from '../../../shared/plot.types'

export const PLOT_EDGE_STYLES: Record<PlotEdgeType, { stroke: string; dash: string; label: string }> = {
  main: { stroke: '#8a6d2f', dash: '0', label: '主线' },
  logic: { stroke: '#4a6f8a', dash: '6 4', label: '逻辑' },
  relation: { stroke: '#8b8574', dash: '2 4', label: '关联' },
  reference: { stroke: '#5c7d63', dash: '1 4', label: '引用' }
}

/** 标签色板：事件节点左侧色条按首个标签取色（同一标签恒同色）。
 *  16 色低饱和墨系（M10.8 严肃化），保留哈希取色的稳定性 */
const TAG_PALETTE = [
  '#6b5f4a', '#8a6d2f', '#4a6f8a', '#5c7d63',
  '#a1663f', '#6d5a7d', '#96555f', '#47807a',
  '#8a6a4a', '#5f7050', '#8a5560', '#4a6a80',
  '#75628a', '#96774a', '#5f7d6d', '#665f8a'
]

export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}
