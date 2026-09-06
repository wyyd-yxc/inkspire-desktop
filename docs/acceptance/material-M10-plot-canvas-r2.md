# M10 剧情画布 — 验收材料

- 日期：2026-09-06
- 里程碑：M10 剧情画布（对照原站 doc.inkspires.cn/features/plot-canvas.html 与 refs/doc_plot_canvas.jpg）
- diff 基准：`v0.11.0-m9-assistant`（静态审查请显式带 `--base v0.11.0-m9-assistant`）

## 范围

工作台侧栏新增「剧情」入口 → `/book/:bookId/plot` 剧情画布（Vue Flow）：跨章节剧情事件节点 CRUD、
四类连线（主线/逻辑/关联/引用）+ 标签编辑、拖拽位置持久化、双击详情面板（标题/描述/标签/挂接百科词条）、
搜索高亮（匹配高亮描边/不匹配变暗）、AI 三模式（初始化事件链 / 向后延伸 / 分歧推演择一采纳）。
数据层 migration v10（plot_events + plot_edges 两表，books FK 级联）；IPC `plot:*` 与 `plot-edges:*` 各四通道。

## 验收点（双轨共同依据）

1. 工作台侧栏「剧情」入口可达，路由 `/book/:bookId/plot`
2. 事件增删改查：手动新建（面板）/双击编辑/删除（带确认，关联连线级联清理），重启应用后数据仍在
3. 拖拽节点位置持久化（drag-stop 落库，DB 直查复核 pos_x/pos_y）
4. 四类连线：拖拽手柄创建（防自环/防重复）、单击选中改类型+标签、删除；四类视觉可区分
5. 事件卡片：毛玻璃卡片 + 首标签渐变色条 + 标题/描述/标签 chips + 镶嵌词条图标
6. 详情面板：标题/描述/标签（顿号分隔）/挂接百科词条 toggle
7. 搜索高亮：关键词命中（标题/描述/标签）节点高亮描边并显示命中数，未命中变暗，清空恢复
8. AI 初始化：空画布生成 5-8 个事件，横向链式排布并自动连主线边；非空画布拦截提示
9. AI 向后延伸：基于选中事件生成 2-4 个后续事件，落位避让（同排被占自动换行），锚点→首事件连线
10. AI 分歧推演：配置方向数（2-4，可各填简述/留空）→ 各方向一组候选 → 方向选择弹窗 → 择一采纳上画布，
    源→首事件连逻辑边（标签=方向名）
11. AI 生成流式出字、可中止；采纳前 JSON 宽容解析（严格失败走修复器）
12. 删书级联：删除书籍连带清理 plot_events/plot_edges（FK ON DELETE CASCADE）

## 开发自测声明

环境：`npm run dev -- --remote-debugging-port=9222`（CDP 驱动真实 Electron，改码后完全重启再测）。
脚本（均在 tmp/，测试数据自建自清，DB 直查 `%APPDATA%/inkspire-desktop/inkspire.sqlite` 复核）：

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `tmp/m10-t1.mjs` | 验收点 1-7、12：入口/CRUD/双击面板挂词条/拖线建边/改类型/拖拽持久化/搜索高亮/级联删除 | **18/18 通过** |
| `tmp/m10-t2.mjs` | 验收点 8-9（AI 初始化真实出字 7 事件 6 连线；延伸 +3 事件避让落位 y=460） | 初始化/延伸全过；分歧首跑失败（见下） |
| `tmp/m10-t2b.mjs` | 验收点 10（分歧推演复跑：3 方向卡 → 采纳 → 1→4 事件，逻辑边标签=方向名） | **6/6 通过** |

自测中发现并修复的问题（均已提交 daefb63）：

1. **P0**：节点卡片 `overflow-hidden` 把右手柄外半截裁剪（裁剪边界=padding 盒），手柄中心点命中测试失败，
   拖线从右手柄无法发起——重构 PlotEventNode 结构（手柄移出裁剪层）。CDP 探针复验通过。
