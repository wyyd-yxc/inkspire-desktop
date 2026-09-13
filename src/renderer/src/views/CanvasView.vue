<script setup lang="ts">
/**
 * 场景规划：Vue Flow 场景编排 + AI 场景生成 + 按场景顺序生成正文。
 * 节点 x 坐标即叙事顺序（sort_order）；详情面板编辑全部字段；AI 面板流式预览。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow, Handle, Position, type Node, type Edge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { Scene, SceneGenMode, SceneStatus, SceneEdge, SceneEdgeType } from '../../../shared/canvas.types'
import type { PlotEvent } from '../../../shared/plot.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { buildPlotChainText } from '../services/syncService'
import { resolveEffectiveStyle } from '../services/styleContext'
import { getPresetStyle } from '../../../shared/presetStyles'
import type { Step1Style } from '../../../shared/genesis.types'
import { useToast } from '@/composables/useToast'
import {
  buildSceneGenMessages,
  buildSceneProseMessages,
  parseSceneGen,
  wikiRefText
} from '../services/scenePrompts'
import { generateWriting } from '../services/aiWriting'
import AiWritingPanel from '@/components/AiWritingPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// 响应式路由参数（防同路由跨章导航组件复用拿旧 id，M6 同类教训）
const bookId = computed(() => route.params.bookId as string)
const chapterId = computed(() => route.params.chapterId as string)

const book = ref<Pick<Book, 'title' | 'genre' | 'description' | 'styleProfileId'> | null>(null)
const chapter = ref<Chapter | null>(null)
const scenes = ref<Scene[]>([])
const wikiEntries = ref<WikiEntry[]>([])
const plotEvents = ref<PlotEvent[]>([])
const loading = ref(true)

/** 生效风格块（M12：书绑定包>基调步预设>无），供「按场景生成正文」注入；节点生成不注入 */
const styleHint = ref<string | undefined>(undefined)

const { fitView } = useVueFlow()

// ---- 详情面板 ----
const panelVisible = ref(false)
const panelScene = ref<Scene | null>(null)
const panelCreatePos = ref({ x: 320, y: 200 })
const panelForm = ref({
  title: '',
  summary: '',
  beat: '',
  tension: 3,
  tagsText: '',
  status: 'draft' as SceneStatus,
  wikiRefs: [] as string[]
})
const savingPanel = ref(false)
const pendingDelete = ref<Scene | null>(null)

// ---- AI ----
const aiPanel = ref<InstanceType<typeof AiWritingPanel> | null>(null)
const aiPanelVisible = ref(false)
const aiPanelKind = ref<'continue' | 'chapter-polish'>('continue')
const isBusy = ref(false)
const aiMode = ref<SceneGenMode>('init')
const aiDialogVisible = ref(false)
const aiInstruction = ref('')
const appendCount = ref(2)
const selectedScene = ref<Scene | null>(null)

// ---- 生成正文 ----
const proseDialogVisible = ref(false)
const proseTargetWords = ref(600)
const proseRunning = ref(false)

const statusLabels: Record<SceneStatus, string> = {
  draft: '草稿',
  main: '主线',
  side: '支线',
  locked: '已锁定'
}
const statusColors: Record<SceneStatus, string> = {
  draft: '#8b8574',
  main: '#8a6d2f',
  side: '#6d5a7d',
  locked: '#5c7d63'
}

const modeLabels: Record<SceneGenMode, string> = {
  init: '初始化场景（适用于空画布）',
  bridge: '搭桥填缝（在选中场景前插入过渡）',
  rewrite: '改写场景（充实选中场景）',
  ending: '收尾场景（为本章收束）',
  append: '末尾续写（追加 N 个场景）'
}

const lockedCount = computed(() => scenes.value.filter((s) => s.status === 'locked').length)

/** Vue Flow 节点（从 scenes 派生） */
const nodes = computed<Node[]>(() =>
  scenes.value.map((s) => ({
    id: s.id,
    type: 'scene',
    position: { x: s.posX, y: s.posY },
    data: { scene: s }
  }))
)

