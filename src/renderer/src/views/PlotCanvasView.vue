<script setup lang="ts">
/**
 * 剧情画布：Vue Flow 跨章节剧情事件编排（M10）。
 * 事件节点拖拽持久化；四类连线（主线/逻辑/关联/引用）；双击详情面板；搜索高亮。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { VueFlow, useVueFlow, type Node, type Edge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { Book } from '../../../shared/book.types'
import type { PlotEdge, PlotEdgeType, PlotEvent } from '../../../shared/plot.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { PLOT_EDGE_STYLES } from '../services/plotStyle'
import PlotEventNode from '@/components/plot/PlotEventNode.vue'
import PlotDetailPanel from '@/components/plot/PlotDetailPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

/** 节点插槽 data 形态 */
interface EventNodeData {
  event: PlotEvent
  wikiNames: string[]
  selected: boolean
  hit: boolean
  dim: boolean
}

const route = useRoute()
const toast = useToast()
// 响应式路由参数（防同路由跨书导航组件复用拿旧 id）
const bookId = computed(() => route.params.bookId as string)

const book = ref<Pick<Book, 'title' | 'genre' | 'description'> | null>(null)
const events = ref<PlotEvent[]>([])
const plotEdges = ref<PlotEdge[]>([])
const wikiEntries = ref<WikiEntry[]>([])
const loading = ref(true)

const { fitView } = useVueFlow()

// ---- 搜索高亮（照原站：匹配节点高亮描边、不匹配变暗） ----
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
const hitCount = computed(() => events.value.filter((e) => isHit(e)).length)

// ---- 选中态 ----
const selectedEvent = ref<PlotEvent | null>(null)
const selectedEdge = ref<PlotEdge | null>(null)
const edgeForm = ref({ type: 'main' as PlotEdgeType, label: '' })

/** Vue Flow 节点派生（含搜索命中态；交互事件均为单参数载荷，踩坑 #17） */
const nodes = computed<Node[]>(() =>
  events.value.map((e) => ({
    id: e.id,
    type: 'event',
    position: { x: e.posX, y: e.posY },
    data: {
      event: e,
      wikiNames: e.wikiRefs.map((rid) => wikiEntries.value.find((w) => w.id === rid)?.name ?? '?'),
      selected: selectedEvent.value?.id === e.id,
      hit: !!searchKeyword.value.trim() && isHit(e),
      dim: !!searchKeyword.value.trim() && !isHit(e)
    } satisfies EventNodeData
  }))
)

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

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, eventsRes, edgesRes, wikiRes] = await Promise.all([
      window.api.books.list(),
      window.api.plot.list(bookId.value),
      window.api.plotEdges.list(bookId.value),
      window.api.wiki.list(bookId.value)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!eventsRes.ok) throw new Error(eventsRes.error)
    if (!edgesRes.ok) throw new Error(edgesRes.error)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    events.value = eventsRes.data
    plotEdges.value = edgesRes.data
    wikiEntries.value = wikiRes.data
    setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1 }), 120)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

// ---- 节点交互（单参数载荷 {event, node}，踩坑 #17：双参数签名致 node undefined） ----
async function onNodeDragStop(payload: { event: unknown; node: Node }): Promise<void> {
  const node = payload.node
  const e = events.value.find((x) => x.id === node.id)
  if (!e) return
  e.posX = Math.round(node.position.x)
  e.posY = Math.round(node.position.y)
  const res = await window.api.plot.update(e.id, { posX: e.posX, posY: e.posY })
  if (!res.ok) toast.error(res.error)
}

function onNodeClick(payload: { node: Node }): void {
  selectedEvent.value = events.value.find((x) => x.id === payload.node.id) ?? null
}

function onNodeDoubleClick(payload: { node: Node }): void {
  const e = events.value.find((x) => x.id === payload.node.id)
  if (e) openPanel(e)
}

// ---- 连线（单参数载荷 {event, edge}，与节点事件同坑 #17） ----
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

function onEdgeClick(payload: { edge: { id: string } }): void {
  const e = plotEdges.value.find((x) => x.id === payload.edge.id)
  if (!e) return
  selectedEdge.value = e
  edgeForm.value = { type: e.type, label: e.label }
}

/** 保存连线编辑（类型/标签） */
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

