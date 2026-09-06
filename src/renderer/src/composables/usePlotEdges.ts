/**
 * 剧情画布连线编辑逻辑：创建/选中/改类型标签/删除 + DB→Vue Flow 样式映射。
 * 从 PlotCanvasView 抽出以保单文件 ≤400 行（编码规范 §6）。
 * 注意：Vue Flow 事件均为单参数载荷 {event, edge}（踩坑 #17）。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Edge } from '@vue-flow/core'
import type { PlotEdge, PlotEdgeType } from '../../../shared/plot.types'
import type { useToast } from './useToast'
import { PLOT_EDGE_STYLES } from '../services/plotStyle'

export function usePlotEdges(deps: {
  bookId: ComputedRef<string>
  plotEdges: Ref<PlotEdge[]>
  toast: ReturnType<typeof useToast>
}) {
  const { bookId, plotEdges, toast } = deps

  const selectedEdge = ref<PlotEdge | null>(null)
  const edgeForm = ref({ type: 'main' as PlotEdgeType, label: '' })

  /** DB 连线 → Vue Flow Edge（样式按类型，label 上边） */
  const flowEdges = computed<Edge[]>(() =>
    plotEdges.value.map((e) => {
      const st = PLOT_EDGE_STYLES[e.type] ?? PLOT_EDGE_STYLES.relation
      return {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: 'smoothstep',
        label: e.label || st.label,
        labelBgStyle: { fill: '#f5f3fa' },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        style: { stroke: st.stroke, strokeWidth: 2, strokeDasharray: st.dash }
      }
    })
  )

  /** 拖线连接完成：校验 + 落库（连接参数含句柄对象，仅取 id） */
  async function onConnect(params: { source: string; target: string }): Promise<void> {
    if (params.source === params.target) {
      toast.error('不能连接事件到自身')
      return
    }
    try {
      const res = await window.api.plotEdges.create({
        bookId: bookId.value,
        sourceId: params.source,
        targetId: params.target
      })
      if (!res.ok) throw new Error(res.error)
      if (!plotEdges.value.some((x) => x.id === res.data.id)) plotEdges.value.push(res.data)
      // 连线默认主线：创建后自动选中打开编辑器，便于立即切换类型/加标签
      selectedEdge.value = res.data
      edgeForm.value = { type: res.data.type, label: res.data.label }
      toast.success('连线已创建（可在上方编辑器调整类型与标签）')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '连线失败')
    }
  }

  /** 单击选中连线 → 工具栏编辑器 */
  function onEdgeClick(payload: { edge: { id: string } }): void {
    const e = plotEdges.value.find((x) => x.id === payload.edge.id)
    if (!e) return
    selectedEdge.value = e
    edgeForm.value = { type: e.type, label: e.label }
  }

  /** 保存连线编辑（类型/标签）。表单为响应式对象，深拷贝过 IPC（踩坑 #11） */
  async function saveEdgeEdit(): Promise<void> {
    const target = selectedEdge.value
    if (!target) return
    try {
      const plain = JSON.parse(JSON.stringify({ type: edgeForm.value.type, label: edgeForm.value.label }))
      const res = await window.api.plotEdges.update(target.id, plain)
      if (!res.ok) throw new Error(res.error)
      const i = plotEdges.value.findIndex((x) => x.id === res.data.id)
      if (i >= 0) plotEdges.value[i] = res.data
      selectedEdge.value = res.data
      toast.success('连线已更新')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    }
  }

  /** 删除选中连线 */
  async function removeSelectedEdge(): Promise<void> {
    const target = selectedEdge.value
    if (!target) return
    const res = await window.api.plotEdges.remove(target.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    plotEdges.value = plotEdges.value.filter((x) => x.id !== target.id)
    selectedEdge.value = null
    toast.success('连线已删除')
  }

  let lastSelfLoopTipAt = 0
  /** 连线校验：同节点直接拒绝并提示（Vue Flow 会在 connect 事件前静默丢弃自环，M10 黑盒问题 2） */
  function isValidConnection(params: { source: string; target: string }): boolean {
    if (params.source === params.target) {
      const now = Date.now()
      if (now - lastSelfLoopTipAt > 1500) {
        lastSelfLoopTipAt = now
        toast.error('不能连接事件到自身')
      }
      return false
    }
    return true
  }

  return {
    selectedEdge,
    edgeForm,
    flowEdges,
    onConnect,
    onEdgeClick,
    saveEdgeEdit,
    removeSelectedEdge,
    isValidConnection
  }
}
