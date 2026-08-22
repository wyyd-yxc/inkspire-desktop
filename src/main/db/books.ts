/**
 * books 表 DAO：行(snake_case) ⇄ 实体(camelCase) 的映射与增删改查。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type { Book, CreateBookInput, UpdateBookInput } from '../../shared/book.types'

/** 数据库行结构（内部类型，不对外暴露） */
interface BookRow {
  id: string
  title: string
  genre: string
  description: string
  cover: string
  status: string
  created_at: string
  updated_at: string
}

/** 行 → 实体映射 */
function toBook(r: BookRow): Book {
  return {
    id: r.id,
    title: r.title,
    genre: r.genre as Book['genre'],
    description: r.description,
    cover: r.cover,
    status: r.status as Book['status'],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出全部书籍（按更新时间倒序，封存的排最后） */
export function listBooks(): Book[] {
  const d: Database = getDb()
  const rows = d
    .prepare(
      `SELECT * FROM books
       ORDER BY (status = 'archived') ASC, updated_at DESC`
    )
    .all() as BookRow[]
  return rows.map(toBook)
}

/** 按 id 查单本；不存在返回 undefined */
export function getBook(id: string): Book | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined
  return row ? toBook(row) : undefined
}

/** 新建书籍并返回完整实体。title 为空时抛错（由 IPC wrap 转为用户可读错误） */
export function createBook(input: CreateBookInput): Book {
  const title = input.title.trim()
  if (!title) throw new Error('书名不能为空')

  const d: Database = getDb()
  const now = new Date().toISOString()
  const book: Book = {
    id: randomUUID(),
    title,
    genre: input.genre,
    description: input.description.trim(),
    cover: input.cover ?? '',
    status: 'writing',
    createdAt: now,
    updatedAt: now
  }
  d.prepare(
    `INSERT INTO books (id, title, genre, description, cover, status, created_at, updated_at)
     VALUES (@id, @title, @genre, @description, @cover, @status, @created_at, @updated_at)`
  ).run({
    id: book.id,
    title: book.title,
    genre: book.genre,
    description: book.description,
    cover: book.cover,
    status: book.status,
    created_at: book.createdAt,
    updated_at: book.updatedAt
  })
  return book
}

/** 更新书籍字段；返回更新后的实体，不存在时抛错 */
export function updateBook(id: string, input: UpdateBookInput): Book {
  const existing = getBook(id)
  if (!existing) throw new Error('书籍不存在')

  if (input.title !== undefined && !input.title.trim()) throw new Error('书名不能为空')

  const next: Book = {
    ...existing,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.genre !== undefined ? { genre: input.genre } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.cover !== undefined ? { cover: input.cover } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE books SET title=@title, genre=@genre, description=@description,
     cover=@cover, status=@status, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    title: next.title,
    genre: next.genre,
    description: next.description,
    cover: next.cover,
    status: next.status,
    updated_at: next.updatedAt
  })
  return next
}

/** 删除书籍；返回是否删除成功（不存在时返回 false） */
export function deleteBook(id: string): boolean {
  const d: Database = getDb()
  const res = d.prepare('DELETE FROM books WHERE id = ?').run(id)
  return res.changes > 0
}
