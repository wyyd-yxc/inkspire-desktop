# M10.8 验收材料（严肃写作视觉改造 + 重命名 + 数据迁移）

- 日期：2026-09-07 · 会话 37
- diff 基准：`v0.14.0-m10.6-m10.7`（静态审查请显式 `--base v0.14.0-m10.6-m10.7`）
- 关键提交：143f963（视觉）、234d66a（重命名 60 文件）、2630fe2 之外 v11 执行器 cc84991、5b75b5c（封面）

## 范围

1. **接入说明**：OpenDesign（nexu-io/open-design）经查其 `od` CLI 仅随 400MB 桌面应用分发（无独立 npm 包，`npx od init` 为路线图未交付项），且 MCP 支持列表无 ZCode——按计划降级条款由开发侧直接产出设计令牌；日后安装桌面应用可 `od mcp install` 接入（接入要点已记录本文档第六节）。
2. **视觉改造**（theme.css 令牌重定义，组件类名零改动）：暖米纸底 #faf8f3 + 炭墨主色 #3a352e + 状态色降饱和 + 圆角 12→8px + 阴影减轻 + **衬线字体**（h1/h2 与正文编辑区 `--font-serif: Noto Serif SC/…`，UI 控件保持无衬线）+ body 去紫彩渐变改纸色微渐变；漏网色收编：剧情连线/16 色标签板/记忆五类角标/百科六类型渐变/场景状态色/书封面占位渐变（全部降饱和墨系）。
3. **重命名**（用户可见文案，60 文件）：墨灵→**墨笺**（窗口/安装包显示名/UI；appId cn.inkspire.desktop、数据目录 inkspire-desktop、executableName InkSpire **不动**——数据与升级链路保护）、书斋→书房、工作台→写作台、创世台→**构思台**（五步：基调/内核/世界构建/结构/开笔）、万物百科→设定集（短名 设定）、作品记忆→叙事档案（短名 档案）、章节画布→场景规划、剧情画布→情节大纲（短名 情节）、金手指→核心能力、一键冷启动→一键起草、墨灵助手→写作助手；**prompt 网文×8→长篇小说系**（改变 AI 输出调性）、爽点→情绪高点、伏笔布局保留（通用词）；装饰符号（⚡✦✧⟳⑃⇦⇨🧹■↻⇋✎）全清，同步按钮改文字「同步」。
4. **migration v11**（数据映射，只增不改）：books.genre 旧值映射（玄幻/仙侠→奇幻、都市/言情→现实主义、游戏/轻小说→其他）；plot_events.tags/scenes.tags 旧标签映射（打斗→对峙、感情→情感）——**JS 逐行事务实现**（执行器扩展 `migrate?` 钩子；纯 SQL 的 UPDATE 相关子查询+json_each 表值函数实测抛 malformed JSON）。

## 验收点

1. 产品名/窗口标题/页面 h1 为墨笺；安装配置 productName/shortcutName 为墨笺
2. 全部页面/按钮/提示为新命名，全仓旧命名（书斋/创世台/金手指/爽点/网文等）grep 清零
3. h1/h2 与正文编辑区为衬线字体；主题色令牌生效（纸底 rgb(250,248,243)）
4. migration v11 实测：旧库（genre 玄幻/科幻、tags 含感情）升级后 genre=奇幻/科幻、tags 零旧值、版本=11
5. prompt 无内部流程术语（基调/内核/构思台等新内部名不入提示词——踩坑 #16 纪律）且「网文」清零
6. 书签/剧情等引用旧数据的页面正常渲染（迁移后功能回归：M107 核心链路复测）
7. console 零报错；应用启动正常（迁移失败会阻断 DB 调用——需验证）

## 开发自测声明

`npm run typecheck` 三重闸门绿。tmp/m108-t1.mjs **12/12**（无 AI）：产品名/衬线/纸底令牌/侧栏与各页新命名/五步新名/一键起草/设定集与叙事档案与情节大纲页/编辑器衬线/符号清零/console 零报错；截图 tmp/m108-01-home.png、02-genesis.png、03-editor.png。migration 实证：v10 旧库（genre 玄幻、tags 含「感情」）重启后版本=11、genre=奇幻/科幻、tags 旧值清零（plot+scenes）。

**自测发现并修复**：v11 首版纯 SQL 实现（json_each 相关子查询）抛 malformed JSON 且 exec 无事务致「genre 已迁移但版本未记录、应用每次启动重抛」——重构为执行器 `migrate?` 钩子 + JS 事务逐行（cc84991）。

## 已知边界

- 跨标签富文本（`<b>林</b>昭`）反向替换安全跳过（M10.7 已登记）；产品 UI 无内联格式来源
- genesis step1 的 styleName 冗余中文残留旧风格名（历史数据显示层保留；风格包 promptHint 严肃化改写见 presetStyles）
- findDuplicate 全表扫描、settings 白名单机制收紧为已登记技术债

## 实现定位

- theme.css（令牌+衬线规则）、plotStyle.ts（连线/标签板）、useMemorySync.ts（角标）、WikiView.vue（类型渐变）、BookCard.vue（封面渐变）、CanvasView.vue（场景状态/连线色）、usePlotEdges.ts（labelBg）
- 重命名：60 文件（views/components/services/composables/preload/main 注释与文案/index.html/electron-builder.yml/package.json description）
- migration v11+执行器：main/db/database.ts
- prompt：aiWriting/plotPrompts/scenePrompts/memoryPrompts/genesisPrompts/wikiPrompts/AssistantDock（网文→长篇小说；金手指→核心能力；爽点→情绪高点）

## 设计参考（第六节：OpenDesign 接入备忘）

若日后接入：① 安装 open-design.ai 桌面应用（Windows setup 400MB，含 od CLI）；② `od mcp install <agent>` 生成 stdio MCP 配置（支持列表无 ZCode，需手动在 ZCode 配置 mcpServers：command=od，args=['mcp','serve']——以当时版本为准）；③ MCP 就绪后 agent 可读取设计项目 `design-systems/<brand>/tokens.css` 实时令牌。当前本项目的令牌即按该形态维护于 theme.css（@theme 单一来源）。
