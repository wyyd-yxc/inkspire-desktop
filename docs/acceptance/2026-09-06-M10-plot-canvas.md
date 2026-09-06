# M10 剧情画布黑盒验收报告

- 日期：2026-09-06 · 验收人：GLM-5.3-Flash（ZCode 内置模型）· 独立黑盒验收子代理（新接手者视角）
- 验收环境：`npm run dev -- --remote-debugging-port=9222`（CDP 直连真实 Electron 应用，页面 http://localhost:5173）· DB 直查 `%APPDATA%/inkspire-desktop/inkspire.sqlite`（better-sqlite3 只读）
- 结论：**通过**（14/14 验收点全部实测通过，未发现阻断/一般级缺陷；2 个轻微 UX 问题与 1 处材料文档不同步见「发现的问题」。验收过程有 1 项流程偏差需向用户如实报告，见「验收环境与方式」末段）

## 验收环境与方式（含脚本清单与数据自清声明）

- **方法**：只读 docs/HANDOVER.md 第 9 节、docs/standards/acceptance-workflow.md、docs/acceptance/material-M10-plot-canvas.md 建立预期 → 白盒抽查 src/ 数据层/IPC/渲染层 → 编写独立 CDP 脚本驱动真实应用（与开发自测脚本 m10-t1/t2b 相互独立，用例自行设计）。
- **真实输入口径**：按钮/节点/连线点击、手柄拖线、节点拖拽均为 CDP `Input.dispatchMouseEvent` 多点插值真实鼠标；文本录入为 `Input.insertText`（IME 式）+ 真实 Enter/Ctrl+A/Backspace 键盘事件。两处例外（历史报告同口径）：① 原生 `<select>`（连线类型/分歧方向数）无法被 CDP 展开，以 JS 设值 + `change` 事件触发真实 `@change` 处理链；② 书卡删除按钮为 `hidden group-hover:flex`，先真实悬停再点击（真实用户行为）。
- **AI 用例**：全部走应用内默认 GMI 档案真实出字（MiniMaxAI/MiniMax-M3），流式长度有时间线证据，无 429；未动任何源码。
- **脚本清单**（均在 tmp/）：`m10-bb-acc-lib.mjs`（公共库）、`m10-bb-acc-s1.mjs`（点 1-7、14a）、`m10-bb-acc-s1b/s1b2/s1b3.mjs`（自环与标签补测，s1b3 为终版）、`m10-bb-acc-s2.mjs`（点 8/11/9）、`m10-bb-acc-s2b.mjs`（点 10）、`m10-bb-acc-s3.mjs`（点 14b + 杀进程）、`m10-bb-acc-s3b.mjs`（重启复核，点 13）、`m10-bb-acc-s3c.mjs`（UI 删书，点 12 + 终审计）、`m10-bb-acc-diag*.mjs`（5 个诊断探针）。
- **截图证据**（tmp/）：`m10-bb-acc-01-canvas.png`（画布全景·四类连线）、`02-detail-panel.png`（详情面板）、`03-search-hit.png`（搜索高亮）、`04-ai-init.png`（AI 初始化结果）、`06-diverge-dialog.png`（分歧方向弹窗）、`07-diverge-adopted.png`（分歧采纳后）、`08-restart.png`（重启后画布）。
- **数据自清声明**：专用书《M10-BB-验收》与《M10-BB-验收-跨书》测试完成后已删（后者经 IPC、前者经书架 UI 真实删除流）。终审计 DB 直查：`books WHERE title LIKE 'M10-BB-验收%'`=0、`plot_events`=0（全表）、`plot_edges`=0（全表）、对应 wiki_entries=0。库内既有书籍（《one last alien》《验收M9-助手》，均早于本次验收）未做任何改动。dev 实例保持运行（重启测试后由本代理重启的实例仍在 9222 端口）。

**过程偏差（如实报告）**：任务规则约定「测试脚手架自身错误累计超过 3 次即取消黑盒」。本次脚手架错误共 **8 次**（均已当场根因修复）：① 标签框选择器误中搜索框；② Electron 窗口失焦致点击无法聚焦（引入 Page.bringToFront）；③ toast 显示期拦截其覆盖区点击（引入 waitToastGone；该项同时构成应用轻微问题，见问题 1）；④ s2 v1 断言等待(3s)长于 toast 存活期(2.6s)且失败清理误清画布；⑤ P10 流程漏点「✓ 采纳插入」致空等（方向弹窗以此为入口）；⑥ Windows 下 `spawn('npm.cmd')` 缺 `shell:true` 抛 EINVAL；⑦ CDP 轮询循环漏 sleep；⑧ 删除按钮未悬停时 `display:none` rect 全零。上述均为测试脚手架问题而非应用缺陷，且每个验收点的最终判定均建立在修复后的真实输入 + DB 直查复核之上，无任何一项依赖降级路径；考虑到全部 14 点已可完整验证，未中止测试。此偏离如实记录，供用户按规则裁量。

