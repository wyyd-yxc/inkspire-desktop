/**
 * 数据库连接与迁移管理。
 * - 数据落盘于 userData/inkspire.sqlite（与安装目录解耦，升级不丢数据）
 * - schema_migrations 表记录已应用版本；迁移只增不改（见 architecture.md 第 3 节约定）
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

/** 每个迁移：版本号 + 建表/改表 SQL；v11 起支持可选 migrate（JS 数据迁移，事务内执行）。
 *  禁止修改已发布的历史迁移 */
const MIGRATIONS: Array<{
  version: number
  sql: string
  migrate?: (db: Database.Database) => void
}> = [
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
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS genesis_steps (
        book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        step       INTEGER NOT NULL,
        data       TEXT NOT NULL DEFAULT '{}',
        is_done    INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (book_id, step)
      );`
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS wiki_entries (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        type        TEXT NOT NULL DEFAULT 'character',
        name        TEXT NOT NULL,
        summary     TEXT NOT NULL DEFAULT '',
        content     TEXT NOT NULL DEFAULT '',
        attributes  TEXT NOT NULL DEFAULT '[]',
        relations   TEXT NOT NULL DEFAULT '[]',
        system_role TEXT NOT NULL DEFAULT '',
        injection   TEXT NOT NULL DEFAULT 'manual',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wiki_book ON wiki_entries(book_id, type);`
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS scenes (
        id         TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        title      TEXT NOT NULL DEFAULT '',
        summary    TEXT NOT NULL DEFAULT '',
        beat       TEXT NOT NULL DEFAULT '',
        tension    INTEGER NOT NULL DEFAULT 3,
        tags       TEXT NOT NULL DEFAULT '[]',
        status     TEXT NOT NULL DEFAULT 'draft',
        sort_order INTEGER NOT NULL DEFAULT 0,
        pos_x      REAL NOT NULL DEFAULT 0,
        pos_y      REAL NOT NULL DEFAULT 0,
        wiki_refs  TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id, sort_order);`
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS scene_edges (
        id         TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        source_id  TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
        target_id  TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
        type       TEXT NOT NULL DEFAULT 'main',
        label      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scene_edges_chapter ON scene_edges(chapter_id);`
  },
  {
    version: 8,
    sql: `
      CREATE TABLE IF NOT EXISTS memories (
        id         TEXT PRIMARY KEY,
        book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL DEFAULT 'plot',
        content    TEXT NOT NULL,
        chapter_no INTEGER NOT NULL DEFAULT 1,
        source     TEXT NOT NULL DEFAULT 'manual',
        is_resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_book ON memories(book_id, chapter_no);`
  },
  {
    version: 9,
    sql: `
      CREATE TABLE IF NOT EXISTS assistant_messages (
        id         TEXT PRIMARY KEY,
        book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_book ON assistant_messages(book_id, created_at);`
  },
  {
    // v10 情节大纲。注意 plot_events.parent_id 为子画布（M11+）预留列，故意不加 FK 约束：
    // 现阶段恒为 null，待子画布需求落地时再以 migration v11+ 补 FOREIGN KEY ... ON DELETE SET NULL。
    version: 10,
    sql: `
      CREATE TABLE IF NOT EXISTS plot_events (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        title       TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        tags        TEXT NOT NULL DEFAULT '[]',
        pos_x       REAL NOT NULL DEFAULT 0,
        pos_y       REAL NOT NULL DEFAULT 0,
        parent_id   TEXT,
        wiki_refs   TEXT NOT NULL DEFAULT '[]',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plot_events_book ON plot_events(book_id);
      CREATE TABLE IF NOT EXISTS plot_edges (
        id         TEXT PRIMARY KEY,
        book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        source_id  TEXT NOT NULL REFERENCES plot_events(id) ON DELETE CASCADE,
        target_id  TEXT NOT NULL REFERENCES plot_events(id) ON DELETE CASCADE,
        type       TEXT NOT NULL DEFAULT 'main',
        label      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plot_edges_book ON plot_edges(book_id);`
  },
  {
    // v11 M10.8 严肃写作重命名：题材旧值映射（纯 SQL）+ 剧情事件/场景标签旧值映射（JS 逐行，
    //   UPDATE 相关子查询 + json_each 表值函数在该场景抛 malformed JSON——M10.8 自测实锤，故下沉 JS）
    version: 11,
    sql: `
      UPDATE books SET genre = '奇幻' WHERE genre IN ('玄幻', '仙侠');
      UPDATE books SET genre = '现实主义' WHERE genre IN ('都市', '言情');
      UPDATE books SET genre = '其他' WHERE genre IN ('游戏', '轻小说');`,
    migrate: (db) => {
      // 表名白名单守卫（二轮审查低-4：防未来调用方传入未预期表名）
      const TAG_MAP: Record<string, string> = { 打斗: '对峙', 感情: '情感' }
      const ALLOWED_TABLES = new Set(['plot_events', 'scenes'])
      const retag = db.transaction((table: string) => {
        if (!ALLOWED_TABLES.has(table)) return
        const rows = db.prepare(`SELECT id, tags FROM ${table}`).all() as Array<{
          id: string
          tags: string
        }>
        const update = db.prepare(`UPDATE ${table} SET tags = ? WHERE id = ?`)
        for (const row of rows) {
          let arr: unknown
          try {
            arr = JSON.parse(row.tags)
          } catch {
            continue // 脏行跳过（保留原值，无害）
          }
          if (!Array.isArray(arr)) continue
          const next = arr.map((t) => (typeof t === 'string' && TAG_MAP[t]) || t)
          if (JSON.stringify(next) !== JSON.stringify(arr)) {
            update.run(JSON.stringify(next), row.id)
          }
        }
      })
      retag('plot_events')
      retag('scenes')
    }
  },
  {
    // v12 M11 灵感墙。ref_type/ref_id 为「入画布」回链（'plot'=情节大纲事件 / 'scene'=场景规划场景），
    // 不加 FK：回链目标分属两张表且解绑是普通编辑操作，用字符串+渲染层校验（删节点不级联删便签，
    // 便签侧显示「节点已删除」并可重新入画布）。
    // 注意 plot_events.parent_id 子画布预留列本期仍不落 FK（无消费方，见 M11 任务卡不做清单）。
    version: 12,
    sql: `
      CREATE TABLE IF NOT EXISTS inspirations (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL DEFAULT 'idea',
        title       TEXT NOT NULL DEFAULT '',
        content     TEXT NOT NULL DEFAULT '',
        source      TEXT NOT NULL DEFAULT '',
        ref_type    TEXT NOT NULL DEFAULT '',
        ref_id      TEXT NOT NULL DEFAULT '',
        wiki_refs   TEXT NOT NULL DEFAULT '[]',
        is_recycled INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inspirations_book ON inspirations(book_id, is_recycled);`
  },
  {
    // v13 M12 作品风格。style_profiles 全局风格包库——预设 5 包保持 presetStyles.ts 常量不入库，
    // 本表只存用户包（source_type 'digest' 为 M14 拆书产出预留）。rules 为叙事规则条目 JSON 数组，
    // 逐条注入提示词；word_target_min/max 为单章字数软目标（可空）。
    // books.style_profile_id 书侧绑定（一书一包），FK ON DELETE SET NULL=删包自动解绑回落。
    // 项目首个 ALTER TABLE 先例：SQLite ADD COLUMN 带 REFERENCES 合法，存量行默认 NULL=未绑定。
    version: 13,
    sql: `
      CREATE TABLE IF NOT EXISTS style_profiles (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        tone            TEXT NOT NULL DEFAULT '',
        rules           TEXT NOT NULL DEFAULT '[]',
        word_target_min INTEGER,
        word_target_max INTEGER,
        sample          TEXT NOT NULL DEFAULT '',
        source_type     TEXT NOT NULL DEFAULT 'manual',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      ALTER TABLE books ADD COLUMN style_profile_id TEXT REFERENCES style_profiles(id) ON DELETE SET NULL;`
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
  const d = db as Database.Database // 闭包内收窄（模块级 let 在事务回调中丢失非空推断）
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    // 单迁移统一事务（M10.8 静态审查：防 sql 与 migrate 部分生效——版本未记录但数据已改）
    const run = d.transaction(() => {
      d.exec(m.sql)
      m.migrate?.(d) // JS 数据迁移（v11+：复杂映射在嵌套事务/savepoint 内逐行处理）
      d.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString()
      )
    })
    run()
  }
  return db
}