2. **P0**：分歧采纳把响应式 Proxy 数组直接过 IPC → "An object could not be cloned."（踩坑 #11 变体）——
   采纳入口 `JSON.parse(JSON.stringify(toRaw(dir)))` 深拷贝。复跑通过。
3. 分歧落位无占位避让（与延伸行重叠）——补逐行下移避让。

`npm run typecheck` 三重闸门全绿；控制台无报错（各脚本均断言 consoleErrors=0）。

## 实现定位

- 共享类型：`src/shared/plot.types.ts`
- 数据层：`src/main/db/database.ts`（migration v10）、`src/main/db/plot.ts`、`src/main/db/plotEdges.ts`
- IPC：`src/main/ipc/plot.ts`（wrap+assertUuid）、`src/main/index.ts`（注册）、`src/preload/index.ts`（api.plot/plotEdges）
- 渲染层：`src/renderer/src/views/PlotCanvasView.vue`（编排）+ `components/plot/`（PlotEventNode/PlotDetailPanel/PlotAiDialog/PlotDivergeDialog）
- AI：`services/plotPrompts.ts`（三模式提示词+宽容解析）、`composables/usePlotAi.ts`（生成编排+落库）、`composables/usePlotEdges.ts`（连线编辑）
- 入口：`router/index.ts`、`components/ChapterSidebar.vue`、`docs/design/architecture.md`（路由表已同步修正为 `/book/:bookId/plot`）

## 设计边界（按 HANDOVER M10 任务卡裁剪，防 scope 蔓延）

- 仅「剧情事件」一种节点；原站的灵感节点/章节引用节点/子画布/插入/素材组合模式不在本里程碑（灵感墙 M11 后续）
- `plot_events.parent_id` 为子画布预留列，M10 恒为 null；`plot:list` 保留 parentId 过滤位
- 连线视觉沿用章节画布三类配色，新增 reference（绿点线）；原站文档未定义四类连线视觉，此为自定设计
- AI 使用「默认档案」管线（resolveProfile），含 429/502/503/504 自动重试；提示词不使用内部流程术语（踩坑 #16），
  以「故事核心设定/分卷大纲」转述创世 step2/step4
- 事件标签色板 8 色哈希取色（标签决定节点视觉色，照原站文档描述）

## 已知边界

- 创世台未填写时 AI 仍可生成（上下文降级为书名+词条），不强制前置
- AI 输出为半截 JSON（流中途异常）时解析失败，提示「AI 输出格式异常」，可点「↻ 重写」重试
- 未引入 minimap/controls 依赖（保持零新增依赖）
- 无暗色主题适配（全项目统一浅色，预留 [data-theme=dark]）

---

# 复验附录（第二轮）——静态审查首轮问题回应与渲染层代码补齐

## 对首轮审查（llm-review-2026-09-06-06-55）的回应

| 首轮问题 | 回应与处置 |
|---|---|
| P0 渲染层 diff 不完整 | 系脚本 collectDiff 15000 字上限截断（本里程碑 diff 共 8 万字），非代码缺失。**本轮已将渲染层全部源码嵌入本材料附录**，请按附录静态核实验收点 4-11 |
| P0 parent_id 无 FK 策略 | 已在 migration v10 处补设计注释：预留列恒为 null，子画布需求落地时以 migration v11+ 补 FK（不改动已应用的 v10 历史迁移） |
| P1 反向连线去重策略 | 与 M7.5 章节画布 scene_edges 语义保持一致（方向承载因果，反向=矛盾），单击边可改类型/标签表达其他关系。维持现状，登记为已知设计边界 |
| P1 tags/wikiRefs 整体替换语义 | 设计即整体替换：详情面板每次提交完整标签数组与完整挂接列表（面板表单回填全量后编辑），不存在增量提交路径，无丢数据风险 |
| P1 默认落位 (count+1)*340 碰撞 | 该默认值仅 DAO 兜底；渲染层所有创建路径均显式传 posX/posY（手动新建取 MAX(pos_x)+340，AI 路径有避让），实际不会触发碰撞 |
| P1 wikiRefs 未校验 UUID | **已整改**：plot:create / plot:update 增加 assertWikiRefs 校验（commit d00e049） |
| P2 IPC 错误 shape / parseJson 静默 / tmp 脚本位置 | 与全项目既有约定一致（wrap/IpcResult 全域统一；parseJson 容错回退与 scenes.ts 同构；CDP 脚本按项目惯例放 tmp/），不做单域偏离 |
| 无法判定项 1-6（渲染交互） | 附录代码 + 黑盒验收（CDP 驱动真实 Electron）双重覆盖 |
| 无法判定项 7（跨书归属） | 与 M7 scenes/sceneEdges 同构：UUID 随机不可枚举 + 单机单用户信任边界（同 apiKey 明文债务的登记逻辑）。登记为已知边界，不单域加验 |
| 无法判定项 8（CASCADE/foreign_keys） | getDb() 初始化即执行 `pragma foreign_keys = ON`（database.ts），黑盒将实测删书级联 |
| 无法判定项 9（429 重试） | M9 已闭环（openaiCompatible.ts RETRYABLE_STATUS/MAX_RETRIES=3，本里程碑零改动），不在 M10 diff 内属预期 |
| 无法判定项 10（重启持久） | 黑盒验收将执行「写入→重启 app→再查」全链路 |

