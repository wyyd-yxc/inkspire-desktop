/**
 * inspirations 表 DAO：灵感墙五类便签增删改查（book 维度）。
 * 删除即物理删（软删走 update 的 isRecycled 字段）；删书经 FK ON DELETE CASCADE 级联清理。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreateInspirationInput,
  Inspiration,
  InspirationKind,
  InspirationRefType,
  UpdateInspirationInput
} from '../../shared/inspiration.types'

const VALID_KINDS: Set<string> = new Set(['idea', 'foreshadow', 'fragment', 'memo', 'todo'])
const VALID_REF_TYPES: Set<string> = new Set(['', 'plot', 'scene'])

interface InspirationRow {
  id: string
  book_id: string
  kind: string
  title: string
  content: string
  source: string
  ref_type: string
  ref_id: string
  wiki_refs: string
  is_recycled: number
  created_at: string
  updated_at: string
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn('[inspirations] JSON 字段解析失败，已回退:', err)
    return fallback
  }
}

function toInspiration(r: InspirationRow): Inspiration {
  return {
    id: r.id,
    bookId: r.book_id,
    kind: (VALID_KINDS.has(r.kind) ? r.kind : 'idea') as InspirationKind,
    title: r.title,
    content: r.content,
    source: r.source,
    refType: (VALID_REF_TYPES.has(r.ref_type) ? r.ref_type : '') as InspirationRefType,
    refId: r.ref_id,
    wikiRefs: parseJson<string[]>(r.wiki_refs, []),
    isRecycled: r.is_recycled === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出某书全部便签（含回收站，渲染层按 isRecycled 筛选），新→旧排序 */
export function listInspirations(bookId: string): Inspiration[] {
  const d: Database = getDb()
  const rows = d
    .prepare('SELECT * FROM inspirations WHERE book_id = ? ORDER BY created_at DESC, id DESC')
    .all(bookId) as InspirationRow[]
  return rows.map(toInspiration)
}

export function getInspiration(id: string): Inspiration | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM inspirations WHERE id = ?').get(id) as
    | InspirationRow
    | undefined
  return row ? toInspiration(row) : undefined
}

export function createInspiration(input: CreateInspirationInput): Inspiration {
  if (!input.bookId) throw new Error('缺少书籍 id')
  if (input.kind !== undefined && !VALID_KINDS.has(input.kind)) throw new Error('非法的便签类别')
  const d: Database = getDb()
  // 关联词条必须存在且属于本书（与 plot_events 同口径）
  for (const rid of input.wikiRefs ?? []) {
    const w = d.prepare('SELECT book_id FROM wiki_entries WHERE id = ?').get(rid) as
      | { book_id: string }
      | undefined
    if (!w) throw new Error('关联的设定集词条不存在')
    if (w.book_id !== input.bookId) throw new Error('关联的设定集词条必须属于本书')
  }
  const now = new Date().toISOString()
  const row: InspirationRow = {
    id: randomUUID(),
    book_id: input.bookId,
    kind: input.kind ?? 'idea',
    title: input.title?.trim() || '新便签',
    content: input.content ?? '',
    source: input.source ?? '',
    ref_type: '',
    ref_id: '',
    wiki_refs: JSON.stringify(input.wikiRefs ?? []),
    is_recycled: 0,
    created_at: now,
    updated_at: now
  }
  d.prepare(
    `INSERT INTO inspirations (id, book_id, kind, title, content, source, ref_type, ref_id, wiki_refs, is_recycled, created_at, updated_at)
     VALUES (@id, @book_id, @kind, @title, @content, @source, @ref_type, @ref_id, @wiki_refs, @is_recycled, @created_at, @updated_at)`
  ).run(row)
  return toInspiration(row)
}

export function updateInspiration(id: string, input: UpdateInspirationInput): Inspiration {
  const existing = getInspiration(id)
  if (!existing) throw new Error('便签不存在')
  if (input.kind !== undefined && !VALID_KINDS.has(input.kind)) throw new Error('非法的便签类别')
  if (input.refType !== undefined && !VALID_REF_TYPES.has(input.refType))
    throw new Error('非法的回链类型')
  if (input.wikiRefs !== undefined) {
    const d: Database = getDb()
    for (const rid of input.wikiRefs) {
      const w = d.prepare('SELECT book_id FROM wiki_entries WHERE id = ?').get(rid) as
        | { book_id: string }
        | undefined
      if (!w) throw new Error('关联的设定集词条不存在')
      if (w.book_id !== existing.bookId) throw new Error('关联的设定集词条必须属于本书')
    }
  }
  const next: Inspiration = {
    ...existing,
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.title !== undefined ? { title: input.title.trim() || existing.title } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.wikiRefs !== undefined ? { wikiRefs: input.wikiRefs } : {}),
    ...(input.isRecycled !== undefined ? { isRecycled: input.isRecycled } : {}),
    // 回链成对写入：解绑时 refType='' 且 refId 需清空
    ...(input.refType !== undefined
      ? { refType: input.refType, refId: input.refType === '' ? '' : input.refId ?? existing.refId }
      : input.refId !== undefined
        ? { refId: input.refId }
        : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE inspirations SET kind=@kind, title=@title, content=@content, ref_type=@ref_type,
     ref_id=@ref_id, wiki_refs=@wiki_refs, is_recycled=@is_recycled, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    kind: next.kind,
    title: next.title,
    content: next.content,
    ref_type: next.refType,
    ref_id: next.refId,
    wiki_refs: JSON.stringify(next.wikiRefs),
    is_recycled: next.isRecycled ? 1 : 0,
    updated_at: next.updatedAt
  })
  return next
}

/** 物理删除（仅回收站内的便签允许，防误删正式墙便签；入口侧约束+此处兜底校验） */
export function removeInspiration(id: string): boolean {
  const d: Database = getDb()
  const row = d.prepare('SELECT is_recycled FROM inspirations WHERE id = ?').get(id) as
    | { is_recycled: number }
    | undefined
  if (!row) throw new Error('便签不存在')
  if (row.is_recycled !== 1) throw new Error('仅回收站内的便签可彻底删除')
  return d.prepare('DELETE FROM inspirations WHERE id = ?').run(id).changes > 0
}
