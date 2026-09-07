/**
 * 设定集提示词构造与解析：AI 生成词条（严格 JSON + 容错解析）、
 * 构思台世界构建起草内容导入为词条。
 * 提示词使用面向故事的中性描述，不出现内部流程术语（踩坑 #16）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import type {
  WikiAttribute,
  WikiEntry,
  WikiSystemRole,
  WikiType
} from '../../../shared/wiki.types'
import { WIKI_TYPE_LABELS, WIKI_TYPES } from '../../../shared/wiki.types'
import type { Step3World } from '../../../shared/genesis.types'
import { lenientParse } from './jsonRepair'

/** AI 生成词条的 system 提示 */
function wikiSystemPrompt(book: Pick<Book, 'title' | 'genre' | 'description'>): string {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  if (book.description) meta.push(`简介：${book.description.slice(0, 200)}`)
  return [
    '你是一位资深长篇小说世界观架构师，擅长为长篇小说设计具体、自洽、可落地的设定。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    '输出要求：设定具体可落地、避免空话套话；与已有设定保持一致；中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/**
 * AI 生成词条：按类型+关键词生成全套字段，严格 JSON 输出。
 * @param existingNames 已有词条名（防撞名/鼓励关联）
 */
export function buildWikiGenerateMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  type: WikiType,
  keywords: string,
  existingNames: string[]
): ChatMessage[] {
  const existing = existingNames.length
    ? `已有设定词条（新词条须与之自洽、不得撞名）：${existingNames.join('、')}`
    : '（暂无已有词条）'
  return [
    { role: 'system', content: wikiSystemPrompt(book) },
    {
      role: 'user',
      content: `请为这本书设计一个「${WIKI_TYPE_LABELS[type]}」类型的设定词条。关键词/要求：${keywords || '（由你发挥，贴合本书题材）'}
${existing}
严格输出如下 JSON（不要任何额外文字、不要 markdown 代码块）：
{
  "name": "词条名称",
  "summary": "一句话简介（30 字内）",
  "content": "详细设定（150-400 字，具体可落地）",
  "attributes": [{ "key": "属性名", "value": "属性值" }],
  "systemRole": "${type === 'character' ? 'protagonist 或 important 或 villain 或留空' : type === 'lore' ? 'rule 或 foundation 或留空' : ''}"
}
attributes 给 2-4 个该类型最有用的属性（如角色给年龄/修为/武器，地点给方位/势力/特色）。systemRole 只能从 protagonist/important/villain/rule/foundation 中选或留空串。注意：所有字段值内部禁止使用英文双引号（引用请用「」）。`
    }
  ]
}

/** 解析 AI 生成的词条 JSON（容错：提取首个 { 到末个 } 子串；有任意非空内容即返回） */
export function parseWikiGenerate(
  text: string,
  type: WikiType
): {
  name: string
  summary: string
  content: string
  attributes: WikiAttribute[]
  systemRole: WikiSystemRole
} | null {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) return null
  // 宽容解析：字段值内未转义的英文双引号（如 剑名"寂鸣"）由修复器转义后重试（M6 实测教训）
  const obj = lenientParse<{
    name?: string
    summary?: string
    content?: string
    attributes?: Array<{ key?: string; value?: string }>
    systemRole?: string
  }>(text.slice(firstBrace, lastBrace + 1))
  if (!obj) return null
  const attributes: WikiAttribute[] = (obj.attributes ?? [])
    .filter((a) => a?.key?.trim())
    .slice(0, 6)
    .map((a) => ({ key: String(a.key).trim(), value: String(a.value ?? '').trim() }))
  const systemRoleRaw = String(obj.systemRole ?? '').trim()
  const systemRole: WikiSystemRole = (
    ['protagonist', 'important', 'villain', 'rule', 'foundation'] as const
  ).includes(systemRoleRaw as never)
    ? (systemRoleRaw as WikiSystemRole)
    : ''
  const result = {
    name: String(obj.name ?? '').trim(),
    summary: String(obj.summary ?? '').trim(),
    content: String(obj.content ?? '').trim(),
    attributes,
    systemRole
  }
  const hasAny = result.name || result.summary || result.content || attributes.length
  return hasAny ? result : null
}

/**
 * 构思台世界构建内容导入为词条（幂等：跳过已导入标记的段落）。
 * 「主角设定」→ 角色词条；「世界法则」→ 背景词条（injection=always 便于 AI 写作携带）。
 */

/** 实体名提取（M10.6 治本）：取首个分隔符前的自然名称段（≤20 字）；
 *  无分隔符或为空时回退默认名——防止整段设定文本被当成词条名（历史病态「林昭：青云宗弃徒…」的根因） */
export function extractEntityName(raw: string, fallback: string, max = 20): string {
  const line = raw.split('\n').find((l) => l.trim()) ?? ''
  const seg = line.split(/[：:，,。；;、！？!?]/).map((s) => s.trim()).find((s) => s.length > 0)
  if (!seg || seg.length > max) return fallback
  return seg
}

export function genesisToWorldEntries(
  world: Step3World
): Array<Pick<WikiEntry, 'type' | 'name' | 'summary' | 'content' | 'systemRole' | 'injection'>> {
  const entries: Array<Pick<WikiEntry, 'type' | 'name' | 'summary' | 'content' | 'systemRole' | 'injection'>> = []
  if (world.protagonist.trim()) {
    entries.push({
      type: 'character',
      name: extractEntityName(world.protagonist, '主角'),
      summary: '（导入自构思台·主角设定）',
      content: world.protagonist,
      systemRole: 'protagonist',
      injection: 'always'
    })
  }
  if (world.worldRules.trim()) {
    entries.push({
      type: 'lore',
      name: extractEntityName(world.worldRules, '世界规则'),
      summary: '（导入自构思台·世界法则）',
      content: world.worldRules,
      systemRole: 'rule',
      injection: 'always'
    })
  }
  return entries
}

