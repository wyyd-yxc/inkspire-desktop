/**
 * 拆书（M14）提示词构造与解析：参考文本 → AI 拆解文风 → 风格包候选。
 * 复用提取范式（wikiPrompts 同构）：严格 JSON 约定 + lenientParse 宽容解析 +
 * 渲染层白名单清洗（styles DAO 落库时还会再洗一遍，双保险）。
 * 只拆文风不拆情节/人物（设计决策）；提示词不出现内部流程术语（踩坑 #16）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { DigestResult } from '../../../shared/digest.types'
import { lenientParse } from './jsonRepair'

/** 清洗口径（与 styles DAO sanitizeRules 同构；字数限制取 DAO 与展示的交集） */
const MAX_RULES = 20
const MAX_RULE_LEN = 100

/** 参考文本注入上限：digest:pick-text 已截 2 万字，此处兜底防绕过通道直调 */
const REF_TEXT_LIMIT = 20000

/** 拆解 system 提示：文风分析师角色，只输出严格 JSON */
const DIGEST_SYSTEM_PROMPT = [
  '你是一位资深小说文风分析师，擅长从文本中提炼可复用的写作风格。',
  '只分析文笔风格（叙事人称与视角、时态、句式长短与节奏、对话与描写比例、用词调性），',
  '不要分析情节、人物、世界观或故事内容。全部使用中文书写。'
].join('')

/** 构造拆解消息：参考文本注入 user 消息，约定输出严格 JSON */
export function buildDigestMessages(refText: string): ChatMessage[] {
  return [
    { role: 'system', content: DIGEST_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `请分析以下参考文本的文风，产出一个可直接约束 AI 写作的风格包。
严格输出如下 JSON（不要任何额外文字、不要 markdown 代码块）：
{
  "name": "风格包名（12 字内，概括文风特色，如「冷峻快节奏」）",
  "tone": "文笔调性总括（一句话 60 字内）",
  "rules": ["叙事规则条目", "..."],
  "sample": "从参考文本原句中摘出的一个连续句段（100 字内，不得改写）"
}
要求：
- rules 给 4-8 条具体可执行的叙事规则（人称/视角/时态/句式/对话/描写偏好），每条 50 字内
- sample 必须是参考文本中原句的连续摘录
- 所有字段值内部禁止使用英文双引号（引用请用「」）

参考文本：
${refText.slice(0, REF_TEXT_LIMIT)}`
    }
  ]
}

/** 解析并清洗拆解输出（宽容 JSON + 白名单钳制；无有效包名视为失败返回 null） */
export function parseDigestOutput(text: string): DigestResult | null {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  const obj = lenientParse<Partial<Record<keyof DigestResult, unknown>>>(
    text.slice(first, last + 1)
  )
  if (!obj) return null
  return sanitizeDigest({
    name: String(obj.name ?? ''),
    tone: String(obj.tone ?? ''),
    rules: Array.isArray(obj.rules) ? obj.rules.map((r) => String(r)) : [],
    sample: String(obj.sample ?? '')
  })
}

/** 白名单清洗：trim + 长度钳制 + 条数限量（与 DAO 口径一致，双保险）；包名空则整体无效 */
export function sanitizeDigest(input: {
  name: string
  tone: string
  rules: string[]
  sample: string
}): DigestResult | null {
  const name = input.name.trim().slice(0, 30)
  if (!name) return null
  return {
    name,
    tone: input.tone.trim().slice(0, 100),
    rules: input.rules
      .map((r) => r.trim().slice(0, MAX_RULE_LEN))
      .filter(Boolean)
      .slice(0, MAX_RULES),
    sample: input.sample.trim().slice(0, 200)
  }
}
