/**
 * 情节大纲 AI 三模式编排：初始化事件链 / 向后延伸 / 分歧推演。
 * 流式走 generateWriting + AiWritingPanel；采纳时解析 JSON 落库并自动连线。
 * 从 PlotCanvasView 抽出以保单文件 ≤400 行（编码规范 §6）。
 * 锁纪律（踩坑 #14）：isBusy 覆盖到 onDone/onError（generateWriting resolve 后 finally 释放）。
 */
import { computed, ref, toRaw, type ComputedRef, type Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Step2Soul, Step4Layout } from '../../../shared/genesis.types'
import type { PlotEdgeType, PlotEdge, PlotEvent, PlotGenMode } from '../../../shared/plot.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildPlotDivergeMessages,
  buildPlotExtendMessages,
  buildPlotInitMessages,
  parsePlotDivergeGen,
  parsePlotEventGen,
  wikiAlwaysText,
  type PlotDirectionDraft,
  type PlotGenStartPayload
} from '../services/plotPrompts'
import { buildFactsText, buildProgressText } from '../services/syncService'
import type { ChapterMeta } from '../../../shared/chapter.types'
import type { Memory } from '../../../shared/memory.types'
import type { useToast } from './useToast'

export type { PlotGenStartPayload }

export function usePlotAi(deps: {
  bookId: ComputedRef<string>
  book: Ref<Pick<Book, 'title' | 'genre' | 'description'> | null>
  events: Ref<PlotEvent[]>
  plotEdges: Ref<PlotEdge[]>
  wikiEntries: Ref<WikiEntry[]>
  selectedEvent: Ref<PlotEvent | null>
  toast: ReturnType<typeof useToast>
  /** 视图的 useVueFlow().fitView（采纳落库后收拢视野） */
  fitView: () => void
}) {
  const { bookId, book, events, plotEdges, wikiEntries, selectedEvent, toast } = deps

  // ---- 面板/弹窗状态 ----
  const aiPanel = ref<{
    append: (t: string) => void
    reset: () => void
    finish: () => void
    fail: () => void
  } | null>(null)
  const aiPanelVisible = ref(false)
  const isBusy = ref(false)
  const aiMode = ref<PlotGenMode>('init')
  const aiDialogVisible = ref(false)
  const pendingDirections = ref<PlotDirectionDraft[]>([])
  /** 本次生成的锚点事件快照（防生成期间用户改选导致落错位） */
  const genAnchor = ref<PlotEvent | null>(null)
  let lastPayload: PlotGenStartPayload = { instruction: '', divergeCount: 3, divergeHints: [] }
  let activeSession: StreamSession | null = null

  // 创世设定缓存（首次打开 AI 弹窗时懒加载；故事核心 = step2，分卷大纲 = step4）
  const genesisSoul = ref<Step2Soul | null>(null)
  const genesisLayout = ref<Step4Layout | null>(null)
  let genesisLoaded = false

  // ---- M10.5 联动：已写进度/既定事实（打开弹窗时刷新；生成时注入） ----
  const syncInfo = ref('')
  let progressText = ''
  let factsText = ''

  /** 拉取章节元数据与记忆，拼装联动上下文与弹窗信息行 */
  async function refreshSyncContext(): Promise<void> {
    if (!bookId.value) return
    try {
      const [metaRes, memRes] = await Promise.all([
        window.api.chapters.listMeta(bookId.value),
        window.api.memories.list(bookId.value)
      ])
      const metas: ChapterMeta[] = metaRes.ok ? metaRes.data : []
      const memoList: Memory[] = memRes.ok ? memRes.data : []
      progressText = buildProgressText(metas)
      factsText = buildFactsText(memoList)
      const written = metas.filter((m) => m.wordCount > 0).length
      syncInfo.value = `已联动：${written} 章进度 · ${memoList.length} 条记忆 · ${
        wikiEntries.value.filter((w) => w.injection === 'always').length
      } 条常驻设定`
    } catch {
      syncInfo.value = ''
    }
  }

  const aiModeLabel = computed(
    () => ({ init: 'AI 初始化事件链', extend: 'AI 向后延伸', diverge: 'AI 分歧推演' })[aiMode.value]
  )
  const aiModeHint = computed(
    () =>
      ({
        init: '按故事核心设定与分卷大纲生成 5-8 个初始事件，自动横向排布并连线',
        extend: `基于选中的「${selectedEvent.value?.title ?? ''}」向后生成 2-4 个后续事件`,
        diverge: `从「${selectedEvent.value?.title ?? ''}」推演多条不同走向，生成后择一采纳上画布`
      })[aiMode.value]
  )

  async function ensureGenesisLoaded(): Promise<void> {
    if (genesisLoaded || !bookId.value) return
    const res = await window.api.genesis.get(bookId.value)
    if (res.ok) {
      for (const r of res.data) {
        if (r.step === 2) genesisSoul.value = (r.data as Step2Soul) ?? null
        if (r.step === 4) genesisLayout.value = (r.data as Step4Layout) ?? null
      }
    }
    genesisLoaded = true
  }

  /** 打开 AI 生成配置弹窗（init 需空画布，extend/diverge 需选中事件） */
  function openAiDialog(mode: PlotGenMode): void {
    if (isBusy.value) return
    if (mode === 'init' && events.value.length > 0) {
      toast.info('画布已有事件，初始化适用于空画布（可选中事件后用「向后延伸」）')
      return
    }
    if (mode !== 'init' && !selectedEvent.value) {
      toast.error('请先单击选中一个事件')
      return
    }
    aiMode.value = mode
    void ensureGenesisLoaded()
    void refreshSyncContext()
    aiDialogVisible.value = true
  }

  /** 发起生成（弹窗「开始生成」与面板「重试」共用；retry 无 payload 时复用上次配置） */
  async function startPlotGen(payload?: PlotGenStartPayload): Promise<void> {
    if (isBusy.value) return
    const p = payload ?? lastPayload
    lastPayload = p
    const mode = aiMode.value
    const anchor = mode === 'init' ? null : selectedEvent.value
    if (mode !== 'init' && !anchor) {
      toast.error('请先单击选中一个事件')
      return
    }
    genAnchor.value = anchor
    aiDialogVisible.value = false
    isBusy.value = true
    aiPanelVisible.value = true
    aiPanel.value?.reset()
    await new Promise((r) => setTimeout(r, 50))
    try {
      const alwaysIds = wikiEntries.value.filter((w) => w.injection === 'always').map((w) => w.id)
      const ctx = {
        book: book.value ?? { title: '', genre: '', description: '' },
        soul: genesisSoul.value,
        layout: genesisLayout.value,
        wikiText: wikiAlwaysText(alwaysIds, wikiEntries.value),
        progressText,
        factsText
      }
      const messages =
        mode === 'init'
          ? buildPlotInitMessages(ctx, p.instruction)
          : mode === 'extend'
            ? buildPlotExtendMessages(
                ctx,
                anchor as PlotEvent,
                chainFor(anchor as PlotEvent),
                p.instruction
              )
            : buildPlotDivergeMessages(
                ctx,
                anchor as PlotEvent,
                p.divergeHints.slice(0, p.divergeCount),
                p.instruction
              )
      const { session } = await generateWriting(messages, {
        onChunk: (t) => aiPanel.value?.append(t),
        onDone: () => aiPanel.value?.finish(),
        onError: (m) => {
          aiPanel.value?.fail()
          toast.error(m)
        }
      })
      activeSession = session
    } catch (err) {
      aiPanel.value?.fail()
      toast.error(err instanceof Error ? err.message : '生成失败')
    } finally {
      isBusy.value = false
    }
  }

  /** 选中事件的相邻链上下文（直接上下游，截 8 个防超长） */
  function chainFor(anchor: PlotEvent): PlotEvent[] {
    const ids = new Set<string>([anchor.id])
    for (const e of plotEdges.value) {
      if (e.sourceId === anchor.id || e.targetId === anchor.id) {
        ids.add(e.sourceId)
        ids.add(e.targetId)
      }
    }
    return events.value.filter((e) => ids.has(e.id)).slice(0, 8)
  }

  /** 面板停止：中止当前流（中止会走 onError → 面板标记结束，不算错误路径）。
   *  不在此处释放 isBusy——由 startPlotGen 的 finally 在流真正终结后统一释放，
   *  避免中止动画期间 isBusy 提前可入导致新旧流交叠（M10 静态审查 P2）。 */
  function stopEverything(): void {
    activeSession?.abort()
  }

  // ---- 采纳落库（AI 草稿为纯对象，字段逐一平铺过 IPC，踩坑 #11） ----

  async function createEvent(
    d: { title: string; description: string; tags: string[] },
    posX: number,
    posY: number
  ): Promise<PlotEvent> {
    const res = await window.api.plot.create({
      bookId: bookId.value,
      title: d.title,
      description: d.description,
      tags: d.tags,
      posX,
      posY
    })
    if (!res.ok) throw new Error(res.error)
    events.value.push(res.data)
    return res.data
  }

  async function createEdge(
    sourceId: string,
    targetId: string,
    type: PlotEdgeType,
    label: string
  ): Promise<void> {
    const res = await window.api.plotEdges.create({
      bookId: bookId.value,
      sourceId,
      targetId,
      type,
      label
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (!plotEdges.value.some((x) => x.id === res.data.id)) plotEdges.value.push(res.data)
  }

  async function linkChain(created: PlotEvent[], type: PlotEdgeType): Promise<void> {
    for (let i = 0; i < created.length - 1; i++) {
      await createEdge(created[i].id, created[i + 1].id, type, '')
    }
  }

  /** 延伸落位：锚点右侧找空排（逐行下移最多 5 行，与分歧落位同一避让策略） */
  function freeRowYAfter(anchor: PlotEvent, count: number): number {
    const spanEnd = anchor.posX + (count + 1) * 340
    let rowY = anchor.posY
    for (let tries = 0; tries < 5; tries++) {
      const occupied = events.value.some(
        (e) =>
          e.id !== anchor.id &&
          Math.abs(e.posY - rowY) < 120 &&
          e.posX > anchor.posX &&
          e.posX <= spanEnd + 200
      )
      if (!occupied) break
      rowY += 220
    }
    return rowY
  }

  /** 面板「采纳」：按模式解析 AI 输出并落库 */
  async function acceptPlot(text: string): Promise<void> {
    const mode = aiMode.value
    if (mode === 'diverge') {
      const dirs = parsePlotDivergeGen(text)
      if (dirs.length === 0) {
        toast.error('AI 输出格式异常，无法解析出分歧方向')
        return
      }
      pendingDirections.value = dirs
      aiPanelVisible.value = false
      return
    }
    const drafts = parsePlotEventGen(text)
    if (drafts.length === 0) {
      toast.error('AI 输出格式异常，无法解析为事件')
      return
    }
    try {
      if (mode === 'init') {
        const created: PlotEvent[] = []
        for (let i = 0; i < drafts.length; i++) {
          created.push(await createEvent(drafts[i], 160 + i * 340, 240))
        }
        await linkChain(created, 'main')
        toast.success(`已生成 ${created.length} 个初始事件并连线`)
      } else {
        const anchor = genAnchor.value
        if (!anchor) {
          toast.error('找不到基准事件，请重新选中后再试')
          return
        }
        const rowY = freeRowYAfter(anchor, drafts.length)
        const created: PlotEvent[] = []
        for (let i = 0; i < drafts.length; i++) {
          created.push(await createEvent(drafts[i], anchor.posX + (i + 1) * 340, rowY))
        }
        await createEdge(anchor.id, created[0].id, 'main', '')
        await linkChain(created, 'main')
        toast.success(`已向后延伸 ${created.length} 个事件`)
      }
      aiPanelVisible.value = false
      setTimeout(() => deps.fitView(), 120)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
  }

  /** 分歧弹窗「采纳此方向」：该方向事件自锚点右下分支铺开，源→首事件连逻辑边（标签=方向名）。
   *  dir 来自 pendingDirections（响应式数组），必须先深拷贝去 Proxy 过 IPC（踩坑 #11） */
  async function adoptDirection(dirRaw: PlotDirectionDraft): Promise<void> {
    const dir = JSON.parse(JSON.stringify(toRaw(dirRaw))) as PlotDirectionDraft
    const anchor = genAnchor.value
    if (!anchor) {
      toast.error('找不到分歧点事件，请重新选中后再试')
      pendingDirections.value = []
      return
    }
    try {
      // 落位避让：目标行右侧区间已被占则逐行下移（最多 5 行）
      const spanEnd = anchor.posX + (dir.events.length + 1) * 340
      let baseY = anchor.posY + 220
      for (let tries = 0; tries < 5; tries++) {
        const occupied = events.value.some(
          (e) =>
            Math.abs(e.posY - baseY) < 120 &&
            e.posX > anchor.posX &&
            e.posX <= spanEnd + 200
        )
        if (!occupied) break
        baseY += 220
      }
      const created: PlotEvent[] = []
      for (let i = 0; i < dir.events.length; i++) {
        created.push(await createEvent(dir.events[i], anchor.posX + (i + 1) * 340, baseY))
      }
      await createEdge(anchor.id, created[0].id, 'logic', dir.name)
      await linkChain(created, 'main')
      toast.success(`已采纳方向「${dir.name}」：${created.length} 个事件已上画布`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      pendingDirections.value = []
      setTimeout(() => deps.fitView(), 120)
    }
  }

  return {
    aiPanel,
    aiPanelVisible,
    isBusy,
    aiMode,
    aiDialogVisible,
    pendingDirections,
    genAnchor,
    aiModeLabel,
    aiModeHint,
    syncInfo,
    openAiDialog,
    startPlotGen,
    stopEverything,
    acceptPlot,
    adoptDirection
  }
}
