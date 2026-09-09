# 项目交接文档（HANDOVER）

> **新会话/新模型开工第一入口**。本文件始终保持「随时可交接」状态，每次里程碑收尾后更新。
> 最后更新：2026-09-08 · 会话 38 · **M11 灵感墙完成（tag v0.16.0-m11-wall）；下一步 M12 作品风格（执行版任务卡见第 9 节）**
> 此前：M10.6/M10.7/M10.8（v0.14.0/v0.15.0）+ 0.15.0 打包验证 + 产品更名「墨笺」；docs 收尾 tag v0.15.1-m10.8-final。静态审查 `--base`：M12 起用 v0.16.0-m11-wall。

## 0. 移交摘要（新模型 60 秒读完）

- **M0-M11 全部完成并通过双轨验收**，17 个版本 tag（最新 v0.16.0-m11-wall）
- **产品已更名「墨笺」**（appId/数据目录/可执行名 InkSpire 不变）；GMI 额度耗尽（402）后 AI 档案切 TokenRhythm glm-5
- **M11 灵感墙**：五类便签卡墙（筛选/搜索/回收站）+关联词条+入画布联动（情节事件/场景场景+回链/查看/解绑）+划词存灵感+浮球拖动债清偿；migration v12；零 AI
- **下一步**：M12 作品风格（执行版任务卡见第 9 节，注入面与封面已用户拍板；可选：OpenDesign 桌面版接入 od CLI/MCP）
- git：17 tag、工作区 clean（验收文档已随收尾提交）
- 你能跑 `npm run dev` 验证环境；测试方法见第 5 节；所有坑见第 6 节（**18 条，必读**）

## 1. 项目是什么

复刻 inkspires.cn（墨灵小说，AI 网文创作工作台）为 **Windows 桌面应用**：本地 SQLite 存数据 + 用户自定义 AI API（OpenAI 兼容协议）。最终交付 NSIS 安装包。用户是编程小白，全程中文沟通，需要通俗解释。

## 2. 当前状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 脚手架+文档规范体系 | ✅ tag v0.1.0 |
| M1 | 书斋（书籍 CRUD） | ✅ tag v0.2.0 |
| M2 | 设置中心（AI Provider+API 档案） | ✅ tag v0.3.0 |
| M3 | 正文工作台（章节树+TipTap+自动保存） | ✅ tag v0.4.0 |
| M4 | AI 写作（续写/划词/整章润色） | ✅ tag v0.5.0 |
| M5 | 创世台五步+接通AI写作+用户反馈修复 | ✅ tag v0.6.0 |
| M6 | 万物百科 | ✅ tag v0.7.0 |
| M7 | 章节画布 | ✅ tag v0.8.0 |
| M7.5 | 画布连线 | ✅ tag v0.9.0 |
| M8 | 作品记忆 | ✅ tag v0.10.0 |
| M9 | 墨灵助手（浮球+聊天+流式+@召唤） | ✅ tag v0.11.0-m9-assistant |
| M10 | 剧情画布（事件+四类连线+AI 三模式+搜索高亮） | ✅ tag v0.12.0（静态四轮整改闭环+黑盒 14/14） |
| M10.5 | 跨模块联动与同步（正文→百科提取/记忆去重/剧情双向注入/各页同步入口/自动同步） | ✅ 静态四轮整改闭环（原子水位通道+白名单读写拆分）+黑盒 9/9 通过，tag v0.13.0-m10.5-sync |
| M11 | 灵感墙（五类便签+入画布联动+划词存灵感） | ✅（静态三轮+黑盒 13/13，报告 2026-09-08-M11-wall.md；tag v0.16.0-m11-wall） |
| M12-M15 | 风格/统计/拆书/Agent偏好 | ⬜（任务卡见第 9 节；下一个 M12，口径已用户拍板） |
| M16 | 重打包 | ✅ 0.15.0 已打包并覆盖安装验证（2026-09-08） |

**数据库 migration 当前版本 = 12**（books/api_profiles+settings/chapters/genesis_steps/wiki_entries/scenes/scene_edges/memories/assistant_messages/plot_events+plot_edges/inspirations；v11 为 genre+tags 旧值数据映射，v12 为灵感墙建表）。

## 3. 新会话开工 SOP（按序执行）

