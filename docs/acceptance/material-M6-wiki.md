# M6 万物百科 — 验收材料

## 里程碑与范围
M6 交付万物百科（世界观知识库）：词条管理 + AI 生成词条 + 创世台导入 + AI 写作注入。入口：书斋卡片「百科」/ 工作台侧栏「百科」/ 路由 /book/:id/wiki。

## 验收点
1. **词条 CRUD**：新建（6 类型）/编辑/删除（确认弹窗）+ 持久化（重启不丢）；属性键值对增删
2. **筛选与搜索**：左栏 6 类型筛选（带计数）+ 关键词搜索（名称/简介/内容/属性）
3. **AI 生成词条**：选类型+关键词 → 流式生成 → 采纳填入编辑面板（名称/简介/内容/属性/系统角色）→ 保存；防撞名（提示词带已有词条名）；字段值含英文双引号时宽容解析
4. **创世台导入**：一键把造世冷启动的「主角设定」→角色词条、「世界法则」→背景词条（always 注入），幂等（重复导入不重复建）
5. **AI 写作注入**：injection=always 词条进 systemPrompt（1200 字预算），续写遵守词条设定（专有名词/属性不错）；manual 词条不自动注入
6. **系统角色与徽标**：5 档系统角色标注；常驻（always）徽标显示

## 开发自测声明（CDP 真实 UI，tmp/m6-*.mjs）
- CRUD 回环（IPC 直调）：create2→list→update→remove→final ✓
- 真实 UI 新建（响应式表单→IPC）：DB 验证 name/summary ✓（需 bookId 修复后）
- AI 生成词条：真实流式 → 采纳 → 编辑面板 name=「残音」content 213 字属性 4 个 ✓（lenient 修复后）
- 创世台导入：2 词条 always+幂等（二次导入 count 仍 2）✓
- 注入：续写 663-724 字含词条专有名词（前文无）✓
- typecheck 双 0

## 实现定位
- shared/wiki.types.ts（类型+常量）、main/db/{database(v5),wiki}.ts、main/ipc/wiki.ts、preload
- renderer/services/wikiPrompts.ts（提示词+解析+创世台转换）、services/jsonRepair.ts（lenientParse）
- renderer/views/WikiView.vue（三栏）、components/ChapterEditor.vue（wikiCache 三件套）、services/aiWriting.ts（WritingContext.wiki+systemPrompt）

## 自测中修复的 bug（验收员重点关注回归）
1. **stale bookId**（三视图）：route.params.bookId 在 setup 一次性捕获，同路由跨书导航组件复用拿旧 id → WikiView/GenesisView/WorkspaceView 改 computed+watch 重载。请专门测试「书 A 百科 → 书斋 → 书 B 百科」保存是否正确落 B。
2. **AI JSON 未转义引号**：lenientJsonRepair 状态机（值内孤立引号转义后重试）。请测试 AI 生成词条采纳成功率。

## 已知边界
- 关系（relations）已存储并在注入时展示（关系→目标名），但无独立关系编辑 UI（详情面板后续版本）；词条详情 AI 分析标签页未做
- 导入词条名取造世文本首行（可能带句号，可在面板改名）
- 浏览器直开（非 Electron）wiki 页无数据（isElectron 守卫），正常
