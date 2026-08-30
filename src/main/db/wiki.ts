/**
 * wiki_entries 表 DAO：万物百科词条增删改查。
 * attributes/relations 为 JSON 字符串存储，读取时容错回退空数组。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreateWikiInput,
  UpdateWikiInput,
  WikiAttribute,
  WikiEntry,
  WikiInjection,
  WikiRelation,
  WikiSystemRole,
  WikiType
} from '../../shared/wiki.types'

interface WikiRow {
  id: string
  book_id: string
  type: string
  name: string
  summary: string
  content: string
  attributes: string
  relations: string
  system_role: string
  injection: string
  created_at: string
  updated_at: string
}

/** JSON 字段容错解析 */
function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    // 脏数据不拖垮列表，但留痕便于排查（M6 静态审查建议）
    console.warn('[wiki] JSON 字段解析失败，已回退:', err)
    return fallback
  }
}

function toEntry(r: WikiRow): WikiEntry {
  return {
    id: r.id,
    bookId: r.book_id,
    type: r.type as WikiType,
    name: r.name,
    summary: r.summary,
    content: r.content,
    attributes: parseJson<WikiAttribute[]>(r.attributes, []),
    relations: parseJson<WikiRelation[]>(r.relations, []),
    systemRole: r.system_role as WikiSystemRole,
    injection: r.injection as WikiInjection,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出某书全部词条（类型升序 + 创建时间） */
export function listWikiEntries(bookId: string): WikiEntry[] {
  const d: Database = getDb()
  return (
    d
      .prepare('SELECT * FROM wiki_entries WHERE book_id = ? ORDER BY type ASC, created_at ASC')
      .all(bookId) as WikiRow[]
  ).map(toEntry)
}

export function getWikiEntry(id: string): WikiEntry | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM wiki_entries WHERE id = ?').get(id) as WikiRow | undefined
  return row ? toEntry(row) : undefined
}

export function createWikiEntry(input: CreateWikiInput): WikiEntry {
  const name = input.name.trim()
  if (!name) throw new Error('词条名称不能为空')
  const d: Database = getDb()
  const now = new Date().toISOString()
  const row: WikiRow = {
    id: randomUUID(),
    book_id: input.bookId,
    type: input.type,
    name,
    summary: input.summary?.trim() ?? '',
    content: input.content ?? '',
    attributes: JSON.stringify(input.attributes ?? []),
    relations: JSON.stringify(input.relations ?? []),
    system_role: input.systemRole ?? '',
    injection: input.injection ?? 'manual',
    created_at: now,
    updated_at: now
  }
  d.prepare(
    `INSERT INTO wiki_entries (id, book_id, type, name, summary, content, attributes, relations, system_role, injection, created_at, updated_at)
     VALUES (@id, @book_id, @type, @name, @summary, @content, @attributes, @relations, @system_role, @injection, @created_at, @updated_at)`
  ).run(row)
  return toEntry(row)
}

export function updateWikiEntry(id: string, input: UpdateWikiInput): WikiEntry {
  const existing = getWikiEntry(id)
  if (!existing) throw new Error('词条不存在')
  if (input.name !== undefined && !input.name.trim()) throw new Error('词条名称不能为空')

  const next: WikiEntry = {
    ...existing,
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.summary !== undefined ? { summary: input.summary.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
    ...(input.relations !== undefined ? { relations: input.relations } : {}),
    ...(input.systemRole !== undefined ? { systemRole: input.systemRole } : {}),
    ...(input.injection !== undefined ? { injection: input.injection } : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE wiki_entries SET type=@type, name=@name, summary=@summary, content=@content,
     attributes=@attributes, relations=@relations, system_role=@system_role,
     injection=@injection, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    type: next.type,
    name: next.name,
    summary: next.summary,
    content: next.content,
    attributes: JSON.stringify(next.attributes),
    relations: JSON.stringify(next.relations),
    system_role: next.systemRole,
    injection: next.injection,
    updated_at: next.updatedAt
  })
  return next
}

export function removeWikiEntry(id: string): boolean {
  const d: Database = getDb()
  return dbChanges(d.prepare('DELETE FROM wiki_entries WHERE id = ?').run(id))
}

/** better-sqlite3 RunResult.changes 判定 */
function dbChanges(res: { changes: number }): boolean {
  return res.changes > 0
}
