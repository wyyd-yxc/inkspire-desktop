# M10.5 跨模块联动与同步 — 验收材料

- 日期：2026-09-06 · 会话 36（中断承接续跑）
- diff 基准：`v0.12.0`（静态审查请显式 `--base v0.12.0`；注意脚本 diff 截断 15000 字，本材料**附录含关键源码全量**）
- 提交链：01aa65d（第0步）→ 41e6387/99a24e0（记忆去重）→ fef377d（正文→百科）→ f6f26b3（剧情双向）→ 4c7cb4f（各页入口）→ 5c85364（自动同步）→ 5488aa0（自测两修）

## 范围（承接原计划，方案已经用户批准）

五条数据流打通六模块联动：A 正文→百科（AI 提取候选→确认面板勾选→入库默认 manual 幂等）；B 正文→记忆（prompt 注入已有+本地规范化双保险去重，未抽取章节批量+水位）；C 记忆存量清理（精确删+AI 近似合并走确认面板）；D 剧情↔正文/记忆双向（剧情 AI 上下文注入已写进度+既定事实；正文/场景 AI 注入剧情事件链槽位预算 1000）；E 创世台→百科（推送幂等）。工作台侧栏「⟳ 同步」弹窗、百科「从正文提取」、记忆页抽取增强+清理重复、创世台推送按钮、剧情 AI 弹窗联动信息行。自动同步两档（提醒=红点+toast 零 AI；静默=自动入库只增 ≤3 章/轮），设置分区即改即生效，App 级 60s 轻节拍。

## 验收点（双轨共同依据，沿用原计划 8 条）

1. 正文提取词条→候选面板→勾选采纳→入库（manual 默认），重复执行零同名重复
2. 同章二次抽取记忆不产生字面重复（近义重复由清理兜底）；「未抽取章节」批量可用且水位准确
3. 清理重复：完全重复直接清；近似重复经 AI 建议+确认面板合并
4. 正文 AI 写作提示词含剧情事件链（有事件时）；场景生成遵循事件因果
5. 剧情 AI 三模式出字体现已写进度与既定事实；弹窗显联动信息行（N 章·M 记忆·K 词条）
6. 自动同步：提醒档到点红点+提示零 AI 消耗；静默档自动入库只增 ≤3 章/轮；开关关闭不跑；设置与水位重启持久
7. 创世台推送词条幂等（与百科页「从创世台导入」同映射）
8. 各入口 busy 态正确、无 console 报错、重启后数据与水位持久

## 开发自测声明

环境：`npm run dev -- --remote-debugging-port=9222`，CDP 驱动真实 Electron；每次改码后完全重启再测（踩坑 #13）。测试数据自建自清（专用书删除后 DB 直查复核零残留）。脚本均在 tmp/：

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `tmp/m105-t1.mjs` | 验收点 1/2/3/7：百科提取（12 词条入库 manual+水位推进+复跑按钮 disabled+零重复）／记忆抽取+清水位强抽二抽（零字面重复+水位补齐）／清理重复（2 相同→1）／创世推送（character/lore always+复推幂等） | **18/18** |
| `tmp/m105-t2.mjs` | 验收点 4/5：剧情 AI 弹窗信息行「已联动：1 章进度 · 1 条记忆 · 1 条常驻设定」／剧情延伸真实出字 4 事件 3 连线／正文 AI 续写真实出字采纳后字数 110→751 | **8/8** |
| `tmp/m105-t3.mjs` | 验收点 6：设置分区落库→提醒档 70s tick 自动置红点（零 AI 入库）→开弹窗红点清除→切静默档自动入库 7 词条（manual）→复跑零新增→水位两章齐→关闭后检测按钮禁用→状态落库 | **12/12** |
| `tmp/m105-t4.mjs` | 验收点 6/8：taskkill 重启 dev 后设置回显（开/30min）+ 水位跨重启保留 | **4/4** |

`npm run typecheck` 三重闸门全绿。

**自测发现并已修复的应用缺陷（5488aa0）**：

1. **P1 水位并发竞态**：「全重复章节自动推水」（异步）与「确认面板采纳推水」并发时各自基于过期快照 spread，后写覆盖先写致水位丢失（T1 二抽实锤：两章水位只剩一章）——`syncService.setWatermarkChapter` 改为以 DB 最新值合并写（current 参数仅兼容签名）。
2. **P2 混合场景推水缺失**：批量抽取中「部分章节有新候选、部分章节全重复」时，全重复章节不推水位，下轮重抽白耗 AI 额度——useWikiSync/useMemorySync 的 handleParsed 增补「全重复章节立即推水位」。

**已知设计边界（非缺陷，验收时按此口径）**：

- 近义（非字面）重复记忆可被 AI 二次抽出（本地 normText 只保证零字面重复；同义判定非确定，原计划明确不做 DB UNIQUE），由验收点 3「清理重复」兜底
- 静默档单章 AI 失败（如 429 退避耗尽）该章不推水位，下轮自动补抽；错误 toast 节流 10 分钟
- 静默入库与手动同步的理论并发：两者入库幂等（normText 双保险），最坏情况重复一次 AI 调用
- 水位为全局键按 chapterId(UUID) 隐式书级隔离，删书后残留旧键无害（changedChapters 只比当前书章节）

## 实现定位

- 编排：`composables/useWikiSync.ts`（百科提取+确认面板）、`useMemorySync.ts`（抽取+去重+清理）、`usePlotAi.ts`（refreshSyncContext 联动信息行+进度/事实注入）、`useAutoSync.ts`（App 级两档调度）
- 提示词/解析：`services/wikiPrompts.ts`（buildWikiExtractMessages/parse）、`memoryPrompts.ts`（extract+dedup）、`plotPrompts.ts`（进度/事实块）、`syncService.ts`（normText/水位/changedChapters 泛型/buildPlotChainText/buildProgressText/buildFactsText）
- UI：`components/sync/SyncDialog.vue`（工作台弹窗）、`SyncCandidateDialog.vue`（通用勾选确认，还清 M9 技术债）、`WikiExtractDialog.vue`；`SettingsView.vue` 同步分区（即改即存）
- 注入链：`ChapterEditor.vue` loadGenesis/loadWiki/loadMemory/loadPlot 四路（预算 1200/1200/1000）→ `aiWriting.ts` systemPrompt；`scenePrompts.ts` plotText；剧情侧 `refreshSyncContext` 拉 chapters:listMeta+memories
- 主进程：`main/ipc/settings.ts` 白名单（sync.* 6 键）、`main/ipc/chapters.ts` list-meta/get、preload api.chapters.listMeta/get
- 挂载：`App.vue` startAutoSync；`WorkspaceView.vue` syncAlert 接全局+clearAlert；`ChapterSidebar.vue` 红点（props.syncAlert）

