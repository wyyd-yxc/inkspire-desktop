/**
 * 叙事档案提示词构造与解析：AI 从章节正文抽取事实变更候选 + 存量近似重复合并（严格 JSON + 宽容解析）。
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
    '你是一位长篇连载编辑，擅长从章节正文中提取影响后续剧情的事实变化',
    '（如角色受伤、关系破裂、获得道具、埋下伏笔、场景转移等）。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    '只提取「后续章节需要记住」的事实，忽略一次性细节；表述简洁明确；中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/** AI 抽取：扫描章节正文 → 事实候选数组（existingText 为已有记忆清单，M10.5 防重复） */
export function buildMemoryExtractMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  chapterTitle: string,
  chapterNo: number,
  contentText: string,
  existingText = ''
): ChatMessage[] {
  const existingBlock = existingText
    ? `\n【已有记忆（已入库，不要重复提取；意思相同仅措辞不同也算重复）】\n${existingText}\n`
    : ''
  return [
    { role: 'system', content: memorySystemPrompt(book) },
    {
      role: 'user',
      content: `请从以下章节正文提取事实变更，形成「叙事档案」候选。章节：第 ${chapterNo} 章「${chapterTitle}」。${existingBlock}

严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  {
    "kind": "plot|stage|character|relationship|clue",
    "content": "事实描述（40 字内，明确主语与变化）",
    "isResolved": false
  }
]
kind 五选一：plot=剧情状态进展 / stage=场景时间地点转移 / character=角色状态变化（受伤/获得/失去）/ relationship=人物关系变化 / clue=埋下未解的伏笔（isResolved 恒为 false）。
最多 6 条，宁缺毋滥；与已有记忆重复或同义的一律不要输出。字段值内禁止使用英文双引号。

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

// ---- 存量近似重复合并（M10.5 清理重复） ----

/** 合并建议结构 */
export interface MemoryMergeSuggestion {
  sourceIds: string[]
  kind: MemoryKind
  content: string
  chapterNo: number
}

/** 近似重复合并提示词：只合并「同一事实的近似表述」，不同事实不得合并 */
export function buildMemoryDedupMessages(
  memories: Array<{ id: string; kind: string; chapterNo: number; content: string }>
): ChatMessage[] {
  const lines = memories
    .slice(0, 80)
    .map((m) => `- ${m.id}｜${m.kind}｜第${m.chapterNo}章起｜${m.content}`)
  return [
    {
      role: 'system',
      content:
        '你是数据清理助手。给定一部小说的「叙事档案」条目列表（id｜类型｜起始章｜内容），找出表达**同一个事实**的近似重复组' +
        '（如「主角左臂骨折」与「林小天左臂已断」）。只合并确属同一事实的条目；不同事实、仅主题相近的一律不合并。'
    },
    {
      role: 'user',
      content: `请找出近似重复组并给出合并建议，严格输出 JSON 数组（不要额外文字、不要 markdown 代码块）：
[
  {
    "ids": ["被合并的条目 id，至少 2 个"],
    "kind": "plot|stage|character|relationship|clue",
    "content": "合并后的事实（40 字内，保留信息最完整的表述）",
    "chapterNo": 3
  }
]
chapterNo 取组内最小起始章。没有近似重复组就输出 []。最多 20 组。字段值内禁止使用英文双引号。

记忆条目：
${lines.join('\n')}`
    }
  ]
}

/** 解析合并建议（id 必须都在给定集合内，防幻觉 id） */
export function parseMemoryDedup(text: string, validIds: Set<string>): MemoryMergeSuggestion[] {
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  const obj = lenientParse<Array<{
    ids?: unknown
    kind?: string
    content?: string
    chapterNo?: number
  }>>(text.slice(first, last + 1))
  if (!Array.isArray(obj)) return []
  const out: MemoryMergeSuggestion[] = []
  for (const s of obj) {
    const ids = Array.isArray(s?.ids) ? s.ids.map(String).filter((id) => validIds.has(id)) : []
    if (ids.length < 2) continue
    if (!s?.content?.trim() || !VALID_KINDS.includes(String(s.kind))) continue
    const chapterNo = Math.max(1, Math.round(Number(s.chapterNo) || 1))
    out.push({
      sourceIds: [...new Set(ids)],
      kind: String(s.kind) as MemoryKind,
      content: String(s.content).trim().slice(0, 120),
      chapterNo
    })
    if (out.length >= 20) break
  }
  return out
}
