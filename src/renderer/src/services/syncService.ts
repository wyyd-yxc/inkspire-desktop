/**
 * 跨模块同步服务（M10.5）：正文→百科/记忆抽取的编排基建。
 * 职责：文本规范化去重、抽取水位（settings）、已有上下文清单构建。
 * 约定：静默入库只增不改；一切清理/覆盖必须走候选确认面板。
 */
import type { Chapter, ChapterMeta } from '../../../shared/chapter.types'
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

/** 写入某章水位 */
export async function setWatermarkChapter(
  key: string,
  watermark: SyncWatermark,
  chapterId: string,
  wordCount: number
): Promise<SyncWatermark> {
  const next = { ...watermark, [chapterId]: wordCount }
  if (isElectron) {
    const res = await window.api.settings.set(key, next)
    if (!res.ok) throw new Error(res.error)
  }
  return next
}

/** 找出「有内容且水位不符」的章节（从未抽取=水位缺失，抽取后改过字数=水位过期） */
export function changedChapters(chapters: Chapter[], watermark: SyncWatermark): Chapter[] {
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