## 附录：关键源码（防 diff 截断盲区；全文以 git 为准）

### src/renderer/src/composables/useAutoSync.ts

#### src/renderer/src/composables/useAutoSync.ts
```ts
/**
 * 自动同步全局调度（M10.5 第 6 步）：App 级定时检测正文变更 → 两档分派。
 * 提醒档：侧栏红点 + toast（检测零 AI 消耗）；静默档：自动幂等入库（只增不改，单轮 ≤3 章，消耗 AI 额度）。
 * 全局单例（仿 useToast）；设置即改即生效——固定 60s 轻 tick 内重读设置，达到间隔才真正检测，
 * 无需跨组件事件通知。入库链路与 useWikiSync/useMemorySync 同构（App 级无面板版，normText 双保险去重一致）。
 */
import { ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { ChapterMeta } from '../../../shared/chapter.types'
import type { ChatMessage } from '../../../shared/ai.types'
import type { WikiType } from '../../../shared/wiki.types'
import type { MemoryKind } from '../../../shared/memory.types'
import { isElectron } from '../services/books'
import { generateWriting } from '../services/aiWriting'
import { buildWikiExtractMessages, parseWikiExtract } from '../services/wikiPrompts'
import { buildMemoryExtractMessages, parseMemoryExtract } from '../services/memoryPrompts'
import {
  buildExistingWikiText
} from './useWikiSync'
import {
  changedChapters,
  getWatermark,
  normText,
  setWatermarkChapter,
  MEMORY_WATERMARK_KEY,
  WIKI_WATERMARK_KEY,
  type SyncWatermark
} from '../services/syncService'
import { useToast } from './useToast'

export type AutoSyncMode = 'remind' | 'silent'

export interface AutoSyncSettings {
  enabled: boolean
  intervalMin: number
  mode: AutoSyncMode
  targets: { wiki: boolean; memory: boolean }
}

const DEFAULT_SETTINGS: AutoSyncSettings = {
  enabled: false,
  intervalMin: 10,
  mode: 'remind',
  targets: { wiki: true, memory: true }
}

/** 轻节拍：每分钟醒一次读设置，判断是否到达检测间隔（读设置与 listMeta 均零 AI 消耗） */
const TICK_MS = 60_000
/** 静默档单轮章节上限（跨书合计；超出留下轮，原计划约定） */
const SILENT_MAX_CHAPTERS = 3
/** 同类失败 toast 节流（静默档连续失败不刷屏） */
const ERROR_THROTTLE_MS = 10 * 60_000

// ---- 模块级单例状态（红点由 WorkspaceView 经 useAutoSync() 消费） ----
const syncAlert = ref(false)
const silentRunning = ref(false)
let started = false
let lastCheckAt = 0
let lastAlertSig = ''
let lastErrorAt = 0

/** 读取自动同步设置（白名单键，默认值兜底；非法值归一化） */
export async function loadAutoSyncSettings(): Promise<AutoSyncSettings> {
  if (!isElectron) return { ...DEFAULT_SETTINGS }
  const [en, it, mo, tg] = await Promise.all([
    window.api.settings.get<boolean>('sync.auto_enabled', false),
    window.api.settings.get<number>('sync.auto_interval_min', 10),
    window.api.settings.get<AutoSyncMode>('sync.auto_mode', 'remind'),
    window.api.settings.get<{ wiki: boolean; memory: boolean }>('sync.auto_targets', {
      wiki: true,
      memory: true
    })
  ])
  return {
    enabled: en.ok && en.data === true,
    intervalMin: it.ok && (it.data === 5 || it.data === 10 || it.data === 30) ? it.data : 10,
    mode: mo.ok && mo.data === 'silent' ? 'silent' : 'remind',
    targets: {
      wiki: !(tg.ok && tg.data && tg.data.wiki === false),
      memory: !(tg.ok && tg.data && tg.data.memory === false)
    }
  }
}

export function useAutoSync() {
  return { syncAlert, silentRunning, clearAlert, loadSettings: loadAutoSyncSettings, checkNow: checkOnce }
}

/** App 挂载入口：启动 60s 轻节拍（重复调用安全） */
export function startAutoSync(): void {
  if (started || !isElectron) return
  started = true
  setInterval(() => void tick(), TICK_MS)
}

/** 清除提醒红点（用户打开同步弹窗即视为已知悉） */
function clearAlert(): void {
  syncAlert.value = false
  lastAlertSig = ''
}

async function tick(): Promise<void> {
  try {
    const s = await loadAutoSyncSettings()
    if (!s.enabled) return
    if (Date.now() - lastCheckAt < s.intervalMin * 60_000) return
    lastCheckAt = Date.now()
    await checkOnce(s)
  } catch {
    // 定时器内吞错（读设置/网络抖动），下个 tick 自动重试
  }
}

interface BookChange {
  book: Book
  metas: ChapterMeta[]
  memoryWatermark: SyncWatermark
  wikiWatermark: SyncWatermark
  memoryChanged: Array<{ id: string; wordCount: number }>
  wikiChanged: Array<{ id: string; wordCount: number }>
}

/** 立即检测一次（定时 tick 与设置页「立即检测」共用）；返回变更章数（跨书去重） */
export async function checkOnce(settings?: AutoSyncSettings): Promise<number> {
  if (!isElectron) return 0
  const s = settings ?? (await loadAutoSyncSettings())
  if (!s.enabled) return 0
  const toast = useToast()

  const booksRes = await window.api.books.list()
  if (!booksRes.ok) throw new Error(booksRes.error)
  const changes: BookChange[] = []
  for (const b of booksRes.data) {
    const metaRes = await window.api.chapters.listMeta(b.id)
    if (!metaRes.ok) throw new Error(metaRes.error)
    const [mw, ww] = await Promise.all([
      getWatermark(MEMORY_WATERMARK_KEY),
      getWatermark(WIKI_WATERMARK_KEY)
    ])
    changes.push({
      book: b,
      metas: metaRes.data,
      memoryWatermark: mw,
      wikiWatermark: ww,
      memoryChanged: s.targets.memory ? changedChapters(metaRes.data, mw) : [],
      wikiChanged: s.targets.wiki ? changedChapters(metaRes.data, ww) : []
    })
  }
  // 跨书去重后的变更章数（同一章同时挂两个水位只计一次）
  const changedIds = new Set<string>()
  for (const x of changes) {
    for (const c of x.memoryChanged) changedIds.add(c.id)
    for (const c of x.wikiChanged) changedIds.add(c.id)
  }
  if (changedIds.size === 0) {
    if (syncAlert.value) syncAlert.value = false
    return 0
  }

  if (s.mode === 'remind') {
    syncAlert.value = true
    // 变更签名不变时不重复弹 toast（红点常亮即可，防每次检测刷屏）
    const sig = changes
      .map(
        (x) =>
          x.book.id +
          ':' +
          [...x.memoryChanged, ...x.wikiChanged].map((c) => c.id + '@' + c.wordCount).join(',')
      )
      .join('|')
    if (sig !== lastAlertSig) {
      lastAlertSig = sig
      toast.info(`${changedIds.size} 章有变更，可到工作台点「⟳ 同步」推送到百科与记忆`)
    }
    return changedIds.size
  }

  // ---- 静默档：自动入库（只增不改），单轮跨书合计 ≤3 章 ----
  if (silentRunning.value) return changedIds.size
  silentRunning.value = true
  try {
    type Job = { change: BookChange; meta: ChapterMeta }
    const jobs: Job[] = []
    for (const x of changes) {
      const ids = new Set([...x.memoryChanged.map((c) => c.id), ...x.wikiChanged.map((c) => c.id)])
      for (const meta of x.metas) {
        if (ids.has(meta.id)) jobs.push({ change: x, meta })
      }
    }
    jobs.sort((a, b) => a.meta.sortOrder - b.meta.sortOrder)
    const round = jobs.slice(0, SILENT_MAX_CHAPTERS)
    let wikiCreated = 0
    let memCreated = 0
    for (const job of round) {
      try {
        const r = await silentSyncChapter(s, job.change, job.meta)
        wikiCreated += r.wiki
        memCreated += r.memory
      } catch (err) {
        // 单章失败（多为档案/网络问题）即停本轮，水位未推、下轮重试；toast 节流防刷屏
        throttledError(err)
        break
      }
    }
    if (wikiCreated + memCreated > 0) {
      const remain = jobs.length - round.length
      toast.success(
        `自动同步：新增词条 ${wikiCreated} · 新增记忆 ${memCreated}` +
          (remain > 0 ? `（另有 ${remain} 章待下轮处理）` : '')
      )
    }
  } finally {
    silentRunning.value = false
  }
  return changedIds.size
}

function throttledError(err: unknown): void {
  if (Date.now() - lastErrorAt < ERROR_THROTTLE_MS) return
  lastErrorAt = Date.now()
  useToast().error(err instanceof Error ? err.message : '自动同步失败')
}

/** 静默档单章处理：AI 提取 → normText 双保险去重 → 直接入库（只增不改）→ 推进对应水位 */
async function silentSyncChapter(
  s: AutoSyncSettings,
  change: BookChange,
  meta: ChapterMeta
): Promise<{ wiki: number; memory: number }> {
  const chRes = await window.api.chapters.get(meta.id)
  if (!chRes.ok) throw new Error(chRes.error)
  const ch = chRes.data
  const text = ch.content.replace(/<[^>]+>/g, '').trim()
  let wikiCreated = 0
  let memCreated = 0
  if (!text) return { wiki: 0, memory: 0 }

  if (s.targets.wiki) {
    const listRes = await window.api.wiki.list(change.book.id)
    if (!listRes.ok) throw new Error(listRes.error)
    const entries = listRes.data
    const out = await collectAi(
      buildWikiExtractMessages(
        change.book,
        ch.title,
        ch.sortOrder,
        text,
        buildExistingWikiText(entries)
      )
    )
    const existingNorm = new Set(entries.map((w) => normText(w.name)))
    const batchSeen = new Set<string>()
    for (const c of parseWikiExtract(out)) {
      const n = normText(c.name)
      if (!n || existingNorm.has(n) || batchSeen.has(n)) continue
      batchSeen.add(n)
      const res = await window.api.wiki.create({
        bookId: change.book.id,
        type: c.type as WikiType,
        name: c.name,
        summary: c.summary,
        injection: 'manual'
      })
      if (!res.ok) throw new Error(res.error)
      wikiCreated++
    }
    change.wikiWatermark = await setWatermarkChapter(
      WIKI_WATERMARK_KEY,
      change.wikiWatermark,
      ch.id,
      ch.wordCount
    )
  }
  if (s.targets.memory) {
    const listRes = await window.api.memories.list(change.book.id)
    if (!listRes.ok) throw new Error(listRes.error)
    const existing = listRes.data
    const messages = buildMemoryExtractMessages(
      change.book,
      ch.title,
      ch.sortOrder,
      text,
      buildExistingMemoryLines(existing)
    )
    const out = await collectAi(messages)
    const existingNorm = new Set(existing.map((m) => normText(m.content)))
    const batchSeen = new Set<string>()
    for (const c of parseMemoryExtract(out)) {
      const n = normText(c.content)
      if (!n || existingNorm.has(n) || batchSeen.has(n)) continue
      batchSeen.add(n)
      const res = await window.api.memories.create({
        bookId: change.book.id,
        kind: c.kind as MemoryKind,
        content: c.content,
        chapterNo: ch.sortOrder,
        source: 'ai'
      })
      if (!res.ok) throw new Error(res.error)
      memCreated++
    }
    change.memoryWatermark = await setWatermarkChapter(
      MEMORY_WATERMARK_KEY,
      change.memoryWatermark,
      ch.id,
      ch.wordCount
    )
  }
  return { wiki: wikiCreated, memory: memCreated }
}

/** 已有记忆清单文本（与 syncService.buildExistingMemoryText 同构；避免额外 import Memory 类型依赖） */
function buildExistingMemoryLines(memories: Array<{ content: string }>, limit = 1500): string {
  const out: string[] = []
  let used = 0
  for (const m of memories) {
    const line = `- ${m.content}`
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}

/** 无面板 AI 收集（静默档专用；流式增量丢弃，仅汇总） */
function collectAi(messages: ChatMessage[]): Promise<string> {
  let acc = ''
  return new Promise<string>((resolve, reject) => {
    void generateWriting(messages, {
      onChunk: (t) => {
        acc += t
      },
      onDone: () => resolve(acc),
      onError: (m) => reject(new Error(m))
    })
  })
}
```