## 验收点逐项核对

| # | 验收点 | 结果 | 备注 |
|---|---|---|---|
| 1 | 工作台侧栏「剧情」入口可达 | **PASS** | 侧栏 `a[title="剧情画布"]` 真实点击 → hash=`#/book/:id/plot`，页头「剧情画布」渲染（s1） |
| 2 | 事件 CRUD（新建/双击编辑/删除带确认+级联） | **PASS** | 面板新建（标题/描述/标签）→ DB 落库一致；双击编辑 + 挂词条 toggle → `wiki_refs` 落库；「删除事件」→ 确认弹窗（含「关联连线将一并删除」提示）→ 删除后 DB events 4 / edges 2（两条关联边级联消失）+ toast；重挂载后数据仍在（s1） |
| 3 | 拖拽节点位置持久化 | **PASS** | 真实拖拽节点 E（+140,+90）：DOM transform 由 (1000,480)→(1266,650)，DB 直查 pos_x=1266/pos_y=650 与 DOM 逐像素一致（s1） |
| 4 | 四类连线（拖建/自环/重复/改类型+标签/删除/视觉区分） | **PASS** | 拖手柄建边默认 main 落库；自环拖拽边数不变（无 toast，见问题 2；IPC 直调自环被拒「不能连接事件到自身」）；同向重复被拒「两个事件间已存在连线…」；单击边打开编辑器，改 logic/relation/reference + 标签「敌情线索」真实输入回车落库；四类 stroke `rgb(201,162,39)/rgb(91,155,209)/rgb(157,151,181)/rgb(88,162,122)` + 线型 `0/6,4/2,4/1,4` 四种组合互异，标签 DOM 可见；编辑器「删除」删边 DB 同步（s1、s1b、s1b3、截图 01） |
| 5 | 事件卡片视觉 | **PASS** | DOM 断言：内层卡片 `backdrop-blur` + `bg-surface/85`（毛玻璃）、色条 `linear-gradient`（首标签取色）、标签 chips×2、`📖 林小天` 词条图标；全景截图 m10-bb-acc-01 |
| 6 | 详情面板字段完整 | **PASS** | 双击打开编辑面板：标题/描述/标签（顿号分隔提示）/挂接百科词条 toggle 四区齐全，词条选中态高亮 `border-ink-primary`；截图 m10-bb-acc-02 |
| 7 | 搜索高亮 | **PASS** | 输入「下山」：命中节点 `ring-2` 描边、未命中 `opacity-30` 变暗、显示「1 命中」；清空（Ctrl+A+Backspace）后全部恢复、命中数消失；截图 m10-bb-acc-03 |
| 8 | AI 初始化（空画布 5-8 事件 + 链式连线；非空拦截） | **PASS** | 真实 GMI 流式出字（7→169→…→1849 字符）；采纳后 8 个事件、7 条全 main 链式边、pos_y 全 240 横向递增排布，toast「已生成 8 个初始事件并连线」；非空画布再点「初始化」被拦截（toast「画布已有事件…」且弹窗未打开）；截图 m10-bb-acc-04（s2） |
| 9 | AI 向后延伸（2-4 事件 + 避让 + 自动连线） | **PASS** | 基于首事件延伸生成 3 个事件：pos_y=460（锚点 y=240，同排被占自动换行避让 +220）、pos_x 均在锚点右侧；锚点→首新事件 main 边 + 链式边落库，toast「已向后延伸 3 个事件」（s2） |
| 10 | AI 分歧推演（配置 2-4 方向 → 弹窗 → 择一采纳） | **PASS** | 方向数选 2 生效（简述输入框随之变 2 个；方向 1 填简述、方向 2 留空）；采纳插入后弹「分歧推演 · …的 2 条走向」弹窗（截图 06），两卡各 3 个候选事件带「采纳此方向」；采纳「孤身远行觅机缘」→ 实增 3 事件、DB 生成 logic 边且 label=「孤身远行觅机缘」（=方向名）+ toast（s2b） |
| 11 | AI 流式出字可中止 | **PASS** | 延伸流式 171→309 字符增长后点「■ 停止」：面板离开生成态（停止按钮消失）、DB/DOM 事件数维持中止前不变（不落库）（s2） |
| 12 | 删书级联 | **PASS** | 书架真实悬停→删除→确认「确认删除」→ toast《M10-BB-验收》已删除；DB 复核 books/plot_events/plot_edges/wiki_entries 四表该 book_id 行全部为 0（s3c） |
| 13 | 重启持久化 | **PASS** | taskkill 杀 electron → `npm run dev` 重启 → 重新进入剧情画布：14 事件/13 连线数量一致、**每个节点 DOM 坐标与 DB pos_x/pos_y 逐一相符**、连线标签（含「敌情线索」「孤身远行觅机缘」）均在；截图 m10-bb-acc-08（s3b） |
| 14 | 异常路径（空标题/跨书 id） | **PASS** | ① 编辑面板清空标题保存被拦：toast「事件标题不能为空」+ 面板未关 + DB 标题未变；② 跨书构造调用（bookId=A + 他书事件 id 作 source/target 两种组合）均 `ok:false「连线两端事件必须属于同一本书」`；③ 跨书 wikiRefs 挂接 `ok:false「挂接的百科词条必须属于本书」`；④ IPC 自环 `ok:false「不能连接事件到自身」`；拒绝后无脏行落库（s1、s1b、s3） |