1. 读本文档 + `docs/worklog/worklog.md` 最后一节（最新进展与断点）
2. 读 `docs/plan/roadmap.md`（下一步的任务定义与技术债）
3. 规范：`docs/standards/coding-standards.md`（写代码前必读）
4. 环境验证：`npm run dev` 弹窗正常
5. 干活：小步 commit，**每完成一小块就 commit**
6. 里程碑完成：自测 → 双轨验收（见第 5 节）→ 用户确认 → tag → 更新 worklog/roadmap/本文档

## 4. 架构速览（详见 docs/design/architecture.md）

```
Electron(main: db/ ai/ ipc/) ←IPC(preload 白名单桥)→ Vue3 渲染层(views/components/services)
```
- 数据：better-sqlite3 v13（NAPI prebuilds 跨 ABI），库文件在 %APPDATA%/inkspire-desktop/inkspire.sqlite，migration v12
- AI：`src/main/ai/` Provider 抽象+注册表；openaiCompatible.ts（SSE 流式+429 自动重试+AbortSignal 中止）
- 注入链路：ChapterEditor.loadGenesis/loadWiki/loadMemory → caches → writingContext → systemPrompt
- UI：Tailwind 4 @theme 紫罗兰令牌（#6c5ce7），弹窗/Toast/确认框/AiWritingPanel 可复用

## 5. 验收流程（双轨，详见 docs/standards/acceptance-workflow.md）

1. 开发自测：`npm run dev -- --remote-debugging-port=9222`，node+WebSocket 连 CDP 驱动真实 Electron（参考 tmp/ 下脚本）
2. 双轨验收：
   - **静态审查**：`node scripts/accept-via-llm.mjs <材料.md> --base <tag> --model glm-5 --base-url https://tokenrhythm.studio/v1 --key-env TOKENRHYTHM_API_KEY`（GMI 已 402 勿用；输出存 docs/acceptance/llm-review-*.md）
   - **黑盒子代理**：Agent(general-purpose)，提示词含验收点+CDP 方法+自建自清纪律。**AI 用例重试≤3；代理报错超 3 次取消黑盒**
3. 任一不通过即不通过；整改后复验；用户确认 → tag
4. 验收报告、材料全部入库

## 6. 踩坑速查（19 条，新模型必读）