#### src/renderer/src/composables/useWikiSync.ts
```ts
/**
 * 百科 AI 抽取编排（M10.5 正文→百科）：扫描章节正文提取词条候选 →
 * SyncCandidateDialog 勾选采纳 → 入库（默认 injection='manual'，不自动进正文上下文）+ 水位推进。
 * 按 name 规范化幂等（不覆盖已有词条）；单轮上限 20 章防误触长任务。
 */
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { WikiEntry, WikiType } from '../../../shared/wiki.types'
import { WIKI_TYPE_LABELS } from '../../../shared/wiki.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildWikiExtractMessages,
  parseWikiExtract,
  type WikiExtractCandidate
} from '../services/wikiPrompts'
import {
  changedChapters,
  getWatermark,
  normText,
  setWatermarkChapter,
  WIKI_WATERMARK_KEY,
  type SyncWatermark
} from '../services/syncService'
import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { useToast } from './useToast'

/** 单轮提取章节上限（手动触发；自动同步另有 3 章上限） */
const MAX_CHAPTERS_PER_RUN = 20

/** 已有词条清单文本（注入提取 prompt 防同名/同义；useAutoSync 静默档复用） */
export function buildExistingWikiText(entries: WikiEntry[], limit = 800): string {
  const lines = entries.map((w) => `- ${WIKI_TYPE_LABELS[w.type]}｜${w.name}`)
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}

export function useWikiSync(deps: {
  /** 支持 ComputedRef（WikiView 的 bookId 为响应式路由参数，防跨书导航拿旧 id） */
  bookId: string | MaybeRefOrGetter<string>
  book: Ref<Pick<Book, 'title' | 'genre' | 'description'> | null>
  chapters: Ref<Chapter[]>
  wikiEntries: Ref<WikiEntry[]>
  toast: ReturnType<typeof useToast>
}) {
  const { book, chapters, wikiEntries, toast } = deps
  const bookId = () => toValue(deps.bookId)

  const extractDialogVisible = ref(false)
  const extractScope = ref<'changed' | 'single'>('changed')
  const extractChapterId = ref('')
  const runProgress = ref('')
  const isBusy = ref(false)
  let activeSession: StreamSession | null = null

  const candidateDialogVisible = ref(false)
  const candidateTitle = ref('采纳新词条候选')
  const candidateDescription = ref('')
  const candidateItems = ref<SyncCandidateItem[]>([])
  let pendingCreates = new Map<string, WikiExtractCandidate & { chapterId: string; chapterNo: number }>()

  const watermark = ref<SyncWatermark>({})
  async function refreshWatermark(): Promise<void> {
    watermark.value = await getWatermark(WIKI_WATERMARK_KEY)
  }
  const unextracted = computed(() => changedChapters(chapters.value, watermark.value))

  async function openExtractDialog(): Promise<void> {
    if (chapters.value.length === 0) {
      toast.error('请先在正文中撰写章节内容')
      return
    }
    await refreshWatermark()
    extractScope.value = 'changed'
    extractChapterId.value = chapters.value[chapters.value.length - 1].id
    runProgress.value = ''
    extractDialogVisible.value = true
  }

  /** 单章静默抽取（无流式面板，弹窗内进度） */
  async function extractOnce(ch: Chapter): Promise<WikiExtractCandidate[]> {
    const text = ch.content.replace(/<[^>]+>/g, '').trim()
    if (!text) throw new Error(`「${ch.title}」还没有正文`)
    if (!book.value) throw new Error('书籍信息未加载')
    const messages = buildWikiExtractMessages(
      book.value,
      ch.title,
      ch.sortOrder,
      text,
      buildExistingWikiText(wikiEntries.value)
    )
    let acc = ''
    const promise = new Promise<string>((resolve, reject) => {
      void generateWriting(messages, {
        onChunk: (t) => {
          acc += t
        },
        onDone: () => resolve(acc),
        onError: (m) => reject(new Error(m))
      }).then(({ session }) => {
        activeSession = session
      })
    })
    return parseWikiExtract(await promise)
  }

  async function startWikiExtract(): Promise<void> {
    if (isBusy.value) return
    const scope = extractScope.value
    isBusy.value = true
    try {
      let targets: Chapter[]
      if (scope === 'single') {
        const ch = chapters.value.find((c) => c.id === extractChapterId.value)
        if (!ch) return
        targets = [ch]
      } else {
        const changed = changedChapters(chapters.value, watermark.value)
        if (changed.length === 0) {
          toast.info('没有待提取的章节（全部章节都已提取且未改动）')
          return
        }
        targets = changed.slice(0, MAX_CHAPTERS_PER_RUN)
        if (changed.length > targets.length) {
          toast.info(`本轮最多处理 ${MAX_CHAPTERS_PER_RUN} 章，其余章节请再次执行`)
        }
      }
      const collected: Array<WikiExtractCandidate & { chapterId: string; chapterNo: number }> = []
      const involved: string[] = []
      for (let i = 0; i < targets.length; i++) {
        const ch = targets[i]
        runProgress.value = `${i + 1}/${targets.length} · 第${ch.sortOrder}章 ${ch.title}`
        try {
          const parsed = await extractOnce(ch)
          for (const c of parsed) collected.push({ ...c, chapterId: ch.id, chapterNo: ch.sortOrder })
          involved.push(ch.id)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('已中止')) break
          throw err
        }
      }
      handleParsed(collected, involved)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提取失败'
      if (!msg.includes('已中止')) toast.error(msg)
    } finally {
      isBusy.value = false
      runProgress.value = ''
    }
  }

  /** 候选按名称规范化去重（同名/同义跳过）→ 打开确认面板 */
  function handleParsed(
    list: Array<WikiExtractCandidate & { chapterId: string; chapterNo: number }>,
    chapterIds: string[]
  ): void {
    const existingNorm = new Set(wikiEntries.value.map((w) => normText(w.name)))
    const batchSeen = new Set<string>()
    let dupCount = 0
    const unique: Array<WikiExtractCandidate & { chapterId: string; chapterNo: number }> = []
    for (const c of list) {
      const n = normText(c.name)
      if (!n || existingNorm.has(n) || batchSeen.has(n)) {
        dupCount++
        continue
      }
      batchSeen.add(n)
      unique.push(c)
    }
    if (unique.length === 0) {
      toast.info(`AI 未提取到新词条（${dupCount} 条与已有词条重复，已自动跳过）`)
      if (chapterIds.length > 0) void advanceWatermark(new Set(chapterIds))
      return
    }
    // 混合场景：全部候选都是重复的章节视为已提取完成，立即推水位（防下轮重抽白耗额度）
    const chapterWithUnique = new Set(unique.map((c) => c.chapterId))
    const allDupChapters = [...new Set(list.map((c) => c.chapterId))].filter((id) => !chapterWithUnique.has(id))
    if (allDupChapters.length > 0) void advanceWatermark(new Set(allDupChapters))
    pendingCreates = new Map(unique.map((c, i) => [`${c.chapterNo}:${i}`, c] as const))
    candidateTitle.value = '采纳新词条候选'
    candidateItems.value = unique.map((c, i) => ({
      key: `${c.chapterNo}:${i}`,
      title: c.name,
      detail: c.summary,
      source: `第${c.chapterNo}章 ${chapters.value.find((x) => x.id === c.chapterId)?.title ?? ''}`,
      tag: WIKI_TYPE_LABELS[c.type as WikiType] ?? c.type,
      checked: true
    }))
    candidateDescription.value =
      `共 ${unique.length} 条新候选${dupCount > 0 ? `，已自动跳过 ${dupCount} 条与已有词条重复的候选` : ''}。` +
      '入库后默认「仅手动引用」，可在词条详情改为「全书长期生效」。取消勾选的章节不推进水位。'
    candidateDialogVisible.value = true
  }

  /** 确认采纳：逐条入库（默认 manual），仅采纳了候选的章节推进水位 */
  async function onCandidatesConfirm(checked: SyncCandidateItem[]): Promise<void> {
    let created = 0
    const acceptedChapters = new Set<string>()
    try {
      for (const item of checked) {
        const c = pendingCreates.get(item.key)
        if (!c) continue
        const res = await window.api.wiki.create({
          bookId: bookId(),
          type: c.type as WikiType,
          name: c.name,
          summary: c.summary,
          injection: 'manual'
        })
        if (!res.ok) throw new Error(res.error)
        wikiEntries.value.push(res.data)
        acceptedChapters.add(c.chapterId)
        created++
      }
      await advanceWatermark(acceptedChapters)
      toast.success(`已入库 ${created} 个词条（默认仅手动引用）`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入库失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  async function advanceWatermark(chapterIds: Set<string>): Promise<void> {
    for (const id of chapterIds) {
      const ch = chapters.value.find((c) => c.id === id)
      if (ch) watermark.value = await setWatermarkChapter(WIKI_WATERMARK_KEY, watermark.value, id, ch.wordCount)
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  return {
    extractDialogVisible,
    extractScope,
    extractChapterId,
    unextracted,
    refreshWatermark,
    runProgress,
    isBusy,
    candidateDialogVisible,
    candidateTitle,
    candidateItems,
    candidateDescription,
    openExtractDialog,
    startWikiExtract,
    stopEverything,
    onCandidatesConfirm
  }
}
```