/** 叙事顺序（sort_order 升序） */
const ordered = computed(() => [...scenes.value].sort((a, b) => a.sortOrder - b.sortOrder))

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, chaptersRes, scenesRes, wikiRes, edgeRes, plotRes, genesisRes, stylesRes] =
      await Promise.all([
        window.api.books.list(),
        window.api.chapters.list(bookId.value),
        window.api.scenes.list(chapterId.value),
        window.api.wiki.list(bookId.value),
        window.api.sceneEdges.list(chapterId.value),
        window.api.plot.list(bookId.value),
        window.api.genesis.get(bookId.value),
        window.api.styles.list()
      ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    if (!scenesRes.ok) throw new Error(scenesRes.error)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    if (!edgeRes.ok) throw new Error(edgeRes.error)
    if (!plotRes.ok) throw new Error(plotRes.error)
    if (!genesisRes.ok) throw new Error(genesisRes.error)
    if (!stylesRes.ok) throw new Error(stylesRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    chapter.value = chaptersRes.data.find((c) => c.id === chapterId.value) ?? null
    scenes.value = scenesRes.data
    wikiEntries.value = wikiRes.data
    sceneEdges.value = edgeRes.data
    plotEvents.value = plotRes.data
    // 生效风格（M12）：书绑定包优先，回落基调步预设 promptHint
    const step1 = genesisRes.data.find((r) => r.step === 1)?.data as Step1Style | undefined
    const presetHint = step1?.styleId ? getPresetStyle(step1.styleId)?.promptHint : undefined
    const bound = book.value?.styleProfileId
      ? stylesRes.data.find((s) => s.id === book.value?.styleProfileId) ?? null
      : null
    styleHint.value = resolveEffectiveStyle(bound, presetHint)
    setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1 }), 120)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

// ---- 场景连线（关系表达：main 主线/logic 因果/relation 关联） ----

const sceneEdges = ref<SceneEdge[]>([])
const selectedEdge = ref<SceneEdge | null>(null)
const edgeForm = ref({ type: 'main' as SceneEdgeType, label: '' })

/** 连线类型样式（颜色/虚线/labelBg） */
const edgeTypeStyle: Record<SceneEdgeType, { stroke: string; dash: string; label: string }> = {
  main: { stroke: '#8a6d2f', dash: '0', label: '主线' },
  logic: { stroke: '#4a6f8a', dash: '6 4', label: '因果' },
  relation: { stroke: '#8b8574', dash: '2 4', label: '关联' }
}

/** DB 连线 → Vue Flow Edge（样式按类型，label 上边） */
const flowEdges = computed<Edge[]>(() =>
  sceneEdges.value.map((e) => {
    const st = edgeTypeStyle[e.type] ?? edgeTypeStyle.relation
    return {
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      type: 'smoothstep',
      label: e.label || st.label,
      labelBgStyle: { fill: '#faf8f3' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      style: { stroke: st.stroke, strokeWidth: 2, strokeDasharray: st.dash }
    }
  })
)

/** 拖线连接完成：校验 + 落库（踩坑 #11：连接参数含句柄对象，仅取 id） */
async function onConnect(params: { source: string; target: string }): Promise<void> {
  if (params.source === params.target) {
    toast.error('不能连接场景到自身')
    return
  }
  try {
    const res = await window.api.sceneEdges.create({
      chapterId: chapterId.value,
      sourceId: params.source,
      targetId: params.target
    })
    if (!res.ok) throw new Error(res.error)
    if (!sceneEdges.value.some((x) => x.id === res.data.id)) sceneEdges.value.push(res.data)
    // 连线默认 main：创建后自动选中打开编辑器，便于立即切换类型/加标签
    selectedEdge.value = res.data
    edgeForm.value = { type: res.data.type, label: res.data.label }
    toast.success('连线已创建（可在上方编辑器调整类型与标签）')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '连线失败')
  }
}

