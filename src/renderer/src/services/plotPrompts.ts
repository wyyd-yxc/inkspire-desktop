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
