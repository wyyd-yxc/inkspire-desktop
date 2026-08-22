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