/** 单击选中连线 → 工具栏编辑器（Vue Flow 边事件同为单参数载荷 {event, edge}，与节点事件同坑） */
function onEdgeClick(payload: { edge: { id: string } }): void {
  const e = sceneEdges.value.find((x) => x.id === payload.edge.id)
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
    const res = await window.api.sceneEdges.update(target.id, plain)
    if (!res.ok) throw new Error(res.error)
    const i = sceneEdges.value.findIndex((x) => x.id === res.data.id)
    if (i >= 0) sceneEdges.value[i] = res.data
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
  const res = await window.api.sceneEdges.remove(target.id)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  sceneEdges.value = sceneEdges.value.filter((x) => x.id !== target.id)
  selectedEdge.value = null
  toast.success('连线已删除')
}

/** 场景的出入关系描述（生成正文时注入，防因果写反） */
function relationTextFor(scene: Scene): string {
  const lines: string[] = []
  for (const e of sceneEdges.value) {
    if (e.sourceId === scene.id) {
      const t = scenes.value.find((x) => x.id === e.targetId)
      if (t) lines.push(`本场景${e.type === 'logic' ? '因果指向' : e.type === 'main' ? '顺承接续' : '关联'}「${t.title}」`)
    } else if (e.targetId === scene.id) {
      const s = scenes.value.find((x) => x.id === e.sourceId)
      if (s) lines.push(`承接自「${s.title}」${e.label ? '（' + e.label + '）' : ''}`)
    }
  }
  return lines.join('；')
}

/** 按 x 坐标重排 sort_order 并落库（拖动结束/搭桥插入/删除后共用） */
async function reorderByX(): Promise<void> {
  const sorted = [...scenes.value].sort((a, b) => a.posX - b.posX)
  const orderedIds = sorted.map((x) => x.id)
  scenes.value = sorted.map((x, i) => ({ ...x, sortOrder: i + 1 }))
  const res = await window.api.scenes.reorder(chapterId.value, orderedIds)
  if (!res.ok) toast.error(res.error)
}

/** 拖动结束：从内部节点读回位置 → 落库 → 按 x 重排。
 *  注意 @vue-flow/core 组件事件为单参数载荷 {event, node}（黑盒验收实锤：双参数签名致 node undefined） */
async function onNodeDragStop(payload: { event: unknown; node: Node }): Promise<void> {
  const node = payload.node
  const s = scenes.value.find((x) => x.id === node.id)
  if (!s) return
  s.posX = Math.round(node.position.x)
  s.posY = Math.round(node.position.y)
  await reorderByX()
  await window.api.scenes.update(s.id, { posX: s.posX, posY: s.posY })
}

function onNodeClick(payload: { node: Node }): void {
  selectedScene.value = scenes.value.find((x) => x.id === payload.node.id) ?? null
}

function onNodeDoubleClick(payload: { node: Node }): void {
  const s = scenes.value.find((x) => x.id === payload.node.id)
  if (s) openPanel(s)
}

// ---- 详情面板 ----
function openPanel(s: Scene): void {
  panelScene.value = s
  panelForm.value = {
    title: s.title,
    summary: s.summary,
    beat: s.beat,
    tension: s.tension,
    tagsText: s.tags.join('、'),
    status: s.status,
    wikiRefs: [...s.wikiRefs]
  }
  panelVisible.value = true
}

function openCreate(): void {
  const last = ordered.value[ordered.value.length - 1]
  panelScene.value = null
  panelForm.value = {
    title: `场景 ${scenes.value.length + 1}`,
    summary: '',
    beat: '',
    tension: 3,
    tagsText: '',
    status: 'draft',
    wikiRefs: []
  }
  panelCreatePos.value = { x: (last?.posX ?? 0) + 320, y: 200 }
  panelVisible.value = true
}

