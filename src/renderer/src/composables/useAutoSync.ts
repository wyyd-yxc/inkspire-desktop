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
  isWikiNameDup,
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
    // M10.6：isWikiNameDup（全等+同类型前缀包含），与手动路径同强度
    const dupAgainst = (name: string, type: string): boolean =>
      entries.some((w) => isWikiNameDup(name, type, w.name, w.type))
    const batchSeen: Array<{ name: string; type: string }> = []
    for (const c of parseWikiExtract(out)) {
      if (
        !c.name.trim() ||
        dupAgainst(c.name, c.type) ||
        batchSeen.some((b) => isWikiNameDup(c.name, c.type, b.name, b.type))
      ) {
        continue
      }
      batchSeen.push({ name: c.name, type: c.type })
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