#### src/renderer/src/composables/useMemorySync.ts
```ts
/**
 * 作品记忆 AI 抽取与去重编排（M10.5）：单章/未抽取批量抽取 → 候选确认面板勾选采纳 → 入库 + 水位推进。
 * 去重双保险：prompt 注入已有记忆（AI 级防同义）+ 入库前规范化比对（本地级）。
 */
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { Memory, MemoryKind } from '../../../shared/memory.types'
import { MEMORY_KIND_LABELS } from '../../../shared/memory.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildMemoryDedupMessages,
  buildMemoryExtractMessages,
  parseMemoryDedup,
  parseMemoryExtract,
  type MemoryCandidate,
  type MemoryMergeSuggestion
} from '../services/memoryPrompts'
import {
  buildExistingMemoryText,
  changedChapters,
  getWatermark,
  MEMORY_WATERMARK_KEY,
  normText,
  setWatermarkChapter,
  type MemCandidateWithSource,
  type SyncWatermark
} from '../services/syncService'

import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { useToast } from './useToast'

/** 记忆类型角标色（与 MemoryView 列表色点一致，单一来源） */
export const MEMORY_KIND_TAG_COLORS: Record<MemoryKind, string> = {
  plot: '#6c5ce7', stage: '#2e7d74', character: '#b06f2a', relationship: '#9d3f63', clue: '#3a6fa8'
}

export function useMemorySync(deps: {
  /** 支持 ComputedRef（WorkspaceView 的 bookId 为响应式路由参数，防跨书导航拿旧 id——与 useWikiSync 同款） */
  bookId: string | MaybeRefOrGetter<string>
  book: Ref<Pick<Book, 'title' | 'genre' | 'description'> | null>
  chapters: Ref<Chapter[]>
  memories: Ref<Memory[]>
  toast: ReturnType<typeof useToast>
}) {
  const { book, chapters, memories, toast } = deps
  const bookId = () => toValue(deps.bookId)

  // ---- 抽取状态 ----
  const extractDialogVisible = ref(false)
  const extractChapterId = ref('')
  const extractScope = ref<'single' | 'unextracted'>('single')
  const aiPanel = ref<{ append: (t: string) => void; reset: () => void; finish: () => void; fail: () => void } | null>(null)
  const aiPanelVisible = ref(false)
  const isBusy = ref(false)
  let activeSession: StreamSession | null = null
  let lastRun: { scope: 'single' | 'unextracted'; chapterId: string } | null = null

  // ---- 候选确认状态 ----
  const candidateDialogVisible = ref(false)
  const candidateTitle = ref('采纳新记忆候选')
  const candidateDescription = ref('')
  const candidateItems = ref<SyncCandidateItem[]>([])
  /** 候选回查表：key → 待入库数据 */
  let pendingCreates = new Map<string, MemCandidateWithSource>()

  // ---- 水位 ----
  const watermark = ref<SyncWatermark>({})
  async function refreshWatermark(): Promise<void> {
    watermark.value = await getWatermark(MEMORY_WATERMARK_KEY)
  }
  /** 「未抽取/已变更」章节（有内容且水位不符） */
  const unextracted = computed(() => changedChapters(chapters.value, watermark.value))

  async function openExtractDialog(): Promise<void> {
    if (chapters.value.length === 0) {
      toast.error('请先在正文中撰写章节内容')
      return
    }
    await refreshWatermark()
    extractScope.value = 'single'
    extractChapterId.value = chapters.value[chapters.value.length - 1].id
    extractDialogVisible.value = true
  }

  /** 单章流式抽取，返回解析后候选；中止抛错 */
  async function extractOnce(ch: Chapter): Promise<MemoryCandidate[]> {
    const text = ch.content.replace(/<[^>]+>/g, '').trim()
    if (!text) throw new Error(`「${ch.title}」还没有正文`)
    if (!book.value) throw new Error('书籍信息未加载')
    const messages = buildMemoryExtractMessages(
      book.value,
      ch.title,
      ch.sortOrder,
      text,
      buildExistingMemoryText(memories.value)
    )
    let acc = ''
    const promise = new Promise<string>((resolve, reject) => {
      void generateWriting(messages, {
        onChunk: (t) => {
          acc += t
          aiPanel.value?.append(t)
        },
        onDone: () => resolve(acc),
        onError: (m) => reject(new Error(m))
      }).then(({ session }) => {
        activeSession = session
      })
    })
    return parseMemoryExtract(await promise)
  }

  /** 开始抽取（单章流式；批量静默收集，面板仅显示进度行） */
  async function startExtract(): Promise<void> {
    if (isBusy.value) return
    const scope = extractScope.value
    lastRun = { scope, chapterId: extractChapterId.value }
    extractDialogVisible.value = false
    isBusy.value = true
    aiPanelVisible.value = true
    aiPanel.value?.reset()
    try {
      if (scope === 'single') {
        const ch = chapters.value.find((c) => c.id === extractChapterId.value)
        if (!ch) return
        const parsed = await extractOnce(ch)
        aiPanel.value?.finish()
        handleParsed(
          parsed.map((c) => ({ ...c, chapterId: ch.id, chapterNo: ch.sortOrder })),
          [ch.id]
        )
      } else {
        const targets = unextracted.value
        if (targets.length === 0) {
          toast.info('没有待抽取的章节（全部章节都已抽取且未改动）')
          aiPanelVisible.value = false
          return
        }
        const collected: MemCandidateWithSource[] = []
        const involved: string[] = []
        for (const ch of targets) {
          aiPanel.value?.append(`\n【第${ch.sortOrder}章 ${ch.title}】抽取中…\n`)
          try {
            const parsed = await extractOnce(ch)
            aiPanel.value?.append(`得到 ${parsed.length} 条候选\n`)
            for (const c of parsed) {
              collected.push({ ...c, chapterId: ch.id, chapterNo: ch.sortOrder })
            }
            involved.push(ch.id)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('已中止')) {
              aiPanel.value?.append('\n（已中止）')
              break
            }
            aiPanel.value?.append(`失败：${msg}\n`)
          }
        }
        aiPanelVisible.value = false
        handleParsed(collected, involved)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '抽取失败'
      if (msg.includes('已中止')) aiPanelVisible.value = false
      else toast.error(msg)
    } finally {
      isBusy.value = false
    }
  }

  /** 候选去重（本地规范化，AI 级之外的第二道保险）→ 打开确认面板 */
  function handleParsed(
    list: MemCandidateWithSource[],
    chapterIds: string[]
  ): void {
    const existingNorm = new Set(memories.value.map((m) => normText(m.content)))
    const batchSeen = new Set<string>()
    let dupCount = 0
    const unique: MemCandidateWithSource[] = []
    for (const c of list) {
      const n = normText(c.content)
      if (!n || existingNorm.has(n) || batchSeen.has(n)) {
        dupCount++
        continue
      }
      batchSeen.add(n)
      unique.push(c)
    }
    if (unique.length === 0) {
      toast.info(`AI 未提取到新事实（${dupCount} 条与已有记忆重复，已自动跳过）`)
      aiPanelVisible.value = false
      if (chapterIds.length > 0) void advanceWatermark(new Set(chapterIds))
      return
    }
    // 混合场景：全部候选都是重复的章节视为已抽取完成，立即推水位（防下轮重抽白耗额度）
    const chapterWithUnique = new Set(unique.map((c) => c.chapterId))
    const allDupChapters = [...new Set(list.map((c) => c.chapterId))].filter((id) => !chapterWithUnique.has(id))
    if (allDupChapters.length > 0) void advanceWatermark(new Set(allDupChapters))
    candidateTitle.value = '采纳新记忆候选'
    pendingCreates = new Map(
      unique.map((c, i) => [`${c.chapterNo}:${i}`, c] as const)
    )
    candidateItems.value = unique.map((c, i) => ({
      key: `${c.chapterNo}:${i}`,
      title: c.content,
      source: `第${c.chapterNo}章 ${chapters.value.find((x) => x.id === c.chapterId)?.title ?? ''}`,
      tag: MEMORY_KIND_LABELS[c.kind as MemoryKind] ?? c.kind,
      tagColor: MEMORY_KIND_TAG_COLORS[c.kind as MemoryKind],
      checked: true
    }))
    candidateDescription.value =
      `共 ${unique.length} 条新候选${dupCount > 0 ? `，已自动跳过 ${dupCount} 条重复候选` : ''}；取消勾选的章节不推进「已抽取」水位。`
    candidateDialogVisible.value = true
  }

  /** 确认面板采纳：逐条入库；仅采纳了候选的章节推进水位 */
  async function confirmCandidates(checked: SyncCandidateItem[]): Promise<void> {
    let created = 0
    const acceptedChapters = new Set<string>()
    try {
      for (const item of checked) {
        const c = pendingCreates.get(item.key)
        if (!c) continue
        const res = await window.api.memories.create({
          bookId: bookId(),
          kind: c.kind as MemoryKind,
          content: c.content,
          chapterNo: c.chapterNo,
          source: 'ai'
        })
        if (!res.ok) throw new Error(res.error)
        memories.value.push(res.data)
        acceptedChapters.add(c.chapterId)
        created++
      }
      await advanceWatermark(acceptedChapters)
      toast.success(`已入库 ${created} 条记忆`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入库失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  async function advanceWatermark(chapterIds: Set<string>): Promise<void> {
    for (const id of chapterIds) {
      const ch = chapters.value.find((c) => c.id === id)
      if (ch) watermark.value = await setWatermarkChapter(MEMORY_WATERMARK_KEY, watermark.value, id, ch.wordCount)
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  function retryLast(): void {
    if (!lastRun || isBusy.value) return
    extractScope.value = lastRun.scope
    extractChapterId.value = lastRun.chapterId
    void startExtract()
  }

  // ---- 存量清理重复 ----
  const dedupRunning = ref(false)
  async function runCleanup(): Promise<void> {
    if (dedupRunning.value || memories.value.length < 2) {
      if (memories.value.length < 2) toast.info('记忆不足 2 条，无需清理')
      return
    }
    dedupRunning.value = true
    try {
      // 第一步：本地精确去重（免费，直接删，保留每组最早一条）
      const groups = new Map<string, Memory[]>()
      for (const m of memories.value) {
        const key = `${m.kind}:${normText(m.content)}`
        const arr = groups.get(key) ?? []
        arr.push(m)
        groups.set(key, arr)
      }
      const exactDupIds: string[] = []
      for (const arr of groups.values()) {
        if (arr.length < 2) continue
        const sorted = [...arr].sort((a, b) => a.chapterNo - b.chapterNo || a.createdAt.localeCompare(b.createdAt))
        for (const dup of sorted.slice(1)) exactDupIds.push(dup.id)
      }
      if (exactDupIds.length > 0) {
        for (const id of exactDupIds) {
          const res = await window.api.memories.remove(id)
          if (!res.ok) throw new Error(res.error)
        }
        memories.value = memories.value.filter((m) => !exactDupIds.includes(m.id))
        toast.success(`已清理 ${exactDupIds.length} 条完全重复的记忆`)
      }
      // 第二步：AI 近似合并（有足够条目才跑）
      if (memories.value.length >= 4) {
        const validIds = new Set(memories.value.map((m) => m.id))
        const messages = buildMemoryDedupMessages(
          memories.value.map((m) => ({ id: m.id, kind: m.kind, chapterNo: m.chapterNo, content: m.content }))
        )
        let acc = ''
        await new Promise<string>((resolve, reject) => {
          void generateWriting(messages, {
            onChunk: (t) => {
              acc += t
            },
            onDone: () => resolve(acc),
            onError: (m) => reject(new Error(m))
          }).then(({ session }) => {
            activeSession = session
          })
        })
        const suggestions = parseMemoryDedup(acc, validIds)
        if (suggestions.length === 0) {
          if (exactDupIds.length === 0) toast.info('没有发现重复的记忆')
          return
        }
        openMergeDialog(suggestions)
      } else if (exactDupIds.length === 0) {
        toast.info('没有发现重复的记忆')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '清理失败'
      if (!msg.includes('已中止')) toast.error(msg)
    } finally {
      dedupRunning.value = false
    }
  }

  let pendingMerges: MemoryMergeSuggestion[] = []
  function openMergeDialog(suggestions: MemoryMergeSuggestion[]): void {
    pendingMerges = suggestions
    candidateTitle.value = '合并近似重复记忆'
    candidateItems.value = suggestions.map((s, i) => ({
      key: `merge:${i}`,
      title: s.content,
      detail: `合并 ${s.sourceIds.length} 条近似记忆`,
      source: `第${s.chapterNo}章起`,
      tag: MEMORY_KIND_LABELS[s.kind],
      tagColor: MEMORY_KIND_TAG_COLORS[s.kind],
      checked: true
    }))
    candidateDescription.value = `AI 发现 ${suggestions.length} 组近似重复记忆，勾选采纳合并（删原条、入合并条）；取消勾选的组保持原样。`
    candidateDialogVisible.value = true
  }

  /** 合并建议采纳：删原条 + 入合并条 */
  async function confirmMerges(checked: SyncCandidateItem[]): Promise<void> {
    let merged = 0
    try {
      for (const item of checked) {
        const s = pendingMerges[Number(item.key.split(':')[1])]
        if (!s) continue
        const createRes = await window.api.memories.create({
          bookId: bookId(),
          kind: s.kind,
          content: s.content,
          chapterNo: s.chapterNo,
          source: 'ai'
        })
        if (!createRes.ok) throw new Error(createRes.error)
        for (const id of s.sourceIds) {
          const res = await window.api.memories.remove(id)
          if (!res.ok) throw new Error(res.error)
        }
        memories.value = memories.value.filter((m) => !s.sourceIds.includes(m.id))
        memories.value.push(createRes.data)
        merged++
      }
      toast.success(`已合并 ${merged} 组近似重复记忆`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '合并失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  /** 候选面板确认分流：key 前缀区分「新候选入库」与「近似合并」 */
  function onCandidatesConfirm(items: SyncCandidateItem[]): void {
    if (items.length === 0) return
    if (items[0].key.startsWith('merge:')) void confirmMerges(items)
    else void confirmCandidates(items)
  }

  return {
    extractDialogVisible,
    extractChapterId,
    extractScope,
    unextracted,
    refreshWatermark,
    aiPanel,
    aiPanelVisible,
    isBusy,
    dedupRunning,
    candidateDialogVisible,
    candidateTitle,
    candidateItems,
    candidateDescription,
    openExtractDialog,
    startExtract,
    retryLast,
    stopEverything,
    runCleanup,
    onCandidatesConfirm
  }
}
```