## 附录：渲染层全部源码（补齐被截断的 diff）


### src/renderer/src/composables/usePlotAi.ts
```
/**
 * 剧情画布 AI 三模式编排：初始化事件链 / 向后延伸 / 分歧推演。
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
        wikiText: wikiAlwaysText(alwaysIds, wikiEntries.value)
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

  /** 面板停止：中止当前流（中止会走 onError → 面板标记结束，不算错误路径） */
  function stopEverything(): void {
    activeSession?.abort()
    isBusy.value = false
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

  /** 延伸落位：锚点右侧一排；若右侧同排已被占则下移一行避让 */
  function freeRowYAfter(anchor: PlotEvent, count: number): number {
    const spanEnd = anchor.posX + (count + 1) * 340
    const occupied = events.value.some(
      (e) =>
        e.id !== anchor.id &&
        Math.abs(e.posY - anchor.posY) < 120 &&
        e.posX > anchor.posX &&
        e.posX <= spanEnd + 200
    )
    return occupied ? anchor.posY + 220 : anchor.posY
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
    openAiDialog,
    startPlotGen,
    stopEverything,
    acceptPlot,
    adoptDirection
  }
}
```

### src/renderer/src/composables/usePlotEdges.ts
```
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

  return { selectedEdge, edgeForm, flowEdges, onConnect, onEdgeClick, saveEdgeEdit, removeSelectedEdge }
}
```

