/**
 * plot_edges 表 DAO：剧情事件连线（main 主线/logic 因果/relation 关联/reference 引用）。
 * 事件删除时连线经 FK ON DELETE CASCADE 自动清理。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  CreatePlotEdgeInput,
  PlotEdge,
  PlotEdgeType,
  UpdatePlotEdgeInput
} from '../../shared/plot.types'

interface PlotEdgeRow {
  id: string
  book_id: string
  source_id: string
  target_id: string
  type: string
  label: string
  created_at: string
}

function toEdge(r: PlotEdgeRow): PlotEdge {
  return {
    id: r.id,
    bookId: r.book_id,
    sourceId: r.source_id,
    targetId: r.target_id,
    type: r.type as PlotEdgeType,
    label: r.label,
    createdAt: r.created_at
  }
}

/** 列出某书全部连线（创建时间序） */
export function listPlotEdges(bookId: string): PlotEdge[] {
  const d: Database = getDb()
  return (
    d
      .prepare('SELECT * FROM plot_edges WHERE book_id = ? ORDER BY created_at ASC')
      .all(bookId) as PlotEdgeRow[]
  ).map(toEdge)
}

/** 新建连线（校验：非自身、防同向重复） */
export function createPlotEdge(input: CreatePlotEdgeInput): PlotEdge {
  if (!input.bookId) throw new Error('缺少书籍 id')
  if (!input.sourceId || !input.targetId) throw new Error('连线两端事件缺失')
  if (input.sourceId === input.targetId) throw new Error('不能连接事件到自身')

  const d: Database = getDb()
  // 任意方向已存在连线即拒绝（方向承载因果语义，反向边视为矛盾；类型/标签可在连线编辑器修改）
  const dup = d
    .prepare(
      `SELECT id FROM plot_edges WHERE book_id = ? AND (
        (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
      )`
    )
    .get(input.bookId, input.sourceId, input.targetId, input.targetId, input.sourceId)
  if (dup) throw new Error('两个事件间已存在连线（单击选中连线可修改类型与标签）')

  const now = new Date().toISOString()
  const row: PlotEdgeRow = {
    id: randomUUID(),
    book_id: input.bookId,
    source_id: input.sourceId,
    target_id: input.targetId,
    type: input.type ?? 'main',
    label: input.label?.trim() ?? '',
    created_at: now
  }
  d.prepare(
    `INSERT INTO plot_edges (id, book_id, source_id, target_id, type, label, created_at)
     VALUES (@id, @book_id, @source_id, @target_id, @type, @label, @created_at)`
  ).run(row)
  return toEdge(row)
}

/** 更新连线类型/标签 */
export function updatePlotEdge(id: string, input: UpdatePlotEdgeInput): PlotEdge {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM plot_edges WHERE id = ?').get(id) as
    | PlotEdgeRow
    | undefined
  if (!row) throw new Error('连线不存在')
  const next = {
    ...row,
    type: input.type ?? (row.type as PlotEdgeType),
    label: input.label !== undefined ? input.label.trim() : row.label
  }
  d.prepare('UPDATE plot_edges SET type = @type, label = @label WHERE id = @id').run({
    id,
    type: next.type,
    label: next.label
  })
  return toEdge(next)
}

/** 删除连线 */
export function removePlotEdge(id: string): boolean {
  const d: Database = getDb()
  return d.prepare('DELETE FROM plot_edges WHERE id = ?').run(id).changes > 0
}