1. npm allow-scripts 拦截安装脚本：`npm approve-scripts <pkg>`；Electron 二进制被拦后 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`
2. TS7：`include` 不能写进 compilerOptions；`baseUrl` 已移除；.vue/.css 需 env.d.ts 声明
3. .npmrc 写 electron_mirror 会告警——不要写，用环境变量
4. better-sqlite3 13 用 NAPI prebuilds 跨 ABI，无需 rebuild；electron-builder.yml `npmRebuild: false`
5. ox-alpha 不稳定+OpenRouter 无 credits；静态审查用 GMI MiniMax M3（`--base-url --provider-name`）；diff 超 2 万字返回空，限 1.5 万
6. Vue3 v-for 字符串 ref 是数组→用函数式 ref（Map 收集）
7. TipTap 切内容不清 undo→用 `:key=章节id` 重建组件
8. mock 测试不能替代真实链路——写路径必须 selftest/CDP 实测
9. CDP 驱动：`--remote-debugging-port=9222`，`fetch /json` 找页面，原生 WebSocket + Runtime.evaluate（awaitPromise:true）
10. CSP connect-src 'self'：渲染层不能直接请求外部 API
11. **Vue reactive Proxy 无法跨 IPC**：传给 window.api.* 前 `JSON.parse(JSON.stringify(toRaw(data)))`
12. **rAF 节流**：窗口后台时冻结→用 nextTick + `backgroundThrottling: false`
13. **HMR 污染**：改编辑器/生成代码后必须完全重启 dev 再测
14. **并发锁生命周期**：chatStream 建立即 resolve，锁必须覆盖到 onDone/onError；generationSeq 防竞态
15. **漏 import 静默失败**：isElectron 必须显式 import；catch 块不要全静默
16. **提示词禁用内部流程术语**（定风/定魂等）——AI 会当故事概念写进输出
17. **Vue Flow 事件单参数载荷** `{event, node}` `{event, edge}`——不是双参数（四处踩坑）
18. **watch(immediate) TDZ**：watch immediate 引用的资源必须先声明（M8 TDZ 教训）
19. **Vue Router 同路由记录复用组件实例**：`route.params` 必须响应式取（computed）+watch 重载；静态捕获跨书导航停留旧书数据（M11 灵感墙真 bug 2a22898，M10.5 承接期 useMemorySync 同型）。另两条测试流程坑见 worklog 会话 38：TaskStop 杀不净 electron.exe（须 taskkill //F //IM）、黑盒运行期间禁改 src/（HMR 打断测试流）

## 7. 凭据与外部资源

- **GMI Cloud**（默认档案）：https://api.gmi-serving.com/v1，模型 MiniMaxAI/MiniMax-M3，key 在 ZCode 配置 provider「GMI Cloud」
- **TokenRhythm**：https://tokenrhythm.studio/v1，key 在环境变量 `TOKENRHYTHM_API_KEY`；档案「基元律动（ZCode 同款）」保留
- **OpenRouter**：key 在 ZCode 配置；模型 `stealth/ox-alpha`（不稳定）；无付费 credits
- **铁律：key 不入 git/日志/文档**

## 8. 用户协作须知

- 用户是编程小白，中文沟通，需通俗解释
- 每里程碑给「亲手验证指引」
- 用户可能切换模型：靠 HANDOVER+worklog 无缝接力
- M16 打包后应用已安装本机（`%LOCALAPPDATA%/Programs/InkSpire/`），与 dev 共享 userData

## 9. 下一步任务卡

### ~~M11 灵感墙~~（✅ 已完成 2026-09-08，tag v0.16.0-m11-wall）

交付概要：五类便签卡墙（筛选/搜索/回收站）+关联设定集词条+入画布（情节大纲事件/场景规划场景，回链/查看跳转/解绑重入）+PlotDetailPanel「来自灵感墙」来源行+划词存灵感+浮球拖动债清偿；migration v12 `inspirations`；全程零 AI。双轨：静态审查 glm-5 三轮整改闭环（成对回链双向校验/清空回收站原子化/批量词条校验/refType 白名单）+黑盒 13/13（报告 2026-09-08-M11-wall.md）；自测 47 项全过，修 1 真 bug（同路由跨书导航组件复用，踩坑 #19）。以下为原任务卡存档。

**原任务卡（存档）**——原站灵感墙=便签暂存区（五类）+关联+拖入画布；architecture.md 预留 `inspirations` 表；roadmap 验收=灵感→画布联动。技术债「剧情面板被浮球遮挡」已于第 0 步清偿。

**功能清单**：
1. 灵感墙页：五类便签卡片墙（网格流），类别筛选 tabs+关键字搜索+回收站切换
2. 便签 CRUD：新建/编辑弹窗（类别/标题/内容/关联设定集词条多选）；删除=软删入回收站；回收站可恢复/逐条彻底删除/清空
3. 关联词条：wiki_refs 多选，卡片角标显示；词条删除后显示降级不报错
4. 入画布：便签卡「入画布」→弹窗选目标（情节大纲事件 / 场景规划场景+选章节）→复用 plot:create / scenes:create 建节点（标题←便签标题，描述/摘要←便签内容）→便签回链 ref_type/ref_id+「已入画布」角标+可跳转对应画布；已入画布不可重复入、可解绑后重入
5. 画布来源行：PlotDetailPanel 增「来自灵感墙」信息行（渲染层按 ref_id join，不改表）
6. 划词存灵感：写作台划词浮条增「存为灵感」，自动带章节出处

**数据与 IPC 设计草案**：
- migration v12 单表 `inspirations(id TEXT PK, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'idea', title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', ref_type TEXT NOT NULL DEFAULT '', ref_id TEXT NOT NULL DEFAULT '', wiki_refs TEXT NOT NULL DEFAULT '[]', is_recycled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)` + `idx_inspirations_book(book_id)`（不加 pos 列：墙面=网格流非自由画布）
- `src/shared/inspiration.types.ts`：Inspiration / InspirationKind='idea'|'foreshadow'|'fragment'|'memo'|'todo'（中文标签 灵感/伏笔/片段/备忘/待办）/ Create / Update 入参
- IPC 四通道（仿 plot.ts：UUID 校验+wrap）：`inspirations:list(bookId)`（含回收站，渲染层筛）/ `create(input)` / `update(id, input)` / `remove(id)`（物理删，仅回收站内允许）；preload 增 `inspirations` 组
- 入画布不改既有通道：plot:create / scenes:create 原样复用

**入口**：写作台侧栏 pill「灵感」（档案与同步之间，title=灵感墙）；路由 `/book/:bookId/inspirations`；划词浮条「存为灵感」

**设计决策**：
- 「拖入画布」以「入画布」按钮+弹窗实现：两张画布是独立路由，HTML5 跨路由拖拽不可行，语义等价
- 灵感墙=作者主动素材区（零 AI），与 AI 维护的设定集/叙事档案分工；伏笔便签不与叙事档案「开放线索」自动互通、不入自动同步三目标（不加第四水位）
- plot_events.parent_id 预留列 **FK 不落地**：本期无子画布消费方，SQLite 加约束需重建表，零收益；列继续闲置
- ref_type/ref_id 仅作「入画布回链」（来源追踪）；关联设定集走 wiki_refs 数组（与 scenes/plot_events 同构）
- 类别色卡沿用案头纸墨主题降饱和令牌（M10.8）

**不做清单**：自由拖拽定位的墙面/便签间连线/子画布与 parent_id FK/AI 生成灵感或从便签扩写/情节「素材组合」「平行推演」生成模式/灵感墙入自动同步/移动端适配

**验收点**：
1. 五类便签新建/编辑/软删/恢复/彻底删除/清空回收站，重启持久
2. 回收站切换正确；软删便签不出现在正式墙
3. 关联词条可选可显，词条删除后卡片不报错
4. 入画布→情节大纲：节点创建成功、内容/落位正确、便签回链+角标+跳转
5. 入画布→场景规划（选章节）：同上
6. 已入画布便签禁重复入；解绑后可重入
7. 划词存灵感：墙上出现便签且出处章节正确
8. PlotDetailPanel 显示「来自灵感墙」来源行
9. 删书级联清理 inspirations；全程零 AI 调用

**tag 号**：v0.16.0-m11-wall。**依赖**：无上游（可立即开工）；第 0 步顺带清偿浮球遮挡债（浮球可拖动+位置记忆）。

---

### M12 作品风格（风格包）（下一个，执行版——口径已经用户确认 2026-09-08）

**背景（代码事实已探明）**：风格现状唯一持久化=构思台基调步 step1 JSON（genesis_steps 表，`{styleId, styleName}`），唯一消费=写作管线 systemPrompt（ChapterEditor 预解析 `getPresetStyle(styleId).promptHint` 存 genesisCache）+构思台 step2/3 提示词（genesisPrompts）；**场景规划「按场景生成正文」（buildSceneProseMessages）与剧情事件链/场景节点生成均不注入风格**；books 表无风格字段（updateBook 为全列覆写，扩列需同步 DAO/类型/IPC 三层）；预设 5 包为常量（presetStyles.ts，PresetStyle= id/name/description/sample/promptHint）；封面 cover 字段 DB/类型/DAO 已端到端存在但 UI 未用（BookCard 走书名 hash 渐变占位），主进程无任何文件/对话框 IPC（全目录 grep 零命中），CSP img-src 允许 data: 不允许 file://。**M14 拆书产出的风格包落本表（M14 依赖本卡）**。

**用户已拍板决策**：①注入面=写作管线（续写/划词/整章润色，现状已有）+「按场景生成正文」（本次补齐）；剧情事件链/场景节点生成**不注入**（结构规划与文风无关）；②封面上传纳入本里程碑（清偿 roadmap 技术债「封面自定义上传」）；③优先级=书绑定包>基调步预设>无；④预设 5 包保持常量不入库，style_profiles 只存用户包（source_type 'manual'，'digest' 留 M14）；⑤风格包全局库，books 侧绑定（一书一包）。

**步骤分解**（SOP：小步提交，每步 typecheck 三重闸门；dev 起停注意踩坑 #19 附注 electron.exe 残留）：
1. **数据层**：migration v13——`style_profiles(id PK, name, tone 文笔调性, rules TEXT JSON 数组, word_target_min/max INTEGER, sample, source_type DEFAULT 'manual', created_at, updated_at)` + **`ALTER TABLE books ADD COLUMN style_profile_id TEXT REFERENCES style_profiles(id) ON DELETE SET NULL`**（项目首个 ALTER 先例；SQLite ADD COLUMN 带 REFERENCES 合法，存量行默认 NULL）；`src/shared/style.types.ts`；Book/CreateBookInput/UpdateBookInput 增 styleProfileId；books DAO/types/ipc 同步扩列；styles DAO+IPC 四通道（styles:list/create/update/remove，UUID+wrap 仿 inspirations）；preload 增 styles 组
2. **管理分区**：SettingsView 增「风格包」section——为守单文件 ≤400 行规，抽 `components/settings/StylePackagesSection.vue`（列表卡+来源徽标）+`StyleProfileDialog.vue`（名称/调性/规则条目增删行/单章字数区间/样例；删除确认提示「已绑定的书将自动解绑」）
3. **书绑定**：BookCard 增「风格」绑定（小弹窗：不绑定/用户包下拉；卡片显示绑定包名徽标）；构思台基调步列表=用户包（标「我的」）+预设（标「预设」）——选预设照旧写 step1，选用户包写 books.style_profile_id（两处存储，解析时书绑定胜）
4. **注入改造**：抽 `services/styleContext.ts` 纯函数（effectiveStyle：书绑定包→多行 hint「目标文风：{tone}｜叙事规则逐条｜单章字数约 min-max 字（软目标）」；预设→promptHint 原样；皆无→undefined）；ChapterEditor（写作管线）与 CanvasView 场景正文并行加载书+styles 解析接入；buildSceneProseMessages 增风格块；buildSceneGenMessages 不动
5. **封面上传**：IPC `books:set-cover(bookId)`（dialog.showOpenDialog 图片过滤→copy 到 userData/covers/<uuid>.<ext>→books:update 落文件名）+`books:read-cover(filename)`（读文件回 data URL，合 CSP img-src data:）；BookCard 有 cover 经 composable 异步渲染 data URL，无则维持 hash 渐变；卡片工具「换封面/移除封面」
6. **开发自测** tmp/m12-*.mjs（CDP 自建自清，AI 真调用 ≤2 次）：CRUD/绑定/优先级三档/删包 SET NULL 回落/封面 data URL 渲染+移除回退/重启持久/删书级联/console 零报错
7. **双轨验收**：材料 `docs/acceptance/material-M12-style.md` → 静态审查 `--base v0.16.0-m11-wall --model glm-5 --base-url https://tokenrhythm.studio/v1 --key-env TOKENRHYTHM_API_KEY`（GMI 402 勿用）→ 整改轮 → 黑盒子代理（AI 用例重试≤3、脚手架报错超 3 取消）→ 报告入库
8. **交付亲手验证指引 → 用户确认 → tag v0.17.0-m12-style** → worklog 会话 39/roadmap/HANDOVER 收尾

**验收点**：1) 风格包 CRUD+重启持久；2) 绑定后续写 systemPrompt 含调性/规则/字数目标且压过预设；3) 仅基调预设时维持现状注入；4) 皆无则无风格块；5) 删包→书绑定自动解绑（FK SET NULL）+注入回落+UI 无残留；6) 基调步可选用户包；7) 场景正文注入、节点生成不注入；8) 封面上传显示/移除回渐变/重启持久；9) 删书无孤儿+console 零报错+AI≤2 次。