### src/renderer/src/services/plotPrompts.ts
```
/**
 * 剧情画布提示词构造与解析：AI 三模式（初始化事件链 / 向后延伸 / 分歧推演）。
 * 上下文注入故事核心设定（创世台 step2）+ 分卷大纲（step4）+ 百科词条。
 * 提示词禁用「定魂/布局/创世台」等内部流程术语（踩坑 #16：AI 会当故事概念写进输出）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import type { Step2Soul, Step4Layout } from '../../../shared/genesis.types'
import type { PlotEvent } from '../../../shared/plot.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { lenientParse } from './jsonRepair'
import { wikiRefText } from './scenePrompts'

/** 事件草稿（AI 输出解析产物） */
export interface PlotEventDraft {
  title: string
  description: string
  tags: string[]
}

/** 分歧方向草稿 */
export interface PlotDirectionDraft {
  name: string
  summary: string
  events: PlotEventDraft[]
}

/** AI 生成弹窗提交载荷 */
export interface PlotGenStartPayload {
  instruction: string
  divergeCount: number
  divergeHints: string[]
}

/** 生成上下文（视图层组装） */
export interface PlotGenContext {
  book: Pick<Book, 'title' | 'genre' | 'description'>
  soul: Step2Soul | null
  layout: Step4Layout | null
  /** injection=always 的词条注入文本 */
  wikiText: string
}

/** injection=always 词条的注入文本（复用章节画布的词条拼接） */
export function wikiAlwaysText(ids: string[], wikiEntries: WikiEntry[]): string {
  return wikiRefText(ids, wikiEntries)
}

function plotSystemPrompt(book: Pick<Book, 'title' | 'genre' | 'description'>): string {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  if (book.description) meta.push(`简介：${book.description.slice(0, 200)}`)
  return [
    '你是一位资深网文剧情策划，擅长设计全书层面的剧情事件链与多线走向。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    '输出要求：事件因果清晰、节奏递进、标签精准；中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/** 故事核心设定文本（step2 数据转述，不出现内部术语） */
export function soulText(soul: Step2Soul | null): string {
  if (!soul) return ''
  const parts: string[] = []
  if (soul.logline) parts.push(`一句话主线：${soul.logline}`)
  const g = soul.genre
  if (g) {
    const bits = [g.mainType, g.subType, g.targetReader, g.mood].filter(Boolean)
    if (bits.length) parts.push(`题材基调：${bits.join('/')}`)
  }
  const c = soul.cheat
  if (c && (c.coreAbility || c.powerSystem)) {
    parts.push(`主角金手指：${[c.coreAbility, c.powerSystem, c.limitation].filter(Boolean).join('；')}`)
  }
  const f = soul.conflict
  if (f) {
    const bits: string[] = []
    if (f.opening) bits.push(`开局：${f.opening}`)
    if (f.mainline) bits.push(`主线：${f.mainline}`)
    if (f.ultimate) bits.push(`终极目标：${f.ultimate}`)
    if (f.villain) bits.push(`反派：${f.villain}`)
    if (bits.length) parts.push(`核心冲突——${bits.join('；')}`)
  }
  return parts.join('\n')
}

/** 分卷大纲文本（step4 卷章，截断防爆量） */
export function layoutText(layout: Step4Layout | null, limit = 900): string {
  if (!layout?.volumes?.length) return ''
  const lines: string[] = []
  for (const v of layout.volumes) {
    const chs = (v.chapters ?? [])
      .map((c, i) => `第${i + 1}章 ${c.title}：${c.outline}`)
      .join('\n')
    lines.push(`《${v.name}》\n${chs}`)
  }
  const full = lines.join('\n')
  return full.length > limit ? full.slice(0, limit) + '…' : full
}

function contextBlocks(ctx: PlotGenContext): string[] {
  const blocks: string[] = []
  const soul = soulText(ctx.soul)
  if (soul) blocks.push(`【故事核心设定】\n${soul}`)
  const layout = layoutText(ctx.layout)
  if (layout) blocks.push(`【分卷大纲】\n${layout}`)
  if (ctx.wikiText) blocks.push(`【本书设定（必须遵守，不得写错名称与属性）】\n${ctx.wikiText}`)
  return blocks
}

const EVENTS_JSON_SPEC = `严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  { "title": "事件名（20字内）", "description": "事件描述：起因/经过/结果，80-150字", "tags": ["标签1", "标签2"] }
]
标签从这些里选或自拟：开局、铺垫、冲突、高潮、转折、伏笔、回收、感情、打斗、危机。每个事件 1-3 个标签。`

const DIVERGE_JSON_SPEC = `严格输出如下 JSON 对象（不要任何额外文字、不要 markdown 代码块）：
{
  "directions": [
    { "name": "方向名（12字内）", "summary": "该方向一句话概述", "events": [ { "title": "事件名", "description": "起因/经过/结果，60-120字", "tags": ["标签"] } ] }
  ]
}`

/** 初始化事件链：空画布按核心设定+大纲生成 5-8 个事件 */
export function buildPlotInitMessages(ctx: PlotGenContext, instruction: string): ChatMessage[] {
  const task =
    '【任务】这部作品还没有剧情事件。请设计一条初始剧情事件链：5-8 个事件，按故事时间顺序排列，覆盖从开局到第一卷高潮的主干脉络，事件之间因果衔接、矛盾逐步升级。'
  return [
    { role: 'system', content: plotSystemPrompt(ctx.book) },
    {
      role: 'user',
      content: [
        ...contextBlocks(ctx),
        task,
        instruction ? `补充要求：${instruction}` : '',
        EVENTS_JSON_SPEC
      ]
        .filter(Boolean)
        .join('\n\n')
    }
  ]
}

/** 向后延伸：基于选中事件（含相邻链上下文）向后生成 2-4 个后续事件 */
export function buildPlotExtendMessages(
  ctx: PlotGenContext,
  anchor: PlotEvent,
  chain: PlotEvent[],
  instruction: string
): ChatMessage[] {
  const chainLines = chain.map((e) => {
    const mark = e.id === anchor.id ? ' ←选中事件（从这里向后延伸）' : ''
    return `- ${e.title}：${e.description.slice(0, 80) || '（无描述）'}${mark}`
  })
  const task = `【任务】以「${anchor.title}」为基准向后延伸剧情：生成 3 个左右后续事件（2-4 个），承接其结果、推进矛盾升级，与已有事件链保持因果一致。`
  return [
    { role: 'system', content: plotSystemPrompt(ctx.book) },
    {
      role: 'user',
      content: [
        ...contextBlocks(ctx),
        `【已有事件链（含相邻关系）】\n${chainLines.join('\n')}`,
        task,
        instruction ? `补充要求：${instruction}` : '',
        EVENTS_JSON_SPEC
      ]
        .filter(Boolean)
        .join('\n\n')
    }
  ]
}

/** 分歧推演：为选中事件设计 N 条不同走向，每条方向 2-4 个事件 */
export function buildPlotDivergeMessages(
  ctx: PlotGenContext,
  anchor: PlotEvent,
  directions: string[],
  instruction: string
): ChatMessage[] {
  const descLines = directions.map((d, i) =>
    d.trim() ? `方向${i + 1}：${d.trim()}` : `方向${i + 1}：（由你自由发挥）`
  )
  const task = [
    `【任务】以事件「${anchor.title}」为分歧点，设计 ${directions.length} 条截然不同的后续走向，每条方向 2-4 个事件。`,
    '各方向要有实质性差异（不同抉择/不同势力/不同代价），不要同质化。',
    `用户预想的走向：\n${descLines.join('\n')}`
  ].join('\n')
  return [
    { role: 'system', content: plotSystemPrompt(ctx.book) },
    {
      role: 'user',
      content: [
        ...contextBlocks(ctx),
        `【分歧点事件】${anchor.title}：${anchor.description || '（无描述）'}`,
        task,
        instruction ? `补充要求：${instruction}` : '',
        DIVERGE_JSON_SPEC
      ]
        .filter(Boolean)
        .join('\n\n')
    }
  ]
}

// ---- 解析（宽容 JSON：截取主体 → lenientParse → 字段降级） ----

/** 从 AI 文本截取 JSON 主体（首个 [ 或 { 到末个 ] 或 }） */
function jsonBody(text: string): string | null {
  const candidates = [text.indexOf('['), text.indexOf('{')].filter((n) => n >= 0)
  if (candidates.length === 0) return null
  const first = Math.min(...candidates)
  const last = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  if (last <= first) return null
  return text.slice(first, last + 1)
}

function toDraft(x: unknown): PlotEventDraft | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const title = String(o.title ?? '').trim()
  const description = String(o.description ?? o.summary ?? '').trim()
  if (!title && !description) return null
  return {
    title: (title || '未命名事件').slice(0, 40),
    description: description.slice(0, 400),
    tags: Array.isArray(o.tags)
      ? o.tags.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 3)
      : []
  }
}

/** 解析事件链输出（数组或 {events:[...]} 或单对象均可） */
export function parsePlotEventGen(text: string): PlotEventDraft[] {
  const body = jsonBody(text)
  if (!body) return []
  const parsed = lenientParse<unknown>(body)
  if (!parsed) return []
  const asRecord = parsed as Record<string, unknown>
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(asRecord.events)
      ? (asRecord.events as unknown[])
      : [parsed]
  return arr.map(toDraft).filter((d): d is PlotEventDraft => d !== null)
}

/** 解析分歧推演输出（{directions:[...]} 或顶层数组） */
export function parsePlotDivergeGen(text: string): PlotDirectionDraft[] {
  const body = jsonBody(text)
  if (!body) return []
  const parsed = lenientParse<unknown>(body)
  if (!parsed) return []
  const asRecord = parsed as Record<string, unknown>
  const rawDirs: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(asRecord.directions)
      ? (asRecord.directions as unknown[])
      : []
  const out: PlotDirectionDraft[] = []
  for (const d of rawDirs) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const events = Array.isArray(o.events)
      ? o.events.map(toDraft).filter((e): e is PlotEventDraft => e !== null)
      : []
    if (events.length === 0) continue
    out.push({
      name: String(o.name ?? '').trim().slice(0, 12) || '未命名方向',
      summary: String(o.summary ?? '').trim().slice(0, 120),
      events: events.slice(0, 4)
    })
  }
  return out.slice(0, 4)
}
```