#### src/renderer/src/services/syncService.ts
```ts
/**
 * 跨模块同步服务（M10.5）：正文→百科/记忆抽取的编排基建。
 * 职责：文本规范化去重、抽取水位（settings）、已有上下文清单构建。
 * 约定：静默入库只增不改；一切清理/覆盖必须走候选确认面板。
 */
import type { ChapterMeta } from '../../../shared/chapter.types'
import type { Memory } from '../../../shared/memory.types'
import type { PlotEvent } from '../../../shared/plot.types'
import { isElectron } from './books'

/** 文本规范化：去空白与中英文标点、转小写（用于「内容级」重复判定） */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[。，、！？…；：""''「」『』（）,.!?;:()[\]{}'"\-—~·]/g, '')
}

/** 抽取水位：chapterId → 抽取时的 wordCount 快照 */
export type SyncWatermark = Record<string, number>

export const MEMORY_WATERMARK_KEY = 'sync.memory_watermark'
export const WIKI_WATERMARK_KEY = 'sync.wiki_watermark'

/** 读水位（键不存在返回空对象） */
export async function getWatermark(key: string): Promise<SyncWatermark> {
  if (!isElectron) return {}
  const res = await window.api.settings.get<SyncWatermark>(key, {})
  return res.ok && res.data && typeof res.data === 'object' ? res.data : {}
}

/** 写入某章水位。以 DB 最新值为基合并（current 参数仅兼容旧签名）：
 *  「全重复章节自动推水」与「确认面板采纳推水」可能并发，基于过期快照会互相覆盖（T1 自测实锤） */
export async function setWatermarkChapter(
  key: string,
  _current: SyncWatermark,
  chapterId: string,
  wordCount: number
): Promise<SyncWatermark> {
  const latest = isElectron ? await getWatermark(key) : _current
  const next = { ...latest, [chapterId]: wordCount }
  if (isElectron) {
    const res = await window.api.settings.set(key, next)
    if (!res.ok) throw new Error(res.error)
  }
  return next
}

/** 找出「有内容且水位不符」的章节（从未抽取=水位缺失，抽取后改过字数=水位过期）。
 *  泛型：传 Chapter[] 返回 Chapter[]（视图级），传 {id,wordCount} 轻量 meta 返回轻量（App 级自动同步） */
export function changedChapters<T extends { id: string; wordCount: number }>(
  chapters: T[],
  watermark: SyncWatermark
): T[] {
  return chapters.filter((c) => c.wordCount > 0 && watermark[c.id] !== c.wordCount)
}

/** 已有记忆清单文本（注入抽取 prompt，AI 级防重复；截断防爆量） */
export function buildExistingMemoryText(memories: Memory[], limit = 1500): string {
  const lines = memories.map((m) => `- ${m.content}`)
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}

/** 抽取候选（带来源章节） */
export interface MemCandidateWithSource {
  kind: string
  content: string
  isResolved: boolean
  chapterId: string
  chapterNo: number
}

// ---- 跨模块上下文文本构建（M10.5 剧情双向联动；拼装限额统一在此） ----

/** 剧情事件链文本（按画布 x 排序；正文/场景/剧情三处 AI 共用） */
export function buildPlotChainText(events: PlotEvent[], limit = 1000): string {
  const lines = [...events]
    .sort((a, b) => a.posX - b.posX)
    .map((e) => `- ${e.title}：${e.description.slice(0, 60) || '（无描述）'}`)
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}

/** 已写进度文本（章节标题+字数清单；剧情 AI 上下文用） */
export function buildProgressText(metas: ChapterMeta[], limit = 600): string {
  const lines = metas
    .filter((m) => m.wordCount > 0)
    .map((m) => `- 第${m.sortOrder}章 ${m.title}（${m.wordCount} 字）`)
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}

/** 既定事实文本（记忆清单；剧情 AI 上下文用） */
export function buildFactsText(memories: Memory[], limit = 800): string {
  const lines = memories.map((m) => `- ${m.content}`)
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}
```

