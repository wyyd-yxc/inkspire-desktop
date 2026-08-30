/**
 * scenes 表 DAO：章节画布场景节点增删改查与排序。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreateSceneInput,
  Scene,
  SceneStatus,
  UpdateSceneInput
} from '../../shared/canvas.types'

interface SceneRow {
  id: string
  chapter_id: string
  title: string
  summary: string
  beat: string
  tension: number
  tags: string
  status: string
  sort_order: number
  pos_x: number
  pos_y: number
  wiki_refs: string
  created_at: string
  updated_at: string
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn('[scenes] JSON 字段解析失败，已回退:', err)
    return fallback
  }
}

function toScene(r: SceneRow): Scene {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    title: r.title,
    summary: r.summary,
    beat: r.beat,
    tension: r.tension,
    tags: parseJson<string[]>(r.tags, []),
    status: r.status as SceneStatus,
    sortOrder: r.sort_order,
    posX: r.pos_x,
    posY: r.pos_y,
    wikiRefs: parseJson<string[]>(r.wiki_refs, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 列出某章全部场景（按 sort_order 升序） */
export function listScenes(chapterId: string): Scene[] {
  const d: Database = getDb()
  return (
    d
      .prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY sort_order ASC')
      .all(chapterId) as SceneRow[]
  ).map(toScene)
}

export function getScene(id: string): Scene | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as SceneRow | undefined
  return row ? toScene(row) : undefined
}

export function createScene(input: CreateSceneInput): Scene {
  if (!input.chapterId) throw new Error('缺少章节 id')
  const d: Database = getDb()
  const count = (
    d.prepare('SELECT COUNT(*) AS c FROM scenes WHERE chapter_id = ?').get(input.chapterId) as {
      c: number
    }
  ).c
  const now = new Date().toISOString()
  const row: SceneRow = {
    id: randomUUID(),
    chapter_id: input.chapterId,
    title: input.title?.trim() || `场景 ${count + 1}`,
    summary: input.summary ?? '',
    beat: input.beat ?? '',
    tension: input.tension ?? 3,
    tags: JSON.stringify(input.tags ?? []),
    status: input.status ?? 'draft',
    sort_order: input.sortOrder ?? count + 1,
    pos_x: input.posX ?? (count + 1) * 320,
    pos_y: input.posY ?? 200,
    wiki_refs: JSON.stringify(input.wikiRefs ?? []),
    created_at: now,
    updated_at: now
  }
  d.prepare(
    `INSERT INTO scenes (id, chapter_id, title, summary, beat, tension, tags, status, sort_order, pos_x, pos_y, wiki_refs, created_at, updated_at)
     VALUES (@id, @chapter_id, @title, @summary, @beat, @tension, @tags, @status, @sort_order, @pos_x, @pos_y, @wiki_refs, @created_at, @updated_at)`
  ).run(row)
  return toScene(row)
}

export function updateScene(id: string, input: UpdateSceneInput): Scene {
  const existing = getScene(id)
  if (!existing) throw new Error('场景不存在')
  const next: Scene = {
    ...existing,
    ...(input.title !== undefined ? { title: input.title.trim() || existing.title } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.beat !== undefined ? { beat: input.beat } : {}),
    ...(input.tension !== undefined ? { tension: Math.min(5, Math.max(1, input.tension)) } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.posX !== undefined ? { posX: input.posX } : {}),
    ...(input.posY !== undefined ? { posY: input.posY } : {}),
    ...(input.wikiRefs !== undefined ? { wikiRefs: input.wikiRefs } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE scenes SET title=@title, summary=@summary, beat=@beat, tension=@tension,
     tags=@tags, status=@status, sort_order=@sort_order, pos_x=@pos_x, pos_y=@pos_y,
     wiki_refs=@wiki_refs, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    title: next.title,
    summary: next.summary,
    beat: next.beat,
    tension: next.tension,
    tags: JSON.stringify(next.tags),
    status: next.status,
    sort_order: next.sortOrder,
    pos_x: next.posX,
    pos_y: next.posY,
    wiki_refs: JSON.stringify(next.wikiRefs),
    updated_at: next.updatedAt
  })
  return next
}

export function removeScene(id: string): boolean {
  const d: Database = getDb()
  const existing = getScene(id)
  if (!existing) return false
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM scenes WHERE id = ?').run(id)
    d.prepare(
      'UPDATE scenes SET sort_order = sort_order - 1 WHERE chapter_id = ? AND sort_order > ?'
    ).run(existing.chapterId, existing.sortOrder)
  })
  tx()
  return true
}

/** 重排：按传入 id 顺序重写 sort_order（拖动排序/插入后统一调用） */
export function reorderScenes(chapterId: string, orderedIds: string[]): boolean {
  const d: Database = getDb()
  const tx = d.transaction(() => {
    orderedIds.forEach((id, i) => {
      d.prepare('UPDATE scenes SET sort_order = ? WHERE id = ? AND chapter_id = ?').run(
        i + 1,
        id,
        chapterId
      )
    })
  })
  tx()
  return true
}
