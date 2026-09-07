/**
 * memories 表 DAO：叙事档案（事实层）增删改查。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreateMemoryInput,
  Memory,
  MemoryKind,
  MemorySource,
  UpdateMemoryInput
} from '../../shared/memory.types'

const VALID_KINDS = new Set(['plot', 'stage', 'character', 'relationship', 'clue'])
const VALID_SOURCES = new Set(['manual', 'ai'])

/** 类型/来源白名单校验（防脏数据穿透，M8 静态审查建议） */
function normalizeMemoryKind(v: unknown): MemoryKind {
  const s = String(v ?? '')
  if (!VALID_KINDS.has(s)) throw new Error('非法记忆类型: ' + s.slice(0, 20))
  return s as MemoryKind
}

function normalizeSource(v: unknown): MemorySource {
  const s = String(v ?? 'manual')
  return VALID_SOURCES.has(s) ? (s as MemorySource) : 'manual'
}

interface MemoryRow {
  id: string
  book_id: string
  kind: string
  content: string
  chapter_no: number
  source: string
  is_resolved: number
  created_at: string
  updated_at: string
}

function toMemory(r: MemoryRow): Memory {
  return {
    id: r.id,
    bookId: r.book_id,
    kind: r.kind as MemoryKind,
    content: r.content,
    chapterNo: r.chapter_no,
    source: r.source as MemorySource,
    isResolved: r.is_resolved === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出某书全部记忆（章节序号升序，同章按创建时间） */
export function listMemories(bookId: string): Memory[] {
  const d: Database = getDb()
  return (
    d
      .prepare(
        'SELECT * FROM memories WHERE book_id = ? ORDER BY chapter_no ASC, created_at ASC'
      )
      .all(bookId) as MemoryRow[]
  ).map(toMemory)
}

/** 列出第 N 章之前（不含 N）的记忆——服务端权威过滤接口（预留；当前注入实际走渲染层 computed 按当前章过滤，见 ChapterEditor.memoryCache） */
export function listMemoriesBefore(bookId: string, chapterNo: number): Memory[] {
  const d: Database = getDb()
  return (
    d
      .prepare(
        'SELECT * FROM memories WHERE book_id = ? AND chapter_no < ? ORDER BY chapter_no ASC, created_at ASC'
      )
      .all(bookId, chapterNo) as MemoryRow[]
  ).map(toMemory)
}

export function createMemory(input: CreateMemoryInput): Memory {
  const content = input.content.trim()
  if (!content) throw new Error('记忆内容不能为空')
  if (!Number.isFinite(input.chapterNo) || input.chapterNo < 1) throw new Error('章节序号需为正整数')

  const d: Database = getDb()
  const now = new Date().toISOString()
  const row: MemoryRow = {
    id: randomUUID(),
    book_id: input.bookId,
    kind: normalizeMemoryKind(input.kind),
    content,
    chapter_no: Math.round(input.chapterNo),
    source: normalizeSource(input.source ?? 'manual'),
    is_resolved: input.isResolved ? 1 : 0,
    created_at: now,
    updated_at: now
  }
  d.prepare(
    `INSERT INTO memories (id, book_id, kind, content, chapter_no, source, is_resolved, created_at, updated_at)
     VALUES (@id, @book_id, @kind, @content, @chapter_no, @source, @is_resolved, @created_at, @updated_at)`
  ).run(row)
  return toMemory(row)
}

export function updateMemory(id: string, input: UpdateMemoryInput): Memory {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
  if (!row) throw new Error('记忆不存在')
  if (input.content !== undefined && !input.content.trim()) throw new Error('记忆内容不能为空')

  const next = {
    ...row,
    kind: input.kind !== undefined ? normalizeMemoryKind(input.kind) : (row.kind as MemoryKind),
    content: input.content !== undefined ? input.content.trim() : row.content,
    chapter_no:
      input.chapterNo !== undefined
        ? Math.max(1, Math.round(input.chapterNo))
        : row.chapter_no,
    is_resolved: input.isResolved !== undefined ? (input.isResolved ? 1 : 0) : row.is_resolved,
    updated_at: new Date().toISOString()
  }
  d.prepare(
    `UPDATE memories SET kind=@kind, content=@content, chapter_no=@chapter_no,
     is_resolved=@is_resolved, updated_at=@updated_at WHERE id=@id`
  ).run(next)
  return toMemory(next as MemoryRow)
}

export function removeMemory(id: string): boolean {
  const d: Database = getDb()
  return d.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0
}
