/**
 * style_profiles 表 DAO：全局风格包（用户自建；预设包保持常量不入库）增删改查。
 * 书籍绑定走 books.style_profile_id（FK ON DELETE SET NULL=删包自动解绑）。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreateStyleProfileInput,
  StyleProfile,
  StyleSourceType,
  UpdateStyleProfileInput
} from '../../shared/style.types'

/** 提示词预算护栏：规则条目与单条长度钳制（逐条注入 systemPrompt，防超长） */
const MAX_RULES = 20
const MAX_RULE_LEN = 100

const VALID_SOURCE_TYPES: Set<string> = new Set(['manual', 'digest'])

interface StyleProfileRow {
  id: string
  name: string
  tone: string
  rules: string
  word_target_min: number | null
  word_target_max: number | null
  sample: string
  source_type: string
  created_at: string
  updated_at: string
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn('[styles] JSON 字段解析失败，已回退:', err)
    return fallback
  }
}

function toProfile(r: StyleProfileRow): StyleProfile {
  return {
    id: r.id,
    name: r.name,
    tone: r.tone,
    rules: parseJson<string[]>(r.rules, []),
    wordTargetMin: r.word_target_min,
    wordTargetMax: r.word_target_max,
    sample: r.sample,
    sourceType: (VALID_SOURCE_TYPES.has(r.source_type) ? r.source_type : 'manual') as StyleSourceType,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 字数目标归一化：正数取整、非法弃用、min/max 颠倒时交换（软目标，友好处理不抛错） */
function normalizeWordTarget(
  min?: number | null,
  max?: number | null
): { min: number | null; max: number | null } {
  let lo = typeof min === 'number' && min > 0 ? Math.round(min) : null
  let hi = typeof max === 'number' && max > 0 ? Math.round(max) : null
  if (lo !== null && hi !== null && lo > hi) {
    const t = lo
    lo = hi
    hi = t
  }
  return { min: lo, max: hi }
}

/** 规则条目清洗：去空白、截断超长、限量（防提示词预算失控） */
function sanitizeRules(rules?: string[]): string[] {
  return (rules ?? [])
    .map((r) => String(r).trim().slice(0, MAX_RULE_LEN))
    .filter(Boolean)
    .slice(0, MAX_RULES)
}

/** 列出全部用户风格包（最近编辑在上） */
export function listStyleProfiles(): StyleProfile[] {
  const d: Database = getDb()
  const rows = d.prepare('SELECT * FROM style_profiles ORDER BY updated_at DESC, id DESC').all() as
    StyleProfileRow[]
  return rows.map(toProfile)
}

export function getStyleProfile(id: string): StyleProfile | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM style_profiles WHERE id = ?').get(id) as
    | StyleProfileRow
    | undefined
  return row ? toProfile(row) : undefined
}

export function createStyleProfile(input: CreateStyleProfileInput): StyleProfile {
  const name = input.name.trim()
  if (!name) throw new Error('风格包名称不能为空')
  const d: Database = getDb()
  const now = new Date().toISOString()
  const target = normalizeWordTarget(input.wordTargetMin, input.wordTargetMax)
  // 来源白名单校验：仅 'manual'/'digest' 合法（digest=M14 拆书），非法/缺省回落 manual
  const sourceType =
    input.sourceType !== undefined && VALID_SOURCE_TYPES.has(input.sourceType)
      ? input.sourceType
      : 'manual'
  const row: StyleProfileRow = {
    id: randomUUID(),
    name: name.slice(0, 30),
    tone: (input.tone ?? '').trim(),
    rules: JSON.stringify(sanitizeRules(input.rules)),
    word_target_min: target.min,
    word_target_max: target.max,
    sample: (input.sample ?? '').trim(),
    source_type: sourceType,
    created_at: now,
    updated_at: now
  }
  d.prepare(
    `INSERT INTO style_profiles (id, name, tone, rules, word_target_min, word_target_max, sample, source_type, created_at, updated_at)
     VALUES (@id, @name, @tone, @rules, @word_target_min, @word_target_max, @sample, @source_type, @created_at, @updated_at)`
  ).run(row)
  return toProfile(row)
}

export function updateStyleProfile(id: string, input: UpdateStyleProfileInput): StyleProfile {
  const existing = getStyleProfile(id)
  if (!existing) throw new Error('风格包不存在')
  if (input.name !== undefined && !input.name.trim()) throw new Error('风格包名称不能为空')
  const target = normalizeWordTarget(
    input.wordTargetMin !== undefined ? input.wordTargetMin : existing.wordTargetMin,
    input.wordTargetMax !== undefined ? input.wordTargetMax : existing.wordTargetMax
  )
  const next: StyleProfile = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim().slice(0, 30) } : {}),
    ...(input.tone !== undefined ? { tone: input.tone.trim() } : {}),
    ...(input.rules !== undefined ? { rules: sanitizeRules(input.rules) } : {}),
    wordTargetMin: target.min,
    wordTargetMax: target.max,
    ...(input.sample !== undefined ? { sample: input.sample.trim() } : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE style_profiles SET name=@name, tone=@tone, rules=@rules,
     word_target_min=@word_target_min, word_target_max=@word_target_max, sample=@sample, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    name: next.name,
    tone: next.tone,
    rules: JSON.stringify(next.rules),
    word_target_min: next.wordTargetMin,
    word_target_max: next.wordTargetMax,
    sample: next.sample,
    updated_at: next.updatedAt
  })
  return next
}

/** 删除风格包；绑定该包的书籍经 FK ON DELETE SET NULL 自动解绑 */
export function removeStyleProfile(id: string): boolean {
  const d: Database = getDb()
  return d.prepare('DELETE FROM style_profiles WHERE id = ?').run(id).changes > 0
}
