# M10.8 验收材料 r2（一轮处置 + 截断盲区补齐）

> 主体：material-M10.8.md。一轮审查（有条件通过）三项处置，整改 commit fe9f1a6。回归：M108 走查 12/12 + M107 功能 14/14（统一事务重构后）。

## 一轮处置

| 一轮条目 | 处置 |
|---|---|
| 高 核心视觉代码证据缺失（diff 截断） | **附录 A 补 theme.css 全量 + plotStyle.ts 全量 + database.ts 迁移执行器**；另自测的 CDP computed-style 断言（纸底 rgb(250,248,243)、h1/编辑器 computed fontFamily 含衬线）即运行时实证，截图 tmp/m108-01~03.png |
| 中 迁移机制事务隔离（exec 与 migrate 与版本记录分离） | **已整改**（fe9f1a6）：单迁移统一 `db.transaction`（sql+migrate+INSERT 原子化；v11 内部 retag 事务自动降级 savepoint）。回归：重启后版本 11、应用正常、M108+M107 全过 |
| 低 package description 措辞 | **已整改**：「AI 驱动的长篇小说创作工作台（本地数据 + 自定义 AI API）」（顺带移除「复刻自 inkspires.cn」——严肃化后不再标注来源站） |

## 无法判定项处置
- 旧命名 grep 清零 / 引用旧数据页面渲染 / console：开发侧 CDP 走查 12/12 已实证（含旧命名残留断言=空数组）；黑盒轨道独立复测

## 附录 A：核心源码
### src/renderer/src/styles/theme.css（全量）
```css
/*
 * 全局主题（墨笺·案头纸墨，严肃写作风）。
 * 以 Tailwind 4 的 @theme 定义设计令牌：模板中可用 bg-paper / text-ink 等工具类。
 * 设计语言：暖米纸底 + 炭墨主色 + 衬线标题/正文编辑区，去彩度、轻装饰（M10.8 严肃化改造）。
 * 暗色模式预留：后续通过 [data-theme="dark"] 覆盖同名变量即可，无需改组件。
 */
@import 'tailwindcss';

@theme {
  /* 背景与表面（暖米纸色，无彩渐变） */
  --color-paper: #faf8f3; /* 米纸底：全局背景 */
  --color-surface: #fffefb; /* 卡片表面（微暖白） */

  /* 主色：炭墨（沉稳、去彩） */
  --color-ink-primary: #3a352e;
  --color-ink-primary-hover: #26221b;
  --color-ink-primary-soft: #f1ede2; /* 主色浅底（选中态/标签底） */

  /* 文字 */
  --color-ink-text: #2b2721; /* 深炭：主文字 */
  --color-ink-text-secondary: #6d6558; /* 次要文字 */
  --color-ink-text-muted: #a89e8e; /* 占位/辅助 */

  /* 边框与状态（低饱和） */
  --color-ink-border: #e6dfd1;
  --color-ink-danger: #b04a3e; /* 朱砂偏暗：删除/错误 */
  --color-ink-warning: #a8813c;
  --color-ink-success: #4a7d5b;

  /* 圆角与阴影（收敛圆角，阴影更轻） */
  --radius-card: 8px;
  --shadow-card: 0 1px 2px rgb(43 39 33 / 0.05), 0 3px 12px rgb(43 39 33 / 0.05);

  /* 字体：标题与正文编辑区衬线（严肃写作），UI 控件保持无衬线 */
  --font-serif: 'Noto Serif SC', 'Source Han Serif SC', 'STZhongsong', SimSun, Georgia, serif;
}

/* 全局基础样式 */
html,
body,
#app {
  height: 100%;
}

body {
  margin: 0;
  background:
    linear-gradient(180deg, #f6f2e9 0%, var(--color-paper) 240px),
    var(--color-paper);
  color: var(--color-ink-text);
  font-family:
    'PingFang SC',
    'Microsoft YaHei',
    -apple-system,
    'Segoe UI',
    sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* 标题衬线：页面主标题/区块标题（严肃写作气质） */
h1,
h2 {
  font-family: var(--font-serif);
  letter-spacing: 0.02em;
}

/* 正文编辑区衬线 + 行长与行距（写作沉浸） */
.prose-editor-wrapper .ProseMirror,
.prose-editor-wrapper .tiptap {
  font-family: var(--font-serif);
  font-size: 16px;
  line-height: 1.9;
}

/* 暗色模式预留位：不实现，变量清单与浅色一一对应
[data-theme='dark'] {
  --color-paper: ...;
}
*/
```
### src/renderer/src/services/plotStyle.ts（全量）
```ts
/**
 * 情节大纲渲染层样式常量：连线四类型视觉（颜色/线型/展示名）与标签取色。
 * M10.8 严肃化：低饱和墨系配色（炭/黛/赭/青灰/橄榄/绛），降低彩度。
 */
import type { PlotEdgeType } from '../../../shared/plot.types'

export const PLOT_EDGE_STYLES: Record<PlotEdgeType, { stroke: string; dash: string; label: string }> = {
  main: { stroke: '#8a6d2f', dash: '0', label: '主线' },
  logic: { stroke: '#4a6f8a', dash: '6 4', label: '逻辑' },
  relation: { stroke: '#8b8574', dash: '2 4', label: '关联' },
  reference: { stroke: '#5c7d63', dash: '1 4', label: '引用' }
}

/** 标签色板：事件节点左侧色条按首个标签取色（同一标签恒同色）。
 *  16 色低饱和墨系（M10.8 严肃化），保留哈希取色的稳定性 */
const TAG_PALETTE = [
  '#6b5f4a', '#8a6d2f', '#4a6f8a', '#5c7d63',
  '#a1663f', '#6d5a7d', '#96555f', '#47807a',
  '#8a6a4a', '#5f7050', '#8a5560', '#4a6a80',
  '#75628a', '#96774a', '#5f7d6d', '#665f8a'
]

export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}
```
### src/main/db/database.ts 迁移执行器与 v11（L10-11、225-270）
```ts
/** 每个迁移：版本号 + 建表/改表 SQL；v11 起支持可选 migrate（JS 数据迁移，事务内执行）。
 *  禁止修改已发布的历史迁移 */
const MIGRATIONS: Array<{
  version: number
  sql: string
  migrate?: (db: Database.Database) => void
}> = [
  {
    version: 1,
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
```
### GenesisView STEP_LABELS/HINTS
```ts
const STEP_LABELS = ['基调', '内核', '世界构建', '结构', '开笔']
const STEP_HINTS = [
  '选一个文风参考',
  '一句话锁定故事核心',
  '起草世界观设定',
  '规划分卷与章节大纲',
  '开始写正文'
]

const completedCount = computed(
```