### src/renderer/src/views/PlotCanvasView.vue
```
<script setup lang="ts">
/**
 * 剧情画布：Vue Flow 跨章节剧情事件编排（M10）。
 * 事件节点拖拽持久化；四类连线（主线/逻辑/关联/引用）；双击详情面板；搜索高亮；
 * AI 三模式（初始化事件链/向后延伸/分歧推演）。编辑逻辑在 composables/usePlotEdges、usePlotAi。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { VueFlow, useVueFlow, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { Book } from '../../../shared/book.types'
import type { PlotEdge, PlotEvent } from '../../../shared/plot.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { usePlotEdges } from '@/composables/usePlotEdges'
import { usePlotAi } from '@/composables/usePlotAi'
import PlotEventNode from '@/components/plot/PlotEventNode.vue'
import PlotDetailPanel from '@/components/plot/PlotDetailPanel.vue'
import PlotAiDialog from '@/components/plot/PlotAiDialog.vue'
import PlotDivergeDialog from '@/components/plot/PlotDivergeDialog.vue'
import AiWritingPanel from '@/components/AiWritingPanel.vue'
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

// ---- 连线编辑逻辑（创建/选中/编辑/删除 + 样式映射） ----
const { selectedEdge, edgeForm, flowEdges, onConnect, onEdgeClick, saveEdgeEdit, removeSelectedEdge } =
  usePlotEdges({ bookId, plotEdges, toast })

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

const selectedEvent = ref<PlotEvent | null>(null)

// ---- AI 三模式（初始化/延伸/分歧推演） ----
const {
  aiPanel,
  aiPanelVisible,
  isBusy,
  aiMode,
  aiDialogVisible,
  pendingDirections,
  genAnchor,
  aiModeLabel,
  aiModeHint,
  openAiDialog,
  startPlotGen,
  stopEverything,
  acceptPlot,
  adoptDirection
} = usePlotAi({ bookId, book, events, plotEdges, wikiEntries, selectedEvent, toast, fitView })

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
            class="w-44 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs outline-none focus:border-ink-primary"
          />
          <span v-if="searchKeyword.trim()" class="whitespace-nowrap text-xs text-ink-text-muted">{{ hitCount }} 命中</span>
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
        <!-- AI 三模式 -->
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          title="空画布：按故事核心设定生成分卷大纲主干事件链"
          @click="openAiDialog('init')"
        >✦ 初始化</button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
          :class="selectedEvent ? 'border-ink-primary text-ink-primary hover:bg-ink-primary-soft' : 'border-ink-border text-ink-text-muted'"
          :disabled="!selectedEvent"
          title="单击选中事件后可用：向后延伸生成后续事件"
          @click="openAiDialog('extend')"
        >→ 向后延伸</button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
          :class="selectedEvent ? 'border-ink-primary text-ink-primary hover:bg-ink-primary-soft' : 'border-ink-border text-ink-text-muted'"
          :disabled="!selectedEvent"
          title="单击选中事件后可用：推演多条分歧走向，择一采纳"
          @click="openAiDialog('diverge')"
        >⑃ 分歧推演</button>
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
          画布还是空的：点「✦ 初始化」让 AI 生成初始事件链，或「+ 手动加事件」
        </p>
      </div>
      <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-paper/70">
        <p class="text-ink-text-muted">加载画布…</p>
      </div>
    </div>

    <!-- AI 流式面板 -->
    <AiWritingPanel
      ref="aiPanel"
      :visible="aiPanelVisible"
      kind="continue"
      @accept="acceptPlot"
      @retry="startPlotGen()"
      @stop="stopEverything"
      @close="aiPanelVisible = false; isBusy = false"
    />

    <!-- AI 生成配置弹窗 -->
    <PlotAiDialog
      :visible="aiDialogVisible"
      :mode="aiMode"
      :mode-label="aiModeLabel"
      :hint="aiModeHint"
      :busy="isBusy"
      @start="startPlotGen"
      @close="aiDialogVisible = false"
    />

    <!-- 分歧推演方向选择弹窗 -->
    <PlotDivergeDialog
      :directions="pendingDirections"
      :anchor-title="genAnchor?.title ?? ''"
      @adopt="adoptDirection"
      @close="pendingDirections = []"
    />

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
```

