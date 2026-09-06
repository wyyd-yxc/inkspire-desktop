# M10 剧情画布 — 验收材料

- 日期：2026-09-06
- 里程碑：M10 剧情画布（对照原站 doc.inkspires.cn/features/plot-canvas.html 与 refs/doc_plot_canvas.jpg）
- diff 基准：`v0.11.0-m9-assistant`（静态审查请显式带 `--base v0.11.0-m9-assistant`）

## 范围

工作台侧栏新增「剧情」入口 → `/book/:bookId/plot` 剧情画布（Vue Flow）：跨章节剧情事件节点 CRUD、
四类连线（主线/逻辑/关联/引用）+ 标签编辑、拖拽位置持久化、双击详情面板（标题/描述/标签/挂接百科词条）、
搜索高亮（匹配高亮描边/不匹配变暗）、AI 三模式（初始化事件链 / 向后延伸 / 分歧推演择一采纳）。
数据层 migration v10（plot_events + plot_edges 两表，books FK 级联）；IPC `plot:*` 与 `plot-edges:*` 各四通道。

## 验收点（双轨共同依据）

1. 工作台侧栏「剧情」入口可达，路由 `/book/:bookId/plot`
2. 事件增删改查：手动新建（面板）/双击编辑/删除（带确认，关联连线级联清理），重启应用后数据仍在
3. 拖拽节点位置持久化（drag-stop 落库，DB 直查复核 pos_x/pos_y）
4. 四类连线：拖拽手柄创建（防自环/防重复）、单击选中改类型+标签、删除；四类视觉可区分
5. 事件卡片：毛玻璃卡片 + 首标签渐变色条 + 标题/描述/标签 chips + 镶嵌词条图标
6. 详情面板：标题/描述/标签（顿号分隔）/挂接百科词条 toggle
7. 搜索高亮：关键词命中（标题/描述/标签）节点高亮描边并显示命中数，未命中变暗，清空恢复
8. AI 初始化：空画布生成 5-8 个事件，横向链式排布并自动连主线边；非空画布拦截提示
9. AI 向后延伸：基于选中事件生成 2-4 个后续事件，落位避让（同排被占自动换行），锚点→首事件连线
10. AI 分歧推演：配置方向数（2-4，可各填简述/留空）→ 各方向一组候选 → 方向选择弹窗 → 择一采纳上画布，
    源→首事件连逻辑边（标签=方向名）
11. AI 生成流式出字、可中止；采纳前 JSON 宽容解析（严格失败走修复器）
12. 删书级联：删除书籍连带清理 plot_events/plot_edges（FK ON DELETE CASCADE）

## 开发自测声明

环境：`npm run dev -- --remote-debugging-port=9222`（CDP 驱动真实 Electron，改码后完全重启再测）。
脚本（均在 tmp/，测试数据自建自清，DB 直查 `%APPDATA%/inkspire-desktop/inkspire.sqlite` 复核）：

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `tmp/m10-t1.mjs` | 验收点 1-7、12：入口/CRUD/双击面板挂词条/拖线建边/改类型/拖拽持久化/搜索高亮/级联删除 | **18/18 通过** |
| `tmp/m10-t2.mjs` | 验收点 8-9（AI 初始化真实出字 7 事件 6 连线；延伸 +3 事件避让落位 y=460） | 初始化/延伸全过；分歧首跑失败（见下） |
| `tmp/m10-t2b.mjs` | 验收点 10（分歧推演复跑：3 方向卡 → 采纳 → 1→4 事件，逻辑边标签=方向名） | **6/6 通过** |

自测中发现并修复的问题（均已提交 daefb63）：

1. **P0**：节点卡片 `overflow-hidden` 把右手柄外半截裁剪（裁剪边界=padding 盒），手柄中心点命中测试失败，
   拖线从右手柄无法发起——重构 PlotEventNode 结构（手柄移出裁剪层）。CDP 探针复验通过。
2. **P0**：分歧采纳把响应式 Proxy 数组直接过 IPC → "An object could not be cloned."（踩坑 #11 变体）——
   采纳入口 `JSON.parse(JSON.stringify(toRaw(dir)))` 深拷贝。复跑通过。
3. 分歧落位无占位避让（与延伸行重叠）——补逐行下移避让。

`npm run typecheck` 三重闸门全绿；控制台无报错（各脚本均断言 consoleErrors=0）。

## 实现定位

- 共享类型：`src/shared/plot.types.ts`
- 数据层：`src/main/db/database.ts`（migration v10）、`src/main/db/plot.ts`、`src/main/db/plotEdges.ts`
- IPC：`src/main/ipc/plot.ts`（wrap+assertUuid）、`src/main/index.ts`（注册）、`src/preload/index.ts`（api.plot/plotEdges）
- 渲染层：`src/renderer/src/views/PlotCanvasView.vue`（编排）+ `components/plot/`（PlotEventNode/PlotDetailPanel/PlotAiDialog/PlotDivergeDialog）
- AI：`services/plotPrompts.ts`（三模式提示词+宽容解析）、`composables/usePlotAi.ts`（生成编排+落库）、`composables/usePlotEdges.ts`（连线编辑）
- 入口：`router/index.ts`、`components/ChapterSidebar.vue`、`docs/design/architecture.md`（路由表已同步修正为 `/book/:bookId/plot`）

## 设计边界（按 HANDOVER M10 任务卡裁剪，防 scope 蔓延）

- 仅「剧情事件」一种节点；原站的灵感节点/章节引用节点/子画布/插入/素材组合模式不在本里程碑（灵感墙 M11 后续）
- `plot_events.parent_id` 为子画布预留列，M10 恒为 null；`plot:list` 保留 parentId 过滤位
- 连线视觉沿用章节画布三类配色，新增 reference（绿点线）；原站文档未定义四类连线视觉，此为自定设计
- AI 使用「默认档案」管线（resolveProfile），含 429/502/503/504 自动重试；提示词不使用内部流程术语（踩坑 #16），
  以「故事核心设定/分卷大纲」转述创世 step2/step4
- 事件标签色板 8 色哈希取色（标签决定节点视觉色，照原站文档描述）

## 已知边界

- 创世台未填写时 AI 仍可生成（上下文降级为书名+词条），不强制前置
- AI 输出为半截 JSON（流中途异常）时解析失败，提示「AI 输出格式异常」，可点「↻ 重写」重试
- 未引入 minimap/controls 依赖（保持零新增依赖）
- 无暗色主题适配（全项目统一浅色，预留 [data-theme=dark]）

---

## 勘误（2026-09-06 黑盒验收后追加）

- 「设计边界」中「事件标签色板 8 色哈希取色」已过时：静态审查三轮 P3 整改后色板扩为 **16 色**（src/renderer/src/services/plotStyle.ts TAG_PALETTE，commit c780a08）。原文不改，以此为准。