**代码与文档一致性抽查（白盒）**：四类连线类型 `main|logic|relation|reference`（plot.types.ts L46、plotEdges DAO、plotStyle 样式表）✓；AI 三模式 `init|extend|diverge`（PlotGenMode + usePlotAi 三套提示词编排）✓；`parent_id` 子画布预留（migration v10 可空列无 FK、DAO 恒写 null、`plot:list` 保留 parentId 过滤位）✓；IPC `plot:*`/`plot-edges:*` 各四通道全走 `wrap()` + `assertUuid` ✓；连线防自环/防同向重复（含反向）与实测文案一致 ✓；挂接词条「存在且属于本书」DAO 归属校验与实测拒绝一致 ✓。发现 1 处材料与代码不同步（问题 3）。

## 发现的问题

1. **【轻微】toast 显示期间拦截其覆盖区域的鼠标点击**：ToastHost 容器为 `pointer-events-none`，但单条 toast 实体为 `pointer-events-auto`，固定悬浮顶部中央 2.6s（错误 4s）。实测 toast「连线已创建…」矩形 (433,20)-(831,58) 恰好盖住连线编辑器标签输入框，`elementFromPoint` 返回 toast 实体，期间真实点击全部落空（diag4 探针）。用户按提示「可在上方编辑器调整类型与标签」立即操作时会被无响应 2-3 秒。建议：toast 实体改 `pointer-events-none`（提示本就无需交互），或上移/下沉避开工具栏。
2. **【轻微】UI 拖拽自环无任何反馈**：从事件右手柄拖回自身左手柄，连线未创建（防自环有效），但全程无 toast 提示（s1b 以 150ms×24 次轮询确认无提示出现）；DAO/应用层守卫文案「不能连接事件到自身」仅在 IPC 直调路径可达。疑似 Vue Flow 在 connect 事件触发前即静默丢弃同节点连接。建议给 VueFlow 传 `isValidConnection` 或在连接结束回调兜底提示。
3. **【轻微·文档】验收材料与代码不同步**：material-M10-plot-canvas.md「设计边界」写「事件标签色板 8 色哈希取色」，代码实为 **16 色**（plotStyle.ts `TAG_PALETTE`，注释标明系 M10 三轮静态审查 P3 的调整）。建议材料文档勘误，避免后续验收误判。

## 遗留与建议

1. 问题 1/2 均为轻微 UX 打磨项，可挂技术债（≤2 个里程碑内解决）；问题 3 为一行文档勘误。
2. 建议开发自测脚本补两个用例：AI 分歧「采纳插入→方向弹窗→择一采纳」完整 UI 链（本次脚手架即在此处误判 240s 超时）、以及 toast 显示期间的连击场景。
3. M10 静态审查已登记的设计决策维持现状即可：连线两端/词条归属的信任边界模型、`parent_id` 无 FK 预留列（子画布落地时 migration v11+ 补齐）。
4. 全程各脚本均断言「无 console 报错」=0 通过；`npm run typecheck` 未复跑（开发侧已声明三重闸门全绿，本代理为黑盒未测构建）。
5. 按 acceptance-workflow 双轨流程，本报告与 LLM 静态审查报告共同提交用户确认；确认后进入 tag v0.12.0 流程。
