/**
 * plot_events 表 DAO：剧情画布事件节点增删改查（book 维度，跨章节）。
 * 事件删除时关联连线经 FK ON DELETE CASCADE 自动清理。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreatePlotEventInput,
  PlotEvent,
  UpdatePlotEventInput
} from '../../shared/plot.types'

interface PlotEventRow {
  id: string
  book_id: string
  title: string
  description: string
  tags: string
  pos_x: number
  pos_y: number
  parent_id: string | null
  wiki_refs: string
  created_at: string
  updated_at: string
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn('[plot] JSON 字段解析失败，已回退:', err)
    return fallback
  }
}

function toEvent(r: PlotEventRow): PlotEvent {
  return {
    id: r.id,
    bookId: r.book_id,
    title: r.title,
    description: r.description,
    tags: parseJson<string[]>(r.tags, []),
    posX: r.pos_x,
    posY: r.pos_y,
    parentId: r.parent_id,
    wikiRefs: parseJson<string[]>(r.wiki_refs, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出某书全部事件；parentId 传入时按父事件过滤（子画布预留位，M10 全量平铺） */
export function listPlotEvents(bookId: string, parentId?: string | null): PlotEvent[] {
  const d: Database = getDb()
  const rows =
    parentId === undefined
      ? (d
          .prepare(
            'SELECT * FROM plot_events WHERE book_id = ? ORDER BY created_at ASC, pos_x ASC'
          )
          .all(bookId) as PlotEventRow[])
      : (d
          .prepare(
            'SELECT * FROM plot_events WHERE book_id = ? AND parent_id IS ? ORDER BY created_at ASC, pos_x ASC'
          )
          .all(bookId, parentId ?? null) as PlotEventRow[])
  return rows.map(toEvent)
}

export function getPlotEvent(id: string): PlotEvent | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM plot_events WHERE id = ?').get(id) as
    | PlotEventRow
    | undefined
  return row ? toEvent(row) : undefined
}

export function createPlotEvent(input: CreatePlotEventInput): PlotEvent {
  if (!input.bookId) throw new Error('缺少书籍 id')
  const d: Database = getDb()
  const count = (
    d.prepare('SELECT COUNT(*) AS c FROM plot_events WHERE book_id = ?').get(input.bookId) as {
      c: number
    }
  ).c
  const now = new Date().toISOString()
  const row: PlotEventRow = {
    id: randomUUID(),
    book_id: input.bookId,
    title: input.title?.trim() || `事件 ${count + 1}`,
    description: input.description ?? '',
    tags: JSON.stringify(input.tags ?? []),
    pos_x: input.posX ?? (count + 1) * 340,
    pos_y: input.posY ?? 240,
    parent_id: null, // 子画布预留字段，M10 恒不写值
    wiki_refs: JSON.stringify(input.wikiRefs ?? []),
    created_at: now,
    updated_at: now
  }
  d.prepare(
    `INSERT INTO plot_events (id, book_id, title, description, tags, pos_x, pos_y, parent_id, wiki_refs, created_at, updated_at)
     VALUES (@id, @book_id, @title, @description, @tags, @pos_x, @pos_y, @parent_id, @wiki_refs, @created_at, @updated_at)`
  ).run(row)
  return toEvent(row)
}

export function updatePlotEvent(id: string, input: UpdatePlotEventInput): PlotEvent {
  const existing = getPlotEvent(id)
  if (!existing) throw new Error('剧情事件不存在')
  const next: PlotEvent = {
    ...existing,
    ...(input.title !== undefined ? { title: input.title.trim() || existing.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.posX !== undefined ? { posX: input.posX } : {}),
    ...(input.posY !== undefined ? { posY: input.posY } : {}),
    ...(input.wikiRefs !== undefined ? { wikiRefs: input.wikiRefs } : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE plot_events SET title=@title, description=@description, tags=@tags,
     pos_x=@pos_x, pos_y=@pos_y, wiki_refs=@wiki_refs, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    title: next.title,
    description: next.description,
    tags: JSON.stringify(next.tags),
    pos_x: next.posX,
    pos_y: next.posY,
    wiki_refs: JSON.stringify(next.wikiRefs),
    updated_at: next.updatedAt
  })
  return next
}

export function removePlotEvent(id: string): boolean {
  const d: Database = getDb()
  return d.prepare('DELETE FROM plot_events WHERE id = ?').run(id).changes > 0
}
