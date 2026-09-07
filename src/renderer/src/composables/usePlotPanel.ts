/**
 * 剧情事件详情面板与删除编排（从 PlotCanvasView 抽出以保单文件 ≤400 行）：
 * 新建/编辑面板状态、保存落库、删除确认与级联清理（本地连线同步）。
 */
import { ref, type ComputedRef, type Ref } from 'vue'
import type { PlotEvent } from '../../../shared/plot.types'
import type { useToast } from './useToast'

export function usePlotPanel(deps: {
  bookId: ComputedRef<string>
  events: Ref<PlotEvent[]>
  plotEdges: Ref<import('../../../shared/plot.types').PlotEdge[]>
  selectedEvent: Ref<PlotEvent | null>
  toast: ReturnType<typeof useToast>
}) {
  const { bookId, events, plotEdges, selectedEvent, toast } = deps

  const panelVisible = ref(false)
  const panelEvent = ref<PlotEvent | null>(null)
  const panelCreatePos = ref({ x: 320, y: 240 })
  const pendingDelete = ref<PlotEvent | null>(null)

  function openPanel(e: PlotEvent): void {
    panelEvent.value = e
    panelVisible.value = true
  }

  function openCreate(): void {
    // 新事件落最后：取现有最大 x 右移一格
    const last = events.value.reduce<PlotEvent | null>(
      (acc, e) => (!acc || e.posX > acc.posX ? e : acc),
      null
    )
    panelEvent.value = null
    panelCreatePos.value = { x: (last?.posX ?? 0) + 340, y: 240 }
    panelVisible.value = true
  }

  /** 面板保存（新建/更新）。payload 含子组件响应式数组，深拷贝过 IPC（踩坑 #11） */
  async function savePanel(payload: {
    title: string
    description: string
    tags: string[]
    wikiRefs: string[]
  }): Promise<void> {
    if (!payload.title.trim()) {
      toast.error('事件标题不能为空')
      return
    }
    try {
      const plain = JSON.parse(JSON.stringify(payload))
      if (panelEvent.value) {
        const res = await window.api.plot.update(panelEvent.value.id, plain)
        if (!res.ok) throw new Error(res.error)
        const i = events.value.findIndex((x) => x.id === res.data.id)
        if (i >= 0) events.value[i] = res.data
        toast.success('事件已保存')
      } else {
        const res = await window.api.plot.create({
          bookId: bookId.value,
          ...plain,
          posX: panelCreatePos.value.x,
          posY: panelCreatePos.value.y
        })
        if (!res.ok) throw new Error(res.error)
        events.value.push(res.data)
        toast.success('事件已创建')
      }
      panelVisible.value = false
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  function confirmRemove(e: PlotEvent): void {
    pendingDelete.value = e
  }

  async function doRemove(): Promise<void> {
    const target = pendingDelete.value
    if (!target) return
    pendingDelete.value = null
    try {
      const res = await window.api.plot.remove(target.id)
      if (!res.ok) throw new Error(res.error)
      events.value = events.value.filter((x) => x.id !== target.id)
      // 本地同步清理关联连线（DB 层 FK 级联已删）
      plotEdges.value = plotEdges.value.filter(
        (x) => x.sourceId !== target.id && x.targetId !== target.id
      )
      if (selectedEvent.value?.id === target.id) selectedEvent.value = null
      panelVisible.value = false
      toast.success('事件已删除')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  return {
    panelVisible,
    panelEvent,
    pendingDelete,
    openPanel,
    openCreate,
    savePanel,
    confirmRemove,
    doRemove
  }
}