### src/renderer/src/components/plot/PlotEventNode.vue
```
<script setup lang="ts">
/**
 * 剧情画布事件节点卡片：毛玻璃 + 左侧标签渐变色条 + 标题/描述/标签/镶嵌词条图标。
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
  `linear-gradient(90deg, ${tagColor(props.event.tags[0] ?? '')}, #cfc8ea)`
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
```

### src/renderer/src/components/plot/PlotDetailPanel.vue
```
<script setup lang="ts">
/**
 * 剧情事件详情/新建侧滑面板：标题/描述/标签/挂接词条。
 * 纯表单组件：提交与删除仅 emit，由父视图落库（父层深拷贝去 Proxy 过 IPC，踩坑 #11）。
 */
import { ref, watch } from 'vue'
import type { PlotEvent } from '../../../../shared/plot.types'
import type { WikiEntry } from '../../../../shared/wiki.types'
import { tagColor } from '../../services/plotStyle'

interface Props {
  visible: boolean
  /** null = 新建 */
  event: PlotEvent | null
  wikiEntries: WikiEntry[]
  defaultTitle: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  submit: [payload: { title: string; description: string; tags: string[]; wikiRefs: string[] }]
  remove: []
}>()

const form = ref({ title: '', description: '', tagsText: '', wikiRefs: [] as string[] })

// 打开/切换事件时回填表单（form 先于 watch 声明，踩坑 #18：watch immediate 引用的资源必须先声明）
watch(
  () => [props.visible, props.event?.id] as const,
  () => {
    if (!props.visible) return
    form.value = {
      title: props.event?.title ?? props.defaultTitle,
      description: props.event?.description ?? '',
      tagsText: props.event?.tags.join('、') ?? '',
      wikiRefs: [...(props.event?.wikiRefs ?? [])]
    }
  },
  { immediate: true }
)

/** 挂接/取消词条 */
function toggleWiki(id: string): void {
  const i = form.value.wikiRefs.indexOf(id)
  if (i >= 0) form.value.wikiRefs.splice(i, 1)
  else form.value.wikiRefs.push(id)
}

function submit(): void {
  const tags = form.value.tagsText
    .split(/[、,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  emit('submit', {
    title: form.value.title,
    description: form.value.description,
    tags,
    wikiRefs: [...form.value.wikiRefs]
  })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex justify-end bg-black/20"
      @click.self="emit('close')"
    >
      <div class="flex h-full w-[400px] flex-col bg-surface shadow-2xl">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
          <h2 class="font-semibold">{{ event ? '编辑剧情事件' : '新建剧情事件' }}</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="emit('close')">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">标题 *</span>
              <input
                v-model="form.title"
                maxlength="40"
                class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">描述（起因/经过/结果要点，AI 参考依据）</span>
              <textarea
                v-model="form.description"
                rows="6"
                class="resize-y rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">标签（顿号分隔，如 高潮、伏笔；首标签决定节点色条）</span>
              <input
                v-model="form.tagsText"
                placeholder="高潮、伏笔、打斗"
                class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
              <span v-if="form.tagsText.trim()" class="flex flex-wrap gap-1">
                <span
                  v-for="t in form.tagsText.split(/[、,，\s]+/).filter(Boolean)"
                  :key="t"
                  class="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                  :style="{ background: tagColor(t) }"
                >{{ t }}</span>
              </span>
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">挂接百科词条（AI 生成时参考设定）</span>
              <p v-if="wikiEntries.length === 0" class="text-xs text-ink-text-muted">
                百科还没有词条，可先去「百科」页创建
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="w in wikiEntries"
                  :key="w.id"
                  class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="
                    form.wikiRefs.includes(w.id)
                      ? 'border-ink-primary bg-ink-primary-soft text-ink-primary'
                      : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                  "
                  @click="toggleWiki(w.id)"
                >{{ w.name }}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 border-t border-ink-border/60 px-5 py-3">
          <button
            v-if="event"
            class="text-xs text-ink-danger hover:underline"
            @click="emit('remove')"
          >删除事件</button>
          <div class="ml-auto flex gap-2">
            <button
              class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
              @click="emit('close')"
            >取消</button>
            <button
              class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white hover:bg-ink-primary-hover"
              @click="submit"
            >{{ event ? '保存' : '创建' }}</button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
```

### src/renderer/src/components/plot/PlotAiDialog.vue
```
<script setup lang="ts">
/**
 * AI 生成配置弹窗：三模式共用（补充指令；分歧模式额外配置方向数与各方向简述，可留空）。
 * 照原站交互：方向简述留空由 AI 自由发挥；提交时 emit start 带全部配置。
 */
import { ref, watch } from 'vue'
import type { PlotGenMode } from '../../../../shared/plot.types'

interface Props {
  visible: boolean
  mode: PlotGenMode
  modeLabel: string
  hint: string
  busy: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  start: [payload: { instruction: string; divergeCount: number; divergeHints: string[] }]
  close: []
}>()

const instruction = ref('')
const divergeCount = ref(3)
const divergeHints = ref<string[]>(['', '', '', ''])

// 打开时重置输入（instruction 等先于 watch 声明，踩坑 #18）
watch(
  () => props.visible,
  (v) => {
    if (v) {
      instruction.value = ''
      divergeCount.value = 3
      divergeHints.value = ['', '', '', '']
    }
  }
)

function start(): void {
  emit('start', {
    instruction: instruction.value.trim(),
    divergeCount: divergeCount.value,
    divergeHints: [...divergeHints.value]
  })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      @click.self="emit('close')"
    >
      <div class="w-[480px] rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 class="font-semibold text-ink-primary">{{ modeLabel }}</h2>
        <p class="mt-1 text-xs text-ink-text-muted">{{ hint }}</p>
        <textarea
          v-model="instruction"
          rows="3"
          placeholder="补充指令（可留空）：如「突出女主视角」「节奏再快一些」"
          class="mt-3 w-full resize-y rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
        />
        <div v-if="mode === 'diverge'" class="mt-3">
          <div class="flex items-center gap-2 text-sm text-ink-text-secondary">
            分歧方向数
            <select
              v-model.number="divergeCount"
              class="rounded border border-ink-border bg-surface px-1.5 py-0.5 text-xs outline-none"
            >
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
            </select>
            <span class="text-xs text-ink-text-muted">各方向可填简短描述，留空由 AI 自由发挥</span>
          </div>
          <input
            v-for="i in divergeCount"
            :key="i"
            v-model="divergeHints[i - 1]"
            :placeholder="`方向${i}简述（可选）：如「拒绝师门、独自下山」`"
            maxlength="60"
            class="mt-1.5 w-full rounded-lg border border-ink-border px-3 py-1.5 text-xs outline-none focus:border-ink-primary"
          />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
            @click="emit('close')"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white shadow-card transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="busy"
            @click="start"
          >{{ busy ? '生成中…' : '开始生成' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
```

### src/renderer/src/components/plot/PlotDivergeDialog.vue
```
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
```
