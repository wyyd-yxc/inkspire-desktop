/**
 * 数据库连接与迁移管理。
 * - 数据落盘于 userData/inkspire.sqlite（与安装目录解耦，升级不丢数据）
 * - schema_migrations 表记录已应用版本；迁移只增不改（见 architecture.md 第 3 节约定）
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

/** 每个迁移：版本号 + 建表/改表 SQL。禁止修改已发布的历史迁移 */
const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS books (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        genre       TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        cover       TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'writing',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );`
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS api_profiles (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        provider_kind TEXT NOT NULL DEFAULT 'openai-compatible',
        base_url      TEXT NOT NULL,
        api_key       TEXT NOT NULL DEFAULT '',
        model         TEXT NOT NULL DEFAULT '',
        params        TEXT NOT NULL DEFAULT '{}',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS chapters (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        summary     TEXT NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        content     TEXT NOT NULL DEFAULT '',
        word_count  INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'draft',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, sort_order);`
  }
]

/** 单例连接（主进程内共享，进程退出时由 better-sqlite3 自动释放） */
let db: Database.Database | null = null

/** 打开（或复用）数据库连接并执行未应用的迁移 */
export function getDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'inkspire.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL') // 提高写入可靠性，断电不易损坏
  db.pragma('foreign_keys = ON') // 启用外键级联（删书连带删章节）

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{
      version: number
    }>).map((r) => r.version)
  )
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      m.version,
      new Date().toISOString()
    )
  }
  return db
}