**不做清单**：风格包导入导出/按章节切换风格/AI 生成风格包与拆书（归 M14）/段落级风格重写/封面裁剪编辑器/剧情与节点生成注入文风/删书时清理 covers 物理文件（无害小文件，登记已知边界）。

**依赖**：无上游（可立即开工）；**被 M14 依赖**（拆书产出落本表）。**tag 号**：v0.17.0-m12-style。

---

### M13 创作统计

**背景**：chapters.word_count 只有当前值（前端逐章求和得总字数），无历史序列，热力图/趋势/里程碑无从谈起。**快照自上线日起积累——本卡宜早交付**。

**功能清单**：统计页：按日字数热力图（近 12 月格子）/近 30 天趋势折线/累计字数+总字数目标进度条（目标可设）/里程碑自动打点（首章完稿、1 万/10 万字等）；保存章节时上报当日快照。

**数据与 IPC 设计草案**：migration 建 `word_count_snapshots(book_id TEXT, day TEXT 'YYYY-MM-DD', words INTEGER 当日末字数, delta INTEGER 当日新增, updated_at, PRIMARY KEY(book_id, day))`；IPC：`stats:snapshot(bookId, day, words)` upsert（**delta 由主进程对比当日已存值计算**防竞态）+ `stats:list(bookId)` 返回快照序列；ChapterEditor 保存成功后调用。

