/**
 * chapters 表 DAO：章节增删改查与排序。
 * 约定：sort_order 在书内从 1 连续递增；移动章节 = 交换相邻序号。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type { Chapter, ChapterMeta, CreateChapterInput, UpdateChapterInput } from '../../shared/chapter.types'

interface ChapterRow {
  id: string
  book_id: string
  title: string
  summary: string
  sort_order: number
  content: string
  word_count: number
  status: string
  created_at: string
  updated_at: string
}

function toChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    bookId: r.book_id,
    title: r.title,
    summary: r.summary,
    sortOrder: r.sort_order,
    content: r.content,
    wordCount: r.word_count,
    status: r.status as Chapter['status'],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出某书全部章节（按 sort_order 升序） */
export function listChapters(bookId: string): Chapter[] {
  const d: Database = getDb()
  return (
    d.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY sort_order ASC').all(bookId) as ChapterRow[]
  ).map(toChapter)
}

/** 轻量章节列表（不含 content 全文；联动同步变更检测/剧情上下文用，M10.5） */
export function listChapterMetas(bookId: string): ChapterMeta[] {
  const d: Database = getDb()
  return (
    d
      .prepare(
        `SELECT id, title, summary, sort_order, word_count, updated_at
         FROM chapters WHERE book_id = ? ORDER BY sort_order ASC`
      )
      .all(bookId) as Array<{
      id: string
      title: string
      summary: string
      sort_order: number
      word_count: number
      updated_at: string
    }>
  ).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    sortOrder: r.sort_order,
    wordCount: r.word_count,
    updatedAt: r.updated_at
  }))
}

export function getChapter(id: string): Chapter | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as ChapterRow | undefined
  return row ? toChapter(row) : undefined
}

/** 新建章节（追加到末尾；自动命名「第 N 章」，与现存标题重复时递增避开） */
export function createChapter(input: CreateChapterInput): Chapter {
  if (!input.bookId) throw new Error('缺少书籍 id')
  const d: Database = getDb()
  const count = (
    d.prepare('SELECT COUNT(*) AS c FROM chapters WHERE book_id = ?').get(input.bookId) as { c: number }
  ).c
  const existingTitles = new Set(
    (
      d.prepare('SELECT title FROM chapters WHERE book_id = ?').all(input.bookId) as Array<{
        title: string
      }>
    ).map((r) => r.title)
  )
  const now = new Date().toISOString()
  let title = input.title?.trim() || `第 ${count + 1} 章`
  if (!input.title?.trim()) {
    let n = count + 1
    while (existingTitles.has(title)) {
      n += 1
      title = `第 ${n} 章`
    }
  }
  const chapter: Chapter = {
    id: randomUUID(),
    bookId: input.bookId,
    title,
    summary: input.summary?.trim() ?? '',
    sortOrder: count + 1,
    content: '',
    wordCount: 0,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  }
  d.prepare(
    `INSERT INTO chapters (id, book_id, title, summary, sort_order, content, word_count, status, created_at, updated_at)
     VALUES (@id, @book_id, @title, @summary, @sort_order, @content, @word_count, @status, @created_at, @updated_at)`
  ).run({
    id: chapter.id,
    book_id: chapter.bookId,
    title: chapter.title,
    summary: chapter.summary,
    sort_order: chapter.sortOrder,
    content: chapter.content,
    word_count: chapter.wordCount,
    status: chapter.status,
    created_at: chapter.createdAt,
    updated_at: chapter.updatedAt
  })
  return chapter
}

/** 更新章节（wordCount 由调用方与 content 同步计算传入） */
export function updateChapter(id: string, input: UpdateChapterInput): Chapter {
  const existing = getChapter(id)
  if (!existing) throw new Error('章节不存在')

  if (input.title !== undefined && !input.title.trim()) throw new Error('章节标题不能为空')

  const hasChange = Object.keys(input).length > 0
  const next: Chapter = {
    ...existing,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.summary !== undefined ? { summary: input.summary.trim() } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.wordCount !== undefined ? { wordCount: input.wordCount } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(hasChange ? { updatedAt: new Date().toISOString() } : {})
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE chapters SET title=@title, summary=@summary, content=@content,
     word_count=@word_count, status=@status, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    title: next.title,
    summary: next.summary,
    content: next.content,
    word_count: next.wordCount,
    status: next.status,
    updated_at: next.updatedAt
  })
  return next
}

/** 删除章节并压缩序号（保持 1..N 连续） */
export function deleteChapter(id: string): boolean {
  const d: Database = getDb()
  const existing = getChapter(id)
  if (!existing) return false
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM chapters WHERE id = ?').run(id)
    d.prepare(
      `UPDATE chapters SET sort_order = sort_order - 1
       WHERE book_id = ? AND sort_order > ?`
    ).run(existing.bookId, existing.sortOrder)
  })
  tx()
  return true
}

/** 上移/下移：与相邻章节交换序号。dir: -1 上移 / +1 下移；到边界返回 false */
export function moveChapter(id: string, dir: -1 | 1): boolean {
  const d: Database = getDb()
  const cur = getChapter(id)
  if (!cur) throw new Error('章节不存在')
  const targetOrder = cur.sortOrder + dir
  const neighbor = d
    .prepare('SELECT * FROM chapters WHERE book_id = ? AND sort_order = ?')
    .get(cur.bookId, targetOrder) as ChapterRow | undefined
  if (!neighbor) return false
  const tx = d.transaction(() => {
    // 借助临时序号避免唯一性冲突（sort_order 无唯一约束，直接双写亦可，事务保证一致）
    d.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?').run(targetOrder, cur.id)
    d.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?').run(cur.sortOrder, neighbor.id)
  })
  tx()
  return true
}
