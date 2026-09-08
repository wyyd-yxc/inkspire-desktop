# M11 验收材料（灵感墙：五类便签 + 入画布联动 + 划词存灵感）

- 日期：2026-09-08 · 会话 38
- diff 基准：`v0.15.1-m10.8-final`（静态审查请显式 `--base v0.15.1-m10.8-final`；此 tag 为 M10.8 docs 收尾提交的补标）
- 关键提交：ec25019（浮球债清偿）、b0170e1（数据层）、dab660d（墙页）、bdaf170（入画布联动）、737ac02（划词存灵感）、2a22898（bookId 响应式真 bug 修复）

## 范围

1. **灵感墙页**（/book/:bookId/inspirations，侧栏「灵感」pill 入口）：五类便签（灵感/伏笔/片段/备忘/待办）卡片墙（网格流）+ 类别筛选（计数角标）+ 关键字搜索（标题/内容）+ 回收站切换；便签卡=类别色条头+标题（衬线）+内容（5 行截断）+关联词条角标（@名）+出处小字。
2. **便签 CRUD**：新建/编辑弹窗（类别 pills/标题/内容/关联设定集词条多选）；删除=软删入回收站；回收站内可恢复/逐条彻底删除（确认弹窗）/清空回收站（确认弹窗）；彻底删除仅回收站内允许（DAO 兜底校验「仅回收站内的便签可彻底删除」）。
3. **migration v12**：`inspirations` 单表（id/book_id FK CASCADE/kind/title/content/source/ref_type/ref_id/wiki_refs JSON/is_recycled/时间戳 + idx(book_id, is_recycled)）。**不加 pos 列**（网格流非自由画布）；**plot_events.parent_id 子画布预留列本期不落 FK**（无消费方，SQLite 加约束需重建表——任务卡不做清单登记）。
4. **入画布联动**：便签卡「入画布」→ 目标弹窗（情节大纲事件 / 场景规划场景+选章节）→ 复用既有 plot:create / scenes:create 建节点（标题←便签标题，内容→描述/摘要，wikiRefs 随迁）→ 便签写回链 ref_type/ref_id +「已入画布」角标；已入画布显示「查看」（情节直达 /plot；场景经新通道 scenes:get 反查章节跳 /canvas/:chapterId）与「解绑」（清回链，画布节点保留，可重入）。
5. **画布来源行**：PlotDetailPanel 增「来自灵感墙：〈便签标题〉」信息行（渲染层按 refId join，不改 plot_events 表）。
6. **划词存灵感**：写作台划词浮条增「存为灵感」（与润色/扩写/改写分隔），选区原文存为 idea 类便签，标题=选区前 20 字，出处=「划自·〈章节名〉」，正文零改动。
7. **零 AI 声明**：M11 全功能不调用 AI、不入自动同步三目标（不加第四水位）——灵感墙=作者主动素材区，与 AI 维护的设定集/叙事档案分工（伏笔便签不与叙事档案「开放线索」自动互通）。
8. **债清偿**（第 0 步）：M10.5 黑盒债「浮球定死右下角遮挡 AI 采纳条」——浮球支持拖动（pointer capture，4px 位移阈值区分点击）+ 位置记忆 localStorage(`inkspire.assistant_ball_pos`) + 窗口内钳制；拖拽结束自身的 click 被吞（拖完不误弹面板）。

## 验收点

