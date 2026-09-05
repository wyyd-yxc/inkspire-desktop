# M8 作品记忆 — 验收材料

## 范围
M8 交付作品记忆（长篇「事实层」，防穿帮）：五类事实卡片 + AI 从章节抽取 + 前章单向注入。入口：工作台侧栏「记忆」/ 路由 /book/:id/memory。

## 验收点
1. **五类记忆 CRUD**：plot 剧情状态/stage 舞台时空/character 角色状态/relationship 关系状态/clue 开放线索；手动录入（类型/内容/自第几章起成立）；编辑；删除确认；持久化
2. **概览与筛选**：左栏五类计数；「当前剧情视图」置顶展示 plot+stage
3. **线索回收**：clue 卡片「标记已回收/未回收」开关，徽标显示
4. **AI 抽取**：选章节 → AI 扫描正文 → 事实候选入库（kind 白名单五类、宽容解析、字段值禁双引号）；source=ai 徽标
5. **注入（核心）**：生成第 N 章续写时只注入 chapterNo < N 的记忆（前章事实遵守、后章事实不泄露）；1200 字预算
6. **入口**：侧栏「记忆」链接

## 开发自测声明（CDP 真实 UI 路径，tmp/m8-*.mjs）
- CRUD：create2→list→update(isResolved)→remove→finalCount ✓；空内容拦截 ✓
- AI 抽取：第一章正文（苏檀儿中箭/约定）→ 采纳 → 3 条正确分类入库（character/relationship/stage, ch1, source=ai）✓
- 注入方向：第二章续写 359 字——紧接前章「苏檀儿左臂中箭」伤势（不写满血恢复）✓；chapterNo=5 的后章记忆「终章大决战」未泄露 ✓
- **自测修复 1 个阻断**：memory 块在 watch(immediate) 之后 → TDZ 渲染层全崩 → 移至声明之后
- typecheck 三重闸门（tsc×2 + electron-vite build）✓

## 实现定位
- shared/memory.types.ts、main/db/{database(v8),memories}.ts、main/ipc/memories.ts、preload
- renderer/services/memoryPrompts.ts、views/MemoryView.vue、components/ChapterEditor.vue（memoryCache computed + writingContext.memory）
- services/aiWriting.ts（systemPrompt「当前故事状态必须遵守」段）

## 已知边界
- 记忆溯源历史版本未做（原站有，挂后续）；抽取候选项勾选式确认面板简化为直接入库
- 注入效果依赖模型遵循度；章节重排后 chapterNo 不自动跟随（排序变化需手动调整）