// ---- 存量词条近似合并建议（M10.6 整理词条：AI 近似组） ----

/** 合并建议（AI 输出解析产物） */
export interface WikiMergeSuggestion {
  keepId: string
  mergeIds: string[]
}

/** 整理词条的 AI 近似合并提示词：找「同一实体/事物的不同称呼」组 */
export function buildWikiDedupMessages(
  entries: Array<{ id: string; type: string; typeName: string; name: string; summary: string }>
): ChatMessage[] {
  const list = entries
    .map((e) => `- [${e.id}] ${e.typeName}｜${e.name}｜${e.summary.slice(0, 40)}`)
    .join('\n')
  return [
    {
      role: 'system',
      content:
        '你是设定集数据整理助手，擅长判断哪些词条描述的是同一个实体或同一事物（同一人物的不同称呼、同一物品的不同叫法、同一规则的宽窄两种表述）。'
    },
    {
      role: 'user',
      content: `以下是小说设定集词条清单。请找出描述**同一实体**的词条组（例如「韦正铭」与「韦正铭舰长」、「银质徽章」与「苏敏遗留徽章」）。
注意：只是相关或从属的不同实体（如「玄铁令」与「玄铁令分半之秘」是两个不同事物）不要合并；拿不准的不要合并。
严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[{ "keepId": "保留词条的 id", "mergeIds": ["要并入并删除的词条 id", "..."] }]
每组的 keepId 选名称更简洁通用的那条；没有可合并组时输出 []。

词条清单：
${list}`
    }
  ]
}

/** 解析合并建议（宽容 JSON + id 白名单过滤 + 结构清洗） */
export function parseWikiDedup(
  text: string,
  validIds: Set<string>
): WikiMergeSuggestion[] {
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  const parsed = lenientParse<unknown>(text.slice(first, last + 1))
  if (!Array.isArray(parsed)) return []
  const out: WikiMergeSuggestion[] = []
  for (const g of parsed) {
    const o = g as Record<string, unknown>
    const keepId = String(o.keepId ?? '')
    const mergeIds = Array.isArray(o.mergeIds) ? o.mergeIds.map(String) : []
    if (!validIds.has(keepId) || mergeIds.length === 0) continue
    const merges = [...new Set(mergeIds)].filter((id) => id !== keepId && validIds.has(id))
    if (merges.length === 0) continue
    out.push({ keepId, mergeIds: merges })
  }
  return out.slice(0, 8)
}

// ---- 正文提取词条候选（M10.5 联动同步：正文→设定集） ----

/** 提取候选结构 */
export interface WikiExtractCandidate {
  type: WikiType
  name: string
  summary: string
}

/** 正文提取词条的 system 提示 */
function wikiExtractSystemPrompt(book: Pick<Book, 'title' | 'genre' | 'description'>): string {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  return [
    '你是一位长篇设定编辑，擅长从正文中识别值得收入「设定集」的设定元素：',
    '有名字的人物、地点、物品、势力组织、技艺，以及影响后续剧情的世界规则。',
    '一笔带过、无名字的路人不收；与已有词条同名或同义的不收。中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/** 正文提取：扫描章节正文 → 词条候选数组（existingText 为已有词条清单，防重复） */
export function buildWikiExtractMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  chapterTitle: string,
  chapterNo: number,
  contentText: string,
  existingText = ''
): ChatMessage[] {
  const existingBlock = existingText
    ? `\n【已有词条（不要重复输出；同名或同义的也算重复）】\n${existingText}\n`
    : ''
  return [
    { role: 'system', content: wikiExtractSystemPrompt(book) },
    {
      role: 'user',
      content: `请从以下章节正文提取值得入库的设定元素。章节：第 ${chapterNo} 章「${chapterTitle}」。${existingBlock}

严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  {
    "type": "character|location|item|faction|skill|lore",
    "name": "名称（20 字内，与正文写法一致）",
    "summary": "正文已确立的关键设定（60 字内：身份/特征/能力/归属等）"
  }
]
type 六选一：character=人物 / location=地点 / item=物品 / faction=势力 / skill=技艺 / lore=世界规则。
只收正文明确出现的元素，最多 8 条，宁缺毋滥；不要脑补正文没有的设定。字段值内禁止使用英文双引号。

正文：
${contentText.slice(0, 6000)}`
    }
  ]
}

/** 解析提取输出（宽容 JSON + 类型白名单过滤） */
export function parseWikiExtract(text: string): WikiExtractCandidate[] {
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  const obj = lenientParse<Array<{ type?: string; name?: string; summary?: string }>>(
    text.slice(first, last + 1)
  )
  if (!Array.isArray(obj)) return []
  return obj
    .filter((c) => c?.name?.trim() && c?.summary?.trim() && VALID_WIKI_TYPES.includes(String(c.type)))
    .slice(0, 10)
    .map((c) => ({
      type: String(c.type) as WikiType,
      name: String(c.name).trim().slice(0, 40),
      summary: String(c.summary).trim().slice(0, 120)
    }))
}

const VALID_WIKI_TYPES: readonly string[] = [...WIKI_TYPES]