/** 保存（新建/更新）。响应式对象必须深拷贝过 IPC（踩坑 #11） */
async function savePanel(): Promise<void> {
  if (!panelForm.value.title.trim()) {
    toast.error('场景标题不能为空')
    return
  }
  savingPanel.value = true
  try {
    const tags = panelForm.value.tagsText
      .split(/[、,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    const plain = JSON.parse(
      JSON.stringify({
        title: panelForm.value.title,
        summary: panelForm.value.summary,
        beat: panelForm.value.beat,
        tension: panelForm.value.tension,
        tags,
        status: panelForm.value.status,
        wikiRefs: panelForm.value.wikiRefs
      })
    )
    if (panelScene.value) {
      const res = await window.api.scenes.update(panelScene.value.id, plain)
      if (!res.ok) throw new Error(res.error)
      const i = scenes.value.findIndex((s) => s.id === res.data.id)
      if (i >= 0) scenes.value[i] = res.data
    } else {
      const res = await window.api.scenes.create({
        chapterId: chapterId.value,
        ...plain,
        posX: panelCreatePos.value.x,
        posY: panelCreatePos.value.y
      })
      if (!res.ok) throw new Error(res.error)
      scenes.value.push(res.data)
    }
    panelVisible.value = false
    toast.success('场景已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    savingPanel.value = false
  }
}

async function doDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  const res = await window.api.scenes.remove(target.id)
  if (!res.ok) {
    toast.error(res.error)
  } else {
    scenes.value = scenes.value.filter((s) => s.id !== target.id)
    // 连线经 FK 级联删除（DB），本地同步清理
    sceneEdges.value = sceneEdges.value.filter((e) => e.sourceId !== target.id && e.targetId !== target.id)
    await reorderByX() // 本地序号即时同步（修复删除后节点序号不刷新，M7 复验问题 7）
    if (panelScene.value?.id === target.id) panelVisible.value = false
    toast.success('场景已删除')
  }
  pendingDelete.value = null
}

// ---- AI 场景生成 ----
function needsAnchorFor(mode: SceneGenMode): boolean {
  return mode === 'bridge' || mode === 'rewrite'
}

function openAiDialog(mode: SceneGenMode): void {
  if (isBusy.value) return
  if (mode === 'init' && scenes.value.length > 0) {
    toast.info('画布已有场景，初始化适用于空画布（可用末尾续写/收尾）')
    return
  }
  if (needsAnchorFor(mode) && !selectedScene.value) {
    toast.error('请先单击选中一个场景')
    return
  }
  aiMode.value = mode
  aiInstruction.value = ''
  aiDialogVisible.value = true
}

async function startSceneGen(): Promise<void> {
  if (isBusy.value || !book.value) return
  const anchor = needsAnchorFor(aiMode.value) ? selectedScene.value : null
  if (needsAnchorFor(aiMode.value) && !anchor) {
    toast.error('请先单击选中一个场景')
    return
  }
  aiDialogVisible.value = false
  isBusy.value = true
  aiPanelKind.value = 'continue'
  aiPanelVisible.value = true
  aiPanel.value?.reset()
  await new Promise((r) => setTimeout(r, 50))
  try {
    const wikiText = wikiRefText(
      [...new Set(ordered.value.flatMap((s) => s.wikiRefs))],
      wikiEntries.value
    )
    const messages = buildSceneGenMessages(aiMode.value, {
      book: book.value,
      chapterTitle: chapter.value?.title ?? '',
      chapterSummary: chapter.value?.summary ?? '',
      scenes: aiMode.value === 'init' ? [] : ordered.value,
      anchorScene: anchor ?? undefined,
      appendCount: appendCount.value,
      wikiText,
      instruction: aiInstruction.value,
      plotText: buildPlotChainText(plotEvents.value)
    })
    await generateWriting(messages, {
      onChunk: (t) => aiPanel.value?.append(t),
      onDone: () => aiPanel.value?.finish(),
      onError: (m) => {
        aiPanel.value?.fail()
        toast.error(m)
      }
    }, 'scene')
  } catch (err) {
    aiPanel.value?.fail()
    toast.error(err instanceof Error ? err.message : '生成失败')
  } finally {
    isBusy.value = false
  }
}

async function acceptScenes(text: string): Promise<void> {
  let parsed = parseSceneGen(text)
  if (parsed.length === 0) {
    // 救援兜底：宽松解析失败时按 title/summary 结构正则提取（LLM JSON 边界情况兜底）
    const rescued: Array<{ title: string; summary: string; beat: string; tension: number; tags: string[] }> = []
    const re = /"title"\s*:\s*"([^"]{1,40})"\s*,\s*"summary"\s*:\s*"([\s\S]*?)"\s*,\s*"beat"\s*:\s*"([^"]*)"\s*,\s*"tension"\s*:\s*(\d)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      rescued.push({ title: m[1], summary: m[2].slice(0, 300), beat: m[3], tension: Number(m[4]), tags: [] })
    }
    parsed = rescued
  }
  if (parsed.length === 0) {
    toast.error('AI 输出格式异常，无法解析为场景')
    return
  }
  try {
    if (aiMode.value === 'rewrite' && selectedScene.value) {
      const target = selectedScene.value
      const first = parsed[0]
      const res = await window.api.scenes.update(target.id, {
        title: first.title,
        summary: first.summary,
        beat: first.beat,
        tension: first.tension,
        tags: first.tags
      })
      if (!res.ok) throw new Error(res.error)
      const i = scenes.value.findIndex((s) => s.id === res.data.id)
      if (i >= 0) scenes.value[i] = res.data
      toast.success(`场景「${first.title}」已改写`)
    } else if (aiMode.value === 'bridge' && selectedScene.value) {
      // 搭桥：锚点前插——锚点及其右侧场景右移腾位，新场景落在锚点前一格，随后按 x 重排
      const anchor = selectedScene.value
      const created: Scene[] = []
      for (let k = 0; k < parsed.length; k++) {
        const p = parsed[k]
        const res = await window.api.scenes.create({
          chapterId: chapterId.value,
          title: p.title,
          summary: p.summary,
          beat: p.beat,
          tension: p.tension,
          tags: p.tags,
          posX: anchor.posX + k * 320,
          posY: anchor.posY,
          sortOrder: 0 // 稍后统一按 x 重排
        })
        if (!res.ok) throw new Error(res.error)
        created.push(res.data)
      }
      // 锚点及其右侧场景右移 parsed.length 格
      for (const s of scenes.value) {
        if (s.posX >= anchor.posX) {
          s.posX += parsed.length * 320
          await window.api.scenes.update(s.id, { posX: s.posX })
        }
      }
      scenes.value.push(...created)
      await reorderByX()
      toast.success(`已插入 ${parsed.length} 个过渡场景`)
    } else {
      let sortOrder = ordered.value.length
      let maxX = Math.max(0, ...scenes.value.map((s) => s.posX))
      for (const p of parsed) {
        sortOrder += 1
        maxX += 320
        const res = await window.api.scenes.create({
          chapterId: chapterId.value,
          title: p.title,
          summary: p.summary,
          beat: p.beat,
          tension: p.tension,
          tags: p.tags,
          posX: maxX,
          posY: 200,
          sortOrder
        })
        if (!res.ok) throw new Error(res.error)
        scenes.value.push(res.data)
      }
      toast.success(`已生成 ${parsed.length} 个场景`)
    }
    aiPanelVisible.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

// ---- 按场景顺序生成正文 ----
function openProseDialog(): void {
  if (isBusy.value) return
  if (ordered.value.length === 0) {
    toast.error('请先添加场景，再生成正文')
    return
  }
  proseDialogVisible.value = true
}

/** 单场景正文生成：会话建立+流结束统一在一个 Promise 里 */
function generateOneScene(
  scene: Scene,
  precedingText: string,
  isLast: boolean
): Promise<string> {
  if (!book.value) return Promise.reject(new Error('书籍未加载'))
  const wikiText = wikiRefText(scene.wikiRefs, wikiEntries.value)
  const messages = buildSceneProseMessages(
    book.value,
    chapter.value?.title ?? '',
    scene,
    precedingText,
    isLast,
    wikiText,
    proseTargetWords.value,
    relationTextFor(scene),
    styleHint.value
  )
  return new Promise<string>((resolve, reject) => {
    void (async () => {
      try {
        let acc = ''
        await generateWriting(messages, {
          onChunk: (t) => {
            acc += t
            aiPanel.value?.append(t)
          },
          onDone: () => resolve(acc),
          onError: (m) => reject(new Error(m))
        }, 'writing')
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })()
  })
}

async function startProseGen(): Promise<void> {
  if (proseRunning.value || !book.value) return
  proseDialogVisible.value = false
  proseRunning.value = true
  aiPanelKind.value = 'chapter-polish'
  aiPanelVisible.value = true
  aiPanel.value?.reset()
  let full = ''
  let aborted = false
  try {
    for (let i = 0; i < ordered.value.length; i++) {
      const s = ordered.value[i]
      const isLast = i === ordered.value.length - 1
      if (s.status === 'locked') {
        const placeholder = `【已锁定场景「${s.title}」——请手动撰写或解锁后重新生成】`
        full += `\n\n${placeholder}`
        aiPanel.value?.append(`\n（已锁定场景「${s.title}」跳过生成）\n`)
        continue
      }
      const chunk = await generateOneScene(s, full, isLast)
      full += (full ? '\n\n' : '') + chunk
    }
  } catch (err) {
    aborted = true
    toast.error(err instanceof Error ? err.message : '生成中止')
  }
  proseRunning.value = false
  if (aborted) {
    aiPanel.value?.fail()
    return
  }
  aiPanel.value?.finish()
  // 写入章节并跳写作台（原站行为：生成完成自动跳转）
  try {
    const html = full
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('')
    const plainWords = full.replace(/\s/g, '').length
    const res = await window.api.chapters.update(chapterId.value, {
      content: html,
      wordCount: plainWords
    })
    if (!res.ok) throw new Error(res.error)
    toast.success('正文已生成并写入本章')
    void router.push(`/book/${bookId.value}/write`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '写入章节失败')
  }
}

function stopEverything(): void {
  // 终止当前流：AiWritingPanel 的停止按钮触发；逐场景循环中的当前流由 onError('已中止') 驱动
  isBusy.value = false
}

watch([bookId, chapterId], () => void loadAll())
onMounted(() => void loadAll())
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶部工具栏 -->
    <header class="flex items-center gap-3 border-b border-ink-border/60 bg-surface px-5 py-3">
      <span class="truncate text-sm text-ink-text-muted">{{ chapter?.title ?? '…' }}</span>
      <div class="ml-auto flex items-center gap-2">
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
            <option value="logic">因果</option>
            <option value="relation">关联</option>
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
        >+ 手动加场景</button>
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          @click="openAiDialog('init')"
        >初始化</button>
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          @click="openAiDialog('append')"
        >+ 末尾续写</button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
          :class="selectedScene ? 'border-ink-primary text-ink-primary hover:bg-ink-primary-soft' : 'border-ink-border text-ink-text-muted'"
          :disabled="!selectedScene"
          title="单击选中场景后可用：在其前插入过渡场景"
          @click="openAiDialog('bridge')"
        >搭桥</button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
          :class="selectedScene ? 'border-ink-primary text-ink-primary hover:bg-ink-primary-soft' : 'border-ink-border text-ink-text-muted'"
          :disabled="!selectedScene"
          title="单击选中场景后可用：融入设定充实该场景"
          @click="openAiDialog('rewrite')"
        >改写</button>
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          @click="openAiDialog('ending')"
        >收尾</button>
        <button
          class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white shadow-card transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
          :disabled="proseRunning"
          @click="openProseDialog"
        >{{ proseRunning ? '生成中…' : '按场景生成正文' }}</button>
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
        <template #node-scene="props">
          <div
            class="w-[280px] cursor-pointer rounded-xl border-2 bg-surface p-3 shadow-card transition-shadow hover:shadow-lg"
            :class="selectedScene?.id === props.id ? 'border-ink-primary' : 'border-ink-border/70'"
          >
            <!-- 连线手柄：左入右出（拖动边缘连线表达场景关系） -->
            <Handle type="target" :position="Position.Left" class="!h-3 !w-3 !border-2 !border-surface !bg-ink-primary" />
            <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !border-2 !border-surface !bg-ink-primary" />
            <div class="flex items-center gap-2">
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :style="{ background: statusColors[(props.data as { scene: Scene }).scene.status] }"
              />
              <h3 class="min-w-0 flex-1 truncate text-sm font-semibold">{{ (props.data as { scene: Scene }).scene.title }}</h3>
              <span class="shrink-0 text-[10px] text-ink-text-muted">#{{ (props.data as { scene: Scene }).scene.sortOrder }}</span>
            </div>
            <p class="mt-1.5 line-clamp-3 min-h-[3.6em] text-xs leading-5 text-ink-text-secondary">
              {{ (props.data as { scene: Scene }).scene.summary || '（无摘要，双击编辑）' }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-1">
              <span class="rounded bg-paper px-1.5 py-0.5 text-[10px] text-ink-text-secondary">
                节拍:{{ (props.data as { scene: Scene }).scene.beat || '—' }}
              </span>
              <span class="rounded bg-paper px-1.5 py-0.5 text-[10px] text-ink-text-secondary">
                张力:{{ (props.data as { scene: Scene }).scene.tension }}
              </span>
              <span
                v-for="t in (props.data as { scene: Scene }).scene.tags.slice(0, 2)"
                :key="t"
                class="rounded-full bg-ink-primary-soft px-1.5 py-0.5 text-[10px] text-ink-primary"
              >{{ t }}</span>
            </div>
            <div v-if="(props.data as { scene: Scene }).scene.wikiRefs.length" class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-for="rid in (props.data as { scene: Scene }).scene.wikiRefs.slice(0, 4)"
                :key="rid"
                class="rounded border border-ink-border px-1 text-[10px] text-ink-text-muted"
              >{{ wikiEntries.find((w) => w.id === rid)?.name ?? '?' }}</span>
            </div>
          </div>
        </template>
      </VueFlow>
      <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-paper/70">
        <p class="text-ink-text-muted">加载画布…</p>
      </div>
    </div>

    <!-- AI 流式面板 -->
    <AiWritingPanel
      ref="aiPanel"
      :visible="aiPanelVisible"
      :kind="aiPanelKind"
      @accept="acceptScenes"
      @retry="startSceneGen"
      @stop="stopEverything"
      @close="aiPanelVisible = false; isBusy = false"
    />

    <!-- 场景详情/新建面板 -->
    <teleport to="body">
      <div v-if="panelVisible" class="fixed inset-0 z-40 flex justify-end bg-black/20" @click.self="panelVisible = false">
        <div class="flex h-full w-[400px] flex-col bg-surface shadow-2xl">
          <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
            <h2 class="font-semibold">{{ panelScene ? '编辑场景' : '新建场景' }}</h2>
            <button class="text-ink-text-muted hover:text-ink-text" @click="panelVisible = false">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4">
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">标题 *</span>
                <input v-model="panelForm.title" maxlength="40" class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">剧情摘要（越具体 AI 生成越准）</span>
                <textarea v-model="panelForm.summary" rows="5" class="resize-y rounded-lg border border-ink-border px-3 py-2 text-sm leading-6 outline-none focus:border-ink-primary" />
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label class="flex flex-col gap-1">
                  <span class="text-sm text-ink-text-secondary">情节节拍</span>
                  <input v-model="panelForm.beat" placeholder="如：冲突升级" class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-sm text-ink-text-secondary">张力 {{ panelForm.tension }}/5</span>
                  <input v-model.number="panelForm.tension" type="range" min="1" max="5" class="mt-2" />
                </label>
              </div>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">标签（顿号/逗号分隔）</span>
                <input v-model="panelForm.tagsText" placeholder="高潮、伏笔、打斗" class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
              </label>
              <div class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">状态</span>
                <div class="flex gap-1.5">
                  <button
                    v-for="(label, st) in statusLabels"
                    :key="st"
                    class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    :class="panelForm.status === st ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                    @click="panelForm.status = st"
                  >{{ label }}</button>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-sm text-ink-text-secondary">关联设定集词条（AI 生成时参考）</span>
                <div class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-ink-border p-2">
                  <button
                    v-for="w in wikiEntries"
                    :key="w.id"
                    class="rounded-full border px-2 py-0.5 text-xs transition-colors"
                    :class="panelForm.wikiRefs.includes(w.id) ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                    @click="panelForm.wikiRefs.includes(w.id) ? panelForm.wikiRefs.splice(panelForm.wikiRefs.indexOf(w.id), 1) : panelForm.wikiRefs.push(w.id)"
                  >{{ w.name }}</button>
                  <span v-if="wikiEntries.length === 0" class="px-1 text-xs text-ink-text-muted">设定集暂无词条</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between border-t border-ink-border/60 px-5 py-3">
            <button
              v-if="panelScene"
              class="text-sm text-ink-danger hover:underline"
              @click="pendingDelete = panelScene; panelVisible = false"
            >删除场景</button>
            <span v-else />
            <button
              class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
              :disabled="savingPanel"
              @click="savePanel"
            >{{ savingPanel ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- AI 场景生成设置弹窗 -->
    <teleport to="body">
      <div v-if="aiDialogVisible" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" @click.self="aiDialogVisible = false">
        <div class="w-[440px] rounded-2xl bg-surface p-6 shadow-card">
          <h2 class="mb-1 text-lg font-semibold">AI 生成场景</h2>
          <p class="mb-4 text-sm text-ink-text-secondary">{{ modeLabels[aiMode] }}</p>
          <p v-if="needsAnchorFor(aiMode)" class="mb-3 rounded-lg bg-ink-primary-soft px-3 py-2 text-xs text-ink-primary">
            锚点场景：{{ selectedScene?.title }}
          </p>
          <label v-if="aiMode === 'append'" class="mb-4 flex items-center gap-2 text-sm">
            续写场景数：
            <input v-model.number="appendCount" type="number" min="1" max="5" class="w-16 rounded border border-ink-border px-2 py-1 outline-none focus:border-ink-primary" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">补充要求（留空由 AI 发挥）</span>
            <textarea v-model="aiInstruction" rows="2" placeholder="如：加强感情线、多写环境" class="resize-none rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
          </label>
          <div class="mt-5 flex justify-end gap-3">
            <button class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft" @click="aiDialogVisible = false">取消</button>
            <button class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover" @click="startSceneGen">开始生成</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- 生成正文设置弹窗 -->
    <teleport to="body">
      <div v-if="proseDialogVisible" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" @click.self="proseDialogVisible = false">
        <div class="w-[440px] rounded-2xl bg-surface p-6 shadow-card">
          <h2 class="mb-2 text-lg font-semibold">按场景生成正文</h2>
          <p class="mb-4 text-sm leading-6 text-ink-text-secondary">
            按叙事顺序逐场景生成并拼合，完成后<b>替换本章现有正文</b>（当前 {{ chapter?.wordCount ?? 0 }} 字将被覆盖）。已锁定场景 {{ lockedCount }} 个将跳过生成、以占位段插入。
          </p>
          <label class="flex items-center gap-2 text-sm">
            每场景约
            <input v-model.number="proseTargetWords" type="number" min="200" max="2000" step="100" class="w-20 rounded border border-ink-border px-2 py-1 outline-none focus:border-ink-primary" />
            字
          </label>
          <div class="mt-5 flex justify-end gap-3">
            <button class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft" @click="proseDialogVisible = false">取消</button>
            <button class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover" @click="startProseGen">开始生成</button>
          </div>
        </div>
      </div>
    </teleport>

    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除场景「${pendingDelete?.title ?? ''}」？`"
      description="删除后其余场景自动补齐顺序。"
      @confirm="doDelete"
    />
  </div>
</template>
