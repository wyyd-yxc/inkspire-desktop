/**
 * assistant_messages 表 DAO：墨灵助手对话历史（按书单会话，最近 50 条）。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type { AssistantMessage, AssistantRole } from '../../shared/assistant.types'

interface MessageRow {
  id: string
  book_id: string
  role: string
  content: string
  created_at: string
}

function toMessage(r: MessageRow): AssistantMessage {
  return {
    id: r.id,
    bookId: r.book_id,
    role: r.role as AssistantRole,
    content: r.content,
    createdAt: r.created_at
  }
}

/** 最近 50 条（时间升序返回，最旧在前） */
export function listAssistantMessages(bookId: string, limit = 50): AssistantMessage[] {
  const d: Database = getDb()
  const rows = d
    .prepare(
      'SELECT * FROM (SELECT * FROM assistant_messages WHERE book_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC'
    )
    .all(bookId, limit) as MessageRow[]
  return rows.map(toMessage)
}

export function createAssistantMessage(
  bookId: string,
  role: AssistantRole,
  content: string
): AssistantMessage {
  if (!content.trim()) throw new Error('消息内容不能为空')
  const d: Database = getDb()
  const now = new Date().toISOString()
  const row: MessageRow = {
    id: randomUUID(),
    book_id: bookId,
    role,
    content,
    created_at: now
  }
  d.prepare(
    `INSERT INTO assistant_messages (id, book_id, role, content, created_at)
     VALUES (@id, @book_id, @role, @content, @created_at)`
  ).run(row)
  return toMessage(row)
}

/** 清空某书对话历史 */
export function clearAssistantMessages(bookId: string): boolean {
  const d: Database = getDb()
  return d.prepare('DELETE FROM assistant_messages WHERE book_id = ?').run(bookId).changes >= 0
}
