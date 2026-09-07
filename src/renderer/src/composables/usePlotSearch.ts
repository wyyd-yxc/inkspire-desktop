/**
 * 情节大纲搜索高亮（从 PlotCanvasView 抽出以保单文件 ≤400 行）：
 * 关键词命中（标题/描述/标签）→ 匹配节点高亮、不匹配变暗（照原站文档）。
 */
import { computed, ref } from 'vue'
import type { PlotEvent } from '../../../shared/plot.types'

export function usePlotSearch(events: () => PlotEvent[]) {
  const searchKeyword = ref('')
  function isHit(e: PlotEvent): boolean {
    const k = searchKeyword.value.trim().toLowerCase()
    if (!k) return true
    return (
      e.title.toLowerCase().includes(k) ||
      e.description.toLowerCase().includes(k) ||
      e.tags.some((t) => t.toLowerCase().includes(k))
    )
  }
  const hitCount = computed(() => events().filter((e) => isHit(e)).length)
  return { searchKeyword, isHit, hitCount }
}