**入口**：写作台侧栏 pill「统计」（灵感墙旁）；路由 `/book/:bookId/stats`。

**设计决策**：渲染层只报当前字数，增量主进程算；未打开应用的天无快照（如实空白，不补数据）；零 AI。

**不做清单**：历史回填/按章节粒度图表/写作时长统计/导出报表/跨书聚合页

**验收点**：编辑保存后热力图当日格子更新；重启后快照在；跨天保存两条记录且增量正确；目标进度与里程碑打点准确。**依赖**：无。**tag 号**：v0.18.0-m13-stats。

---

### M14 拆书

**背景**：用户上传参考文本，AI 拆解出可复用的风格包（供 M12 表消费）；refs/landing_book-analysis-material-library.webp 为原站参考；presetStyles.ts 注释「M14 后换真实风格包」由此兑现。

**功能清单**：导入 txt（UTF-8，超长截取前 2 万字）→AI 拆解（调性总结/叙事规则条目/样例句段）→SyncCandidateDialog 勾选→落风格包（source_type='digest'）；入口挂 M12 风格包管理页「从参考文本拆解」。

**数据与 IPC 设计草案**：零新表零新通道——产出直写 M12 的 styles:create；AI 走 ai:chat-stream+lenientParse（复用提取范式：严格 JSON+宽容解析+白名单过滤+长度钳制）。