// ---- 详情面板 ----
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

watch(bookId, () => void loadAll())
onMounted(() => void loadAll())
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶部工具栏 -->
    <header class="flex items-center gap-3 border-b border-ink-border/60 bg-surface px-5 py-3">
      <router-link :to="`/book/${bookId}/write`" class="text-xs text-ink-text-muted hover:text-ink-primary">← 工作台</router-link>
      <h1 class="text-base font-bold text-ink-primary">剧情画布</h1>
      <span class="truncate text-sm text-ink-text-muted">{{ book?.title ?? '…' }}</span>
      <div class="ml-auto flex items-center gap-2">
        <!-- 搜索高亮 -->
        <div class="flex items-center gap-1.5">
          <input
            v-model="searchKeyword"
            placeholder="搜索事件（标题/描述/标签）"
            class="w-48 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs outline-none focus:border-ink-primary"
          />
          <span v-if="searchKeyword.trim()" class="whitespace-nowrap text-xs text-ink-text-muted">{{ hitCount }} 个命中</span>
        </div>
        <!-- 连线编辑器（单击边选中后出现） -->
        <div
          v-if="selectedEdge"
          class="flex items-center gap-1.5 rounded-lg border border-ink-primary/50 bg-ink-primary-soft/50 px-2.5 py-1"
        >
          <span class="text-xs text-ink-text-muted">连线:</span>
          <select
            v-model="edgeForm.type"
            class="rounded border border-ink-border bg-surface px-1.5 py-0.5 text-xs outline-none"
            @change="saveEdgeEdit"
          >
            <option value="main">主线</option>
            <option value="logic">逻辑</option>
            <option value="relation">关联</option>
            <option value="reference">引用</option>
          </select>
          <input
            v-model="edgeForm.label"
            placeholder="标签（如 伏笔）"
            maxlength="12"
            class="w-24 rounded border border-ink-border px-1.5 py-0.5 text-xs outline-none focus:border-ink-primary"
            @keyup.enter="saveEdgeEdit"
          />
          <button class="text-xs text-ink-danger hover:underline" @click="removeSelectedEdge">删除</button>
          <button class="text-xs text-ink-text-muted hover:text-ink-text" @click="selectedEdge = null" title="收起">✕</button>
        </div>
        <span v-else class="hidden text-xs text-ink-text-muted lg:inline">拖动节点左右手柄连线（箭头由因指向果）</span>
        <button
          class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
          @click="openCreate"
        >+ 手动加事件</button>
      </div>
    </header>

    <!-- 画布区 -->
    <div class="relative min-h-0 flex-1">
      <VueFlow
        :nodes="nodes"
        :edges="flowEdges"
        @node-drag-stop="onNodeDragStop"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @connect="onConnect"
        @edge-click="onEdgeClick"
      >
        <Background />
        <template #node-event="props">
          <PlotEventNode
            :event="(props.data as EventNodeData).event"
            :wiki-names="(props.data as EventNodeData).wikiNames"
            :selected="(props.data as EventNodeData).selected"
            :hit="(props.data as EventNodeData).hit"
            :dim="(props.data as EventNodeData).dim"
          />
        </template>
      </VueFlow>
      <div
        v-if="!loading && events.length === 0"
        class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      >
        <p class="rounded-xl bg-surface/90 px-6 py-4 text-sm text-ink-text-muted shadow-card">
          画布还是空的：点右上「+ 手动加事件」开始，或用 AI 生成初始事件链
        </p>
      </div>
      <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-paper/70">
        <p class="text-ink-text-muted">加载画布…</p>
      </div>
    </div>

    <!-- 事件详情/新建面板 -->
    <PlotDetailPanel
      :visible="panelVisible"
      :event="panelEvent"
      :wiki-entries="wikiEntries"
      :default-title="`事件 ${events.length + 1}`"
      @close="panelVisible = false"
      @submit="savePanel"
      @remove="panelEvent && confirmRemove(panelEvent)"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      :model-value="pendingDelete !== null"
      title="删除剧情事件"
      :description="`确定删除「${pendingDelete?.title ?? ''}」？关联连线将一并删除。`"
      confirm-text="删除"
      @update:model-value="pendingDelete = null"
      @confirm="doRemove"
    />
  </div>
</template>
