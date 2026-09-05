/**
 * 作品记忆提示词构造与解析：AI 从章节正文抽取事实变更候选（严格 JSON + 宽容解析）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import type { MemoryKind } from '../../../shared/memory.types'
import { lenientParse } from './jsonRepair'

/** AI 抽取记忆的 system 提示 */
function memorySystemPrompt(book: Pick<Book, 'title' | 'genre' | 'description'>): string {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  return [
    '你是一位网文连载编辑，擅长从章节正文中提取影响后续剧情的事实变化',
    '（如角色受伤、关系破裂、获得道具、埋下伏笔、场景转移等）。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    '只提取「后续章节需要记住」的事实，忽略一次性细节；表述简洁明确；中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/** AI 抽取：扫描章节正文 → 事实候选数组 */
export function buildMemoryExtractMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  chapterTitle: string,
  chapterNo: number,
  contentText: string
): ChatMessage[] {
  return [
    { role: 'system', content: memorySystemPrompt(book) },
    {
      role: 'user',
      content: `请从以下章节正文提取事实变更，形成「作品记忆」候选。章节：第 ${chapterNo} 章「${chapterTitle}」。

严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  {
    "kind": "plot|stage|character|relationship|clue",
    "content": "事实描述（40 字内，明确主语与变化）",
    "isResolved": false
  }
]
kind 五选一：plot=剧情状态进展 / stage=场景时间地点转移 / character=角色状态变化（受伤/获得/失去）/ relationship=人物关系变化 / clue=埋下未解的伏笔（isResolved 恒为 false）。
最多 6 条，宁缺毋滥。字段值内禁止使用英文双引号。

正文：
${contentText.slice(0, 6000)}`
    }
  ]
}

/** 抽取候选结构 */
export interface MemoryCandidate {
  kind: MemoryKind
  content: string
  isResolved: boolean
}

const VALID_KINDS: readonly string[] = ['plot', 'stage', 'character', 'relationship', 'clue']

/** 解析抽取输出（宽容 JSON + 类型白名单过滤） */
export function parseMemoryExtract(text: string): MemoryCandidate[] {
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  const obj = lenientParse<Array<{ kind?: string; content?: string; isResolved?: boolean }>>(
    text.slice(first, last + 1)
  )
  if (!Array.isArray(obj)) return []
  return obj
    .filter((c) => c?.content?.trim() && VALID_KINDS.includes(String(c.kind)))
    .slice(0, 8)
    .map((c) => ({
      kind: String(c.kind) as MemoryKind,
      content: String(c.content).trim().slice(0, 120),
      isResolved: false
    }))
}
