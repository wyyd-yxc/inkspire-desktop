/**
 * word_count_snapshots 表 DAO：按日字数快照（M13）。
 * 记录内嵌于 chapters:update（wordCount 传入时）：当日基线只写一次，末值每次覆盖；
 * 当日净增 = last_total - base_total（可负=净删，如实呈现）。
 */
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type { WordSnapshot } from '../../shared/stats.types'

interface SnapshotRow {
  book_id: string
  day: string
  base_total: number
  last_total: number
  updated_at: string
}

/** 本地时区日期 YYYY-MM-DD（不用 toISOString——UTC 会在东八区午夜前错位一天） */
export function localDayString(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toSnapshot(r: SnapshotRow): WordSnapshot {
  return {
    day: r.day,
    baseTotal: r.base_total,
    lastTotal: r.last_total,
    delta: r.last_total - r.base_total
  }
}

/**
 * 记录当日快照（事务：SUM 全书字数 → 当日无行则建基线，有行则覆盖末值）。
 * 必须在章节 UPDATE 成功后调用；失败由调用方吞掉（不影响保存主流程）。
 */
export function recordWordSnapshot(bookId: string): void {
  const d: Database = getDb()
  const day = localDayString()
  const tx = d.transaction(() => {
    const total = (
      d
        .prepare('SELECT COALESCE(SUM(word_count), 0) AS t FROM chapters WHERE book_id = ?')
        .get(bookId) as { t: number }
    ).t
    const existing = d
      .prepare('SELECT last_total FROM word_count_snapshots WHERE book_id = ? AND day = ?')
      .get(bookId, day) as { last_total: number } | undefined
    if (existing) {
      // 同值跳过（r2 低危：防无变更的冗余写；updated_at 保留最后真实变化时间）
      if (existing.last_total === total) return
      d.prepare(
        'UPDATE word_count_snapshots SET last_total = ?, updated_at = ? WHERE book_id = ? AND day = ?'
      ).run(total, new Date().toISOString(), bookId, day)
    } else {
      d.prepare(
        'INSERT INTO word_count_snapshots (book_id, day, base_total, last_total, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(bookId, day, total, total, new Date().toISOString())
    }
  })
  tx()
}

/** 某书全部快照（按日期升序，渲染层计算趋势/热力图/里程碑） */
export function listWordSnapshots(bookId: string): WordSnapshot[] {
  const d: Database = getDb()
  const rows = d
    .prepare('SELECT * FROM word_count_snapshots WHERE book_id = ? ORDER BY day ASC')
    .all(bookId) as SnapshotRow[]
  return rows.map(toSnapshot)
}