1. 五类便签新建/编辑/软删/恢复/彻底删除/清空回收站，重启持久（含回收站状态逐字段）
2. 回收站切换正确；软删便签不出现在正式墙
3. 关联设定集词条可选可显（卡片 @角标）；词条删除后卡片降级显示「已删词条」不报错
4. 入画布→情节大纲：节点创建成功（标题/描述/wikiRefs 正确、落位 maxX+340）、便签回链+「已入画布」角标+查看跳转
5. 入画布→场景规划（选章节）：场景建在所选章节（标题/摘要正确）；查看经 scenes:get 反查章节跳画布
6. 已入画布便签不可重复入（按钮变 查看/解绑）；解绑后节点保留、可再入画布
7. 划词存灵感：浮条出现「存为灵感」，点击后便签入库（idea+出处=划自·章节名），正文不变
8. PlotDetailPanel 显示「来自灵感墙」来源行（仅由便签创建的事件）
9. 删书级联清理 inspirations（FK CASCADE）；全程零 AI 调用；console 零报错

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron（9222），**全程零 AI**，测试书/便签自建自清（删书级联终审计+localStorage 复位）：

- **tmp/m11-t1.mjs 21/21**：migration v12 断言/表存在/灵感墙页打开/UI 全链路新建（类别切换+词条关联）/DB kind 断言/编辑/三卡计数/类别筛选与侧栏计数/搜索/软删隐藏/回收站计数与视图/恢复/确认弹窗/彻底删除（容器定位）/DB 物理删/重载持久/删书级联清零
- **tmp/m11-t2.mjs 20/20**：入画布→情节（DB 事件行+回链+角标+查看跳 /plot+**详情面板「来自灵感墙」来源行**）/解绑（ref 清空+节点保留+可重入 → plot=2）/入画布→场景第二章（scenes 行+回链+查看跳 /canvas/:ch2）/划词存灵感（Range 定位「玄铁令」+Shift+→×3 确定性选区，浮条出现→入库 idea+出处）/浮球拖动（位移 260px+localStorage 记忆+拖后不误弹面板+单击展开）/删书级联
- **tmp/m11-t3a/t3b.mjs 5/5**：**整进程重启持久**——重启前建 2 便签（1 张预入回收站），重启 dev 后逐字段比对一致、回收站状态持久、UI 可见
- 侧栏入口探针：写作台「灵感」pill 存在且点击跳 /inspirations、墙页渲染

**自测发现并修复 1 个真 bug**（2a22898）：InspirationsWallView 静态捕获 `route.params.bookId`，Vue Router 对同一路由记录复用组件实例——同路由跨书导航时页面停留在旧书数据（创建操作甚至会对已删书触发 FK 错误）。照 PlotCanvasView 惯例改 computed+watch 重载（M10.5 承接期 useMemorySync 同类问题）。

**测试脚本教训**（沿用 M10.5）：绕过 UI 直写 API 后必须重载组件再断言（T1 首轮 4 项失败根因，非应用缺陷）；中文双击仅选单字、浮条按设计要求 ≥2 字选区——T2 改用 Range 定位+键盘扩选的确定性选区。

## 已知边界

- 场景规划侧画布节点无「来自灵感墙」来源行（仅情节大纲详情面板有；场景回链经便签侧「查看」跳转闭环）——v1 范围裁决，见任务卡不做清单
- 便签被解绑/节点被删后无主动提醒（便签侧显示可「重新入画布」；情节事件被删则回链悬空、便签仍显示已入画布，可解绑重入）——悬空回链的主动探测未做
- 回收站不自动过期清理（无保留天数策略）
- 浮球位置为全局记忆（跨书共享，窗口内钳制；窗口尺寸变小后载入位置会被钳制回界内）

## 静态审查整改记录（r1 → 2aa37d8）

r1（glm-5，2026-09-08）提出中 2 / 低 3 / 无法判定 5。整改与裁定：

