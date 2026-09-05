/**
 * scene_edges 表 DAO：场景连线（关系表达：main 主线/logic 因果/relation 关联）。
 * 场景删除时连线经 FK ON DELETE CASCADE 自动清理。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreateSceneEdgeInput,
  SceneEdge,
  SceneEdgeType,
  UpdateSceneEdgeInput
} from '../../shared/canvas.types'

interface SceneEdgeRow {
  id: string
  chapter_id: string
  source_id: string
  target_id: string
  type: string
  label: string
  created_at: string
}

function toEdge(r: SceneEdgeRow): SceneEdge {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    sourceId: r.source_id,
    targetId: r.target_id,
    type: r.type as SceneEdgeType,
    label: r.label,
    createdAt: r.created_at
  }
}

/** 列出某章全部连线（创建时间序） */
export function listSceneEdges(chapterId: string): SceneEdge[] {
  const d: Database = getDb()
  return (
    d
      .prepare('SELECT * FROM scene_edges WHERE chapter_id = ? ORDER BY created_at ASC')
      .all(chapterId) as SceneEdgeRow[]
  ).map(toEdge)
}

/** 新建连线（校验：非自身、防同向重复） */
export function createSceneEdge(input: CreateSceneEdgeInput): SceneEdge {
  if (!input.chapterId) throw new Error('缺少章节 id')
  if (!input.sourceId || !input.targetId) throw new Error('连线两端场景缺失')
  if (input.sourceId === input.targetId) throw new Error('不能连接场景到自身')

  const d: Database = getDb()
  const dup = d
    .prepare(
      'SELECT id FROM scene_edges WHERE chapter_id = ? AND source_id = ? AND target_id = ? AND type = ?'
    )
    .get(input.chapterId, input.sourceId, input.targetId, input.type ?? 'main')
  if (dup) throw new Error('两个场景间已存在同类型连线')

  const now = new Date().toISOString()
  const row: SceneEdgeRow = {
    id: randomUUID(),
    chapter_id: input.chapterId,
    source_id: input.sourceId,
    target_id: input.targetId,
    type: input.type ?? 'main',
    label: input.label?.trim() ?? '',
    created_at: now
  }
  d.prepare(
    `INSERT INTO scene_edges (id, chapter_id, source_id, target_id, type, label, created_at)
     VALUES (@id, @chapter_id, @source_id, @target_id, @type, @label, @created_at)`
  ).run(row)
  return toEdge(row)
}

/** 更新连线类型/标签 */
export function updateSceneEdge(id: string, input: UpdateSceneEdgeInput): SceneEdge {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM scene_edges WHERE id = ?').get(id) as SceneEdgeRow | undefined
  if (!row) throw new Error('连线不存在')
  const next = {
    ...row,
    type: input.type ?? (row.type as SceneEdgeType),
    label: input.label !== undefined ? input.label.trim() : row.label
  }
  d.prepare('UPDATE scene_edges SET type = @type, label = @label WHERE id = @id').run({
    id,
    type: next.type,
    label: next.label
  })
  return toEdge(next)
}

/** 删除连线 */
export function removeSceneEdge(id: string): boolean {
  const d: Database = getDb()
  return d.prepare('DELETE FROM scene_edges WHERE id = ?').run(id).changes > 0
}
