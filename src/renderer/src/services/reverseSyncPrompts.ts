/**
 * 反向同步提示词与文本工具（M10.7 正文中枢：其它模块变更 → 正文受限更新）。
 * AI 只负责「定位旧表述出现处并建议改写」，quote 必须逐字来自原文（应用前双重校验防幻觉）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Chapter } from '../../../shared/chapter.types'
import { lenientParse } from './jsonRepair'

/** HTML → 纯文本（存储正文为 <p>…</p>；实体按存储习惯解码） */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** 本地粗筛：章节纯文本包含旧值（或旧值前 2+ 字任一实质片段）才送 AI，控制上下文体量 */
export function chaptersMentioning(
  chapters: Chapter[],
  oldValue: string,
  perChapterTextLimit = 4000
): Array<{ chapter: Chapter; text: string }> {
  const key = oldValue.trim()
  if (!key) return []
  const hits: Array<{ chapter: Chapter; text: string }> = []
  for (const ch of chapters) {
    const text = htmlToText(ch.content)
    if (text.includes(key)) {
      hits.push({ chapter: ch, text: text.slice(0, perChapterTextLimit) })
    }
  }
  return hits
}

/** 定位候选（AI 输出解析产物） */
export interface LocateHit {
  chapterId: string
  quote: string
  suggestion: string
  reason: string
}

/** AI 定位提示词：给出含旧值的章节文本，要求逐字引用原文片段并给出改写 */
export function buildLocateMessages(params: {
  entityKind: string
  oldValue: string
  newValue: string
  context: string
  hits: Array<{ chapterTitle: string; chapterId: string; text: string }>
}): ChatMessage[] {
  const chapterBlocks = params.hits
    .map((h) => `【${h.chapterTitle}｜id=${h.chapterId}】\n${h.text}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        '你是小说文本一致性校对助手。设定/情节信息变更后，需要找出正文中沿用旧表述的句子并给出原位改写建议。你只定位与改写，绝不虚构原文。'
    },
    {
      role: 'user',
      content: `【变更】${params.entityKind}「${params.oldValue}」已变更为「${params.newValue}」。${params.context ? `补充：${params.context}。` : ''}
【任务】在下列章节文本中找出所有沿用旧表述「${params.oldValue}」的句子，给出原位改写建议。
【硬性要求】
- quote 必须是章节文本中**逐字存在**的连续片段（10-80 字），且必须完整包含旧表述「${params.oldValue}」；
- suggestion 是把 quote 中的旧表述替换后的整句改写，只改与变更相关的部分，其余文字保持原样；
- 正文没有出现旧表述的章节直接跳过；宁缺毋滥。

严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  { "chapterId": "章节 id（原样使用清单中给出的 id）", "quote": "逐字原文片段", "suggestion": "改写后的整句", "reason": "一句话理由" }
]
没有需要修改的出 []。

章节文本：
${chapterBlocks}`
    }
  ]
}

/** 解析定位输出（宽容 JSON + 字段清洗；quote 逐字校验由调用方对原文执行） */
export function parseLocate(text: string): LocateHit[] {
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  const parsed = lenientParse<unknown>(text.slice(first, last + 1))
  if (!Array.isArray(parsed)) return []
  const out: LocateHit[] = []
  for (const h of parsed) {
    const o = h as Record<string, unknown>
    const quote = String(o.quote ?? '').trim()
    const suggestion = String(o.suggestion ?? '').trim()
    const chapterId = String(o.chapterId ?? '').trim()
    if (!quote || !suggestion || !chapterId || quote === suggestion) continue
    out.push({
      chapterId,
      quote: quote.slice(0, 120),
      suggestion: suggestion.slice(0, 200),
      reason: String(o.reason ?? '').trim().slice(0, 60)
    })
  }
  return out.slice(0, 20)
}