### SettingsView 同步分区（template 片段）
```vue
      <!-- 自动同步（M10.5） -->
      <section v-if="syncCfg" class="mb-6 rounded-card bg-surface p-5 shadow-card">
        <h2 class="mb-1 font-semibold">自动同步</h2>
        <p class="mb-4 text-sm leading-relaxed text-ink-text-secondary">
          定期检测正文改动，把新设定与新事实同步到百科与作品记忆。只新增、绝不改写已有内容；
          提取结果默认「仅手动引用」，不会自动进入写作上下文。
        </p>
        <div class="flex flex-col gap-3 text-sm">
          <label class="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              :checked="syncCfg.enabled"
              @change="saveSync('enabled', ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex-1">启用自动同步</span>
            <span class="text-xs text-ink-text-muted">默认关闭</span>
          </label>
          <div class="flex items-center gap-2">
            <span class="text-ink-text-secondary">检测间隔</span>
            <select
              class="rounded border border-ink-border bg-surface px-2 py-1 text-xs outline-none"
              :value="syncCfg.intervalMin"
              @change="saveSync('intervalMin', Number(($event.target as HTMLSelectElement).value))"
            >
              <option :value="5">5 分钟</option>
              <option :value="10">10 分钟</option>
              <option :value="30">30 分钟</option>
            </select>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-ink-text-secondary">同步目标</span>
            <label class="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                :checked="syncCfg.targets.wiki"
                @change="saveSync('targets', { ...syncCfg.targets, wiki: ($event.target as HTMLInputElement).checked })"
              />设定词条
            </label>
            <label class="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                :checked="syncCfg.targets.memory"
                @change="saveSync('targets', { ...syncCfg.targets, memory: ($event.target as HTMLInputElement).checked })"
              />作品记忆
            </label>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-ink-text-secondary">提醒方式</span>
            <label class="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="sync-mode"
                value="remind"
                :checked="syncCfg.mode === 'remind'"
                @change="saveSync('mode', 'remind')"
              />提醒我<span class="text-xs text-ink-text-muted">（不消耗 AI）</span>
            </label>
            <label class="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="sync-mode"
                value="silent"
                :checked="syncCfg.mode === 'silent'"
                @change="saveSync('mode', 'silent')"
              />自动入库<span class="text-xs text-ink-text-muted">（每轮最多 3 章，消耗 AI 额度）</span>
            </label>
          </div>
          <div class="flex items-center gap-3">
            <button
              class="rounded-full border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary disabled:opacity-50"
              :disabled="checkingNow || !syncCfg.enabled"
              :title="syncCfg.enabled ? '立即检测章节变更' : '先启用自动同步'"
              @click="checkNow"
            >{{ checkingNow ? '检测中…' : '立即检测一次' }}</button>
            <span class="text-xs text-ink-text-muted">改动即时生效，无需保存</span>
          </div>
        </div>
      </section>
```

### usePlotAi.refreshSyncContext（联动信息行）
```ts
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
```
