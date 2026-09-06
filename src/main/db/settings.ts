/**
 * settings 表 DAO：应用级键值设置（JSON value）。
 * 目前已知键：
 * - ai.default_profile_id：默认 AI 档案 id（未设置时取档案列表第一个）
 */
import type { Database } from 'better-sqlite3'
import { getDb } from './database'

/** 读设置；键不存在返回传入的 fallback */
export function getSetting<T>(key: string, fallback: T): T {
  const d: Database = getDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

/** 写设置（UPSERT） */
export function setSetting<T>(key: string, value: T): void {
  const d: Database = getDb()
  d.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value))
}

/** 允许原子合并的水位键白名单 */
const WATERMARK_KEYS = new Set(['sync.memory_watermark', 'sync.wiki_watermark'])

/** 水位单章合并（M10.5 静态审查 §1）：在主进程内同步完成 读→合并→写，
 *  消除渲染层两步 IPC（get→set）之间的交错丢更新窗口；非白名单键拒绝 */
export function mergeWatermarkChapter(key: string, chapterId: string, wordCount: number): void {
  if (!WATERMARK_KEYS.has(key)) throw new Error('非法的水位键')
  if (!Number.isFinite(wordCount)) throw new Error('水位字数非法')
  const d: Database = getDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  let map: Record<string, number> = {}
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.value)
      if (parsed && typeof parsed === 'object') map = parsed as Record<string, number>
    } catch {
      map = {}
    }
  }
  map[chapterId] = wordCount
  setSetting(key, map)
}
