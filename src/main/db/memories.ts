/**
 * memories 表 DAO：作品记忆（事实层）增删改查。
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

/** 列出第 N 章之前（不含 N）的记忆——AI 生成第 N 章时的注入集（单向可见防剧透） */
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
    kind: input.kind,
    content,
    chapter_no: Math.round(input.chapterNo),
    source: input.source ?? 'manual',
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
    kind: (input.kind ?? (row.kind as MemoryKind)) as string,
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