| 项 | 裁定 | 处理 |
|---|---|---|
| 中-1 回链可单独更新 refId 致悬挂 | 采纳 | DAO update 强制 refType/refId 成对，单独传 refId 抛「回链需 refType 与 refId 成对更新」 |
| 中-2 清空回收站非原子 | 采纳 | 新通道 `inspirations:clear-recycled(bookId)`，DAO 单条 SQL 原子删除返回删除数；视图弃循环删；toast 带张数 |
| 低-3 词条逐 id 查询 | 采纳 | 抽 `assertWikiRefsBelongToBook`：`WHERE id IN (...)` 单次查询+Map 比对（create/update 共用） |
| 低-4 IPC 未校验 refType | 采纳 | `assertRefType` 白名单（''/'plot'/'scene'）IPC 层拦截，DAO 白名单兜底 |
| 低-5 浮球状态残留 | 半采纳 | 变量实为组件 setup 作用域（非模块级，审查误读）；但切页卸载时拖拽确可能未收到 pointerup——补 onUnmounted 重置 |
| 无法判定 ×5 | — | 均因 diff 截断未渲染层源码；实现俱在（见下方附录），r2 复审以附录为准 |

**整改回归**：tmp/m11-r2-regression.mjs **6/6**（成对校验拒绝/原子清空含张数提示/DB 终态 2 张正式墙/清理）；T1 全量重跑 21/21。

## 附录：r1 无法判定项对应源码事实

1. **词条删除后卡片降级**：`InspirationsWallView.vue` `wikiName(id)` 返回 `wikiEntries.find(...)?.name ?? '已删词条'`；卡片角标 class `wikiEntries.some((w) => w.id === rid) ? '' : 'line-through opacity-60'`。
2. **情节事件落位**：入画布不传 posX/posY，走 `src/main/db/plot.ts` 既有默认 `posX ?? maxX + 340`、`posY ?? 240`（M10 三轮审查 P2 逻辑原样复用）；场景走 `count+1)*320`。
3. **来源行渲染**：`PlotCanvasView.vue` `panelSourceNote` computed = `inspirations.find(it => it.refType === 'plot' && it.refId === panelEvent.id)?.title ?? null`，传 `PlotDetailPanel` prop `sourceNote`，面板 header 下条件渲染「来自灵感墙：〈title〉」。
4. **划词选区**：`ChapterEditor.saveSelectionAsInspiration()` 直读 TipTap `ed.state.selection`（from/to/textBetween），与浮条同一选区来源，无独立获取路径。
5. **跨书导航修复**：`InspirationsWallView.vue` `const bookId = computed(() => route.params.bookId as string)` + `watch(bookId, () => void load())`，全部调用点 `bookId.value`。

## 实现定位

- shared：`src/shared/inspiration.types.ts`（Inspiration/五类 kind 中文标签/入参）
- main：`src/main/db/database.ts`（migration v12）、`src/main/db/inspirations.ts`（DAO：kind/refType 白名单、词条归属校验、回收站删除兜底）、`src/main/ipc/inspirations.ts`（四通道 UUID 校验+wrap）、`src/main/ipc/scenes.ts`（scenes:get 单查）、`src/main/index.ts`（注册）
- preload：`src/preload/index.ts`（inspirations 组 + scenes.get）
- renderer：`src/renderer/src/views/InspirationsWallView.vue`（墙页）、`src/renderer/src/components/inspiration/InspirationEditDialog.vue`（编辑弹窗）、`src/renderer/src/components/inspiration/SendToCanvasDialog.vue`（入画布弹窗）、`src/renderer/src/services/inspirationStyle.ts`（五类降饱和色卡）、`src/renderer/src/components/ChapterSidebar.vue`（灵感 pill）、`src/renderer/src/router/index.ts`（路由）、`src/renderer/src/components/plot/PlotDetailPanel.vue`（sourceNote 来源行）、`src/renderer/src/views/PlotCanvasView.vue`（灵感装载+join）、`src/renderer/src/components/ChapterEditor.vue`（存为灵感）、`src/renderer/src/components/AssistantDock.vue`（浮球拖动）

## 设计边界（任务卡已确认口径）

- 「拖入画布」以「入画布」按钮+弹窗实现（两张画布是独立路由，HTML5 跨路由拖拽不可行，语义等价）
- 不做：自由拖拽定位墙面/便签间连线/子画布与 parent_id FK/AI 生成灵感/情节「素材组合」「平行推演」模式/入自动同步/移动端