**入口**：设置中心风格包管理页按钮。

**设计决策**：参考文本不落库不持久（隐私：拆完即弃，仅内存传递）；一次拆解一个包；只拆文风不拆情节结构/人物（那是设定集的事）。

**不做清单**：epub/pdf/mobi 格式/整本书无截取拆解/素材库（原站概念）/批量拆解/拆情节大纲

**验收点**：导入参考 txt→AI 拆解→勾选→风格包生成且来源=拆书；该包绑定新书后生成正文风格可感知；未选任何候选不落库。**依赖**：**M12 的 style_profiles 表与管理页必须先落地**。**tag 号**：v0.19.0-m14-digest。

---

### M15 Agent 模型偏好（功能槽位）

**背景**：architecture.md ModelBinding 设计（功能槽位绑定档案，未绑定回落默认）；现状 resolveProfile 两处（aiWriting.ts / AssistantDock.vue）固定读默认档案；原站「23 个 Agent」收敛为功能域槽位。

**功能清单**：定义 8 个槽位：正文写作（续写/整章润色）/划词改写/构思台/情节大纲 AI/场景规划 AI/提取同步（设定集+叙事档案+情节三目标）/助手聊天/拆书；设置中心「功能槽位」分区：每槽位下拉（跟随默认/各档案）；调用时按槽位解析档案。

**数据与 IPC 设计草案**：migration 建 `agent_bindings(slot TEXT PRIMARY KEY, profile_id TEXT NOT NULL)`；IPC：`bindings:list` + `bindings:set(slot, profileId|'')`；渲染层抽 `resolveProfileForSlot(slot)` 收敛两处 resolveProfile；槽位常量入 src/shared/agent.types.ts。

**入口**：设置中心新分区。

**设计决策**：槽位=功能域非 Agent 实体（不建 23 行）；「跟随默认」=表内无行（删绑定即回落）；删除档案级联清绑定（deleteProfile 增清理）；params/温度跟档案走，不做槽位级覆盖。

**不做清单**：23 Agent 实体与自定义提示词/槽位级温度覆盖/按书绑定（全局槽位）

**验收点**：两档案不同模型时，情节大纲 AI 与助手各走各的档案（抓请求模型名验证）；未绑定槽位回落默认；删除档案后对应槽位回落默认不报错。**依赖**：无硬依赖，建议最后做（覆盖全部 AI 功能面，回归面最大）。**tag 号**：v0.20.0-m15-bindings。

---

**技术债**：见 roadmap 技术债登记区（浮球遮挡由 M11 第 0 步清偿；settings 白名单收紧/封面自定义/书籍卡片删除键可达性等仍挂账）。

## 10. 快速命令

```bash
npm run dev                                        # 开发
npm run dev -- --remote-debugging-port=9222        # CDP 自动化
npm run typecheck                                  # 三重闸门（tsc×2+build）
node scripts/accept-via-llm.mjs <材料.md> --base v0.16.0-m11-wall --model glm-5 --base-url https://tokenrhythm.studio/v1 --key-env TOKENRHYTHM_API_KEY
npm run dist                                       # 打包 NSIS
```
