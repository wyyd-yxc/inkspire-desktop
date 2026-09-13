# 项目交接文档（HANDOVER）

> **新会话/新模型开工第一入口**。本文件始终保持「随时可交接」状态，每次里程碑收尾后更新。
> 最后更新：2026-09-13 · 会话 43 · **M0-M16 全部完成，项目发布收官（23 个版本 tag：最新 v0.21.0-m16-release；0.21.0 安装包已覆盖安装验证）**
> 此前：M15.5/M15（v0.20.1/v0.20.0）已收尾。静态审查 `--base`：后续维护期涉码改动用 v0.21.0-m16-release。

## 0. 移交摘要（新模型 60 秒读完）

- **M0-M16 全部完成并通过双轨验收**，23 个版本 tag（最新 v0.21.0-m16-release）
- **产品已更名「墨笺」**（appId/数据目录/可执行名 InkSpire 不变）；GMI 额度耗尽（402）后 AI 档案切 TokenRhythm；glm-5 被下线后静态审查模型换 **glm-5.1**
- **M14 拆书**：styles:create 扩 digest 来源+digest:pick-text 只读通道+StyleDigestDialog 四态流（导入→流式拆解可停止→勾选→落库）；参考文本不落库不持久（字节级实证）；黑盒真实 AI 风格感知 4/4 实证
- **M15 Agent 模型偏好**：migration v15 agent_bindings（FK CASCADE 级联清绑定）；agentSlots.resolveProfileForSlot 收敛全项目档案解析（generateWriting 必传槽位参数，14 调用点归槽）；设置「功能槽位」分区 8 行即改即存
- **M15.5 UI 布局重规划**：全局书内导航壳（嵌套路由+章节树/同步栈上移+助手浮球书内全局）+七页去旧返回栏+**UI 技术债六项清偿**+切章保存重构（归属章绑定）；静态四轮+黑盒 37/37 无缺陷
- **M16 发布打包**：0.21.0（Setup-0.21.0.exe）覆盖安装 0.15.0→0.21.0 成功+安装版冒烟 6/6（数据保留/migration/新壳）
- **下一步**：无（发布收官）。维护期参考：roadmap 技术债登记区留档项（.vue 类型检查接入、settings 白名单收紧等）；`npm run dist` 可随时重出包
- git：23 tag、工作区 clean（验收文档已随收尾提交）
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
| M12 | 作品风格（风格包+绑定+优先级注入+封面） | ✅（静态两轮+黑盒 10/10，报告 2026-09-09-M12-style.md；tag v0.17.0-m12-style） |
| M13 | 创作统计（字数快照+目标+趋势+热力+里程碑） | ✅（静态两轮+黑盒 10/10，报告 2026-09-10-M13-stats.md；tag v0.18.0-m13-stats） |
| M14 | 拆书（txt→AI 拆解→风格包 digest） | ✅（静态五轮收敛+黑盒 6/6 含真实 AI 风格感知 4/4，报告 2026-09-12-M14-digest.md；tag v0.19.0-m14-digest） |
| M15 | Agent 模型偏好（8 功能槽位绑定档案） | ✅（静态七轮收敛+黑盒 6/6 无缺陷含真实 Provider 抽查，报告 2026-09-12-M15-bindings.md；tag v0.20.0-m15-bindings） |
| M15.5 | UI 布局重规划（全局书内导航壳+UI 债清偿） | ✅（静态四轮收敛+黑盒 37/37 无缺陷零真实 AI，报告 2026-09-13-M15.5-relayout.md；tag v0.20.1-m15.5-relayout） |
| M16 | 发布版重打包 | ✅（0.21.0 覆盖安装+冒烟 6/6，记录 2026-09-13-M16-release.md；tag v0.21.0-m16-release） |
| M16 | 重打包 | ✅ 0.15.0 已打包并覆盖安装验证（2026-09-08） |

**数据库 migration 当前版本 = 15**（…style_profiles+books.style_profile_id/word_count_snapshots+books.word_target/agent_bindings；v15 功能槽位绑定档案）。

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
- 数据：better-sqlite3 v13（NAPI prebuilds 跨 ABI），库文件在 %APPDATA%/inkspire-desktop/inkspire.sqlite，migration v14
- AI：`src/main/ai/` Provider 抽象+注册表；openaiCompatible.ts（SSE 流式+429 自动重试+AbortSignal 中止）
- 注入链路：ChapterEditor.loadGenesis/loadWiki/loadMemory → caches → writingContext → systemPrompt
- UI：Tailwind 4 @theme 紫罗兰令牌（#6c5ce7），弹窗/Toast/确认框/AiWritingPanel 可复用

## 5. 验收流程（双轨，详见 docs/standards/acceptance-workflow.md）

1. 开发自测：`npm run dev -- --remote-debugging-port=9222`，node+WebSocket 连 CDP 驱动真实 Electron（参考 tmp/ 下脚本）
2. 双轨验收：
   - **静态审查**：`node scripts/accept-via-llm.mjs <材料.md> --base <tag> --model glm-5.1 --base-url https://tokenrhythm.studio/v1 --key-env TOKENRHYTHM_API_KEY`（GMI 已 402 勿用；glm-5 已被下线勿用；输出存 docs/acceptance/llm-review-*.md）
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

### ~~M12 作品风格（风格包）~~（✅ 已完成 2026-09-09，tag v0.17.0-m12-style）

交付概要：风格包管理（设置分区，规则条目/字数区间）+ 书绑定（BookCard+基调步双列表）+ 优先级注入（书绑定包>基调预设>无；写作管线+场景正文，节点/剧情不注入）+ 封面上传（债清偿）；migration v13（首个 ALTER TABLE）；删包 SET NULL 自动解绑。双轨：静态两轮收敛+黑盒 10/10（**真实 AI 风格特征 100% 达标**，报告 2026-09-09-M12-style.md）；自测 37 项断言（本地假 OpenAI 服务器实证注入三态，外部额度 0）。黑盒缺陷#2 已修，#1/#3 登记技术债。以下为原执行卡存档。

**原执行卡（存档）**——口径已经用户确认 2026-09-08。

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

### ~~M13 创作统计~~（✅ 已完成 2026-09-11，tag v0.18.0-m13-stats）

交付概要：migration v14（word_count_snapshots：PK(book_id,day)+base_total/last_total/updated_at FK CASCADE；books ADD word_target）；快照上报内嵌主进程——chapters:update（wordCount 传入时）与 chapters:delete（静态整改补挂）双挂钩同库 recordWordSnapshot（事务 SUM→建基线/覆盖末值→同值跳过），覆盖一切写入点、渲染层零改动；stats:list 只读通道。统计页 /book/:bookId/stats（StatsView+statsCalc 纯函数）：今日净增/总字数+目标进度条内联编辑/近 30 天 SVG 趋势/近 12 月纯 CSS 热力图（heat-0..4 令牌）/里程碑阶梯（首次创作/首章完稿/1万~100万字，从快照序列推导不落库）；侧栏「统计」pill（顶栏两行布局）。全程零 AI。双轨：静态审查 glm-5 下线换 glm-5.1，两轮有条件通过整改闭环（r1 严重项 chapters:delete 漏挂快照已修；r2 同值跳过+delta 语义修正）+黑盒 10/10（报告 2026-09-10-M13-stats.md，外部 AI 消耗 0）；自测 T1 21/21 修 1 真 bug（saveTarget .trim() 抛错）；黑盒两缺陷修复（侧栏 pill 溢出遮挡/首章完稿 UTC 口径）。toast DOM 残留观察项已登记技术债。以下为原执行卡存档。

**原执行卡（存档）**——探索实证已固化 2026-09-09。

**背景（代码事实已探明）**：chapters.word_count 由调用方计算传入（DAO 透传）；全书字数=渲染层逐章求和（WorkspaceView.totalWords）；**一切改字数的落盘全部经主进程 chapters:update**（防抖自动保存唯一汇聚点 flushSave、CanvasView AI 采纳、useReverseSync 反向替换均传 wordCount；renameChapter 不传→不触发）；无任何历史字数快照（自 M13 起积累——宜早交付）；无图表库且零 canvas 先例（热力图=纯 CSS grid，趋势=内联 SVG polyline）；books 表已有 v13 ALTER 先例；settings 双白名单（水位键只读）——**每书字数目标不入 settings**，走 books 加列；mergeWatermarkChapter 主进程事务读改写为可参照范式。

**设计决策（经探索修正原卡两处）**：
1. **快照上报内嵌主进程**（替代原卡独立 stats:snapshot 通道）：chapters:update handler 内当 `input.wordCount !== undefined` 时，UPDATE 成功后同库执行 `recordWordSnapshot(bookId, SUM(word_count))`——覆盖一切写入点含未来新增，渲染层零改动，天然防漏报；仅保留 `stats:list(bookId)` 查询通道
2. 快照语义（防竞态，事务参照水位范式）：表 PK(book_id, day)，列 base_total（当日首报全书总量）/last_total/updated_at；当日 delta=last_total−base_total（可负=净删，如实展示）；day=本地时区 YYYY-MM-DD
3. 字数目标：migration v14 `ALTER TABLE books ADD COLUMN word_target INTEGER`（v13 同款）+ Book/UpdateBookInput 扩 wordTarget；统计页内编辑
4. 里程碑查询时从快照序列推导不落库：首次创作日/1万/5万/10万/20万/50万/100万字（首次 last_total≥阈值之日）+首章完稿（有 wordCount>0 的章节）
5. 视觉：热力图近 12 月 GitHub 式 7×N 格（纯 CSS，墨系 5 档渐进新 @theme 令牌）+趋势近 30 天内联 SVG polyline；零 AI

**步骤分解**（SOP 小步提交+typecheck 三重闸门；双轨并行期间禁碰 dev 进程——会话 39 自察纪律）：
1. 数据层：migration v14（word_count_snapshots(book_id FK CASCADE, day, base_total, last_total, updated_at, PK(book_id,day)) + books ADD word_target）+ shared/stats.types + DAO stats.ts（recordWordSnapshot 事务+listSnapshots）+ chapters DAO 挂钩（wordCount 传入时）+ IPC stats:list + preload
2. 统计页：路由 /book/:bookId/stats + StatsView.vue（InspirationsWallView 骨架）：今日净增/总字数+目标进度条（可编辑）/近 30 天趋势 SVG/近 12 月热力图（月标签+档位图例）/里程碑列表（达成✓+日期，未达成+差距字数）
3. 侧栏 pill「统计」（灵感与同步之间）
4. 自测 tmp/m13-*.mjs（零 AI 零外部额度）：migration 断言/真实编辑→快照 delta/同日多次保存 upsert/跨天直插历史行验证统计计算（热力图格数/趋势/里程碑达成日）/目标编辑/重启持久/删书级联/console 零报错
5. 双轨：材料 material-M13-stats.md → 静态 `--base v0.17.0-m12-style --model glm-5 --base-url https://tokenrhythm.studio/v1 --key-env TOKENRHYTHM_API_KEY`（GMI 402 勿用）→ 整改轮 → 黑盒（零 AI 用例，脚手架超 3 取消）
6. 交付亲手验证指引 → 用户确认 → tag v0.18.0-m13-stats → 收尾

**验收点**：1) 保存后快照 upsert（多次保存 delta 正确，AI 采纳/反向替换同入账）；2) 统计页总字数/今日净增/目标进度+编辑持久；3) 热力图近 12 月渲染（档位/空白灰格）；4) 近 30 天趋势；5) 里程碑达成日正确（插造历史验证）；6) 重启持久；7) 删书级联清快照；8) 零 AI/零额度/console 零报错。

**不做清单**：写作时长/streak 连续天数/按章粒度图表/跨书聚合页/历史回填（上线前写作量不补录，如实空白）/导出报表/周目标。

**已知边界**：删章当日 delta 可为负（如实净变化）；跨午夜首报重新基线；目标空=不显示进度条。

**依赖**：无上游。**tag 号**：v0.18.0-m13-stats。

---

### ~~M14 拆书~~（✅ 已完成 2026-09-12，tag v0.19.0-m14-digest）

交付概要：styles:create 扩 sourceType（DAO 白名单缺省 manual）；digest:pick-text 只读通道（txt→UTF-8 去 BOM→截前 2 万字，取消 null，>10MB 拒——执行卡实证修正「零新通道」）；digestPrompts 拆解服务（文风分析师+严格 JSON+lenientParse+渲染层清洗与 DAO 双保险）；resolveProfile 导出复用；StyleDigestDialog 四态流（导入→流式拆解可停止（代次号防竞态）→SyncCandidateDialog 勾选互斥渲染→落库「拆书」徽标）；参考文本不落库不持久（DB+WAL 字节级实证）。双轨：静态 glm-5.1 五轮收敛——r1 采纳 running 态提前、r2 **竞态真修**（建流后代次号校验防停止漏 abort+catch 不覆盖停止状态+关闭清空拆解产物），余项裁定留档（附录 A1-A5）+黑盒 6/6（报告 2026-09-12-M14-digest.md；真实 AI 4/4 次；**风格感知 4/4：拆书包绑定续写 617 字命中第一人称/句长中位 13 字/无感叹号/意象群**）；自测 T1 15/15+T2 19/19+T3 4/4（win32 消息级驱动原生对话框范式沉淀）。2 条低危 UX 观察登记技术债。以下为原执行卡存档。

**原执行卡（存档）**——探索实证已固化 2026-09-11。

**背景（代码事实已探明）**：M12 的 style_profiles 表与管理页已落地，digest 预留齐备——DAO VALID_SOURCE_TYPES 已含 'digest'（styles.ts L19）、StylePackagesSection 来源徽标已支持「拆书」（L99-100）、database.ts 表注释已预留、presetStyles.ts L3 注释「M14 后换真实风格包」由此兑现。**三处与原卡草案的偏差已实证**：①**createStyleProfile 硬编码 source_type='manual'**（styles.ts L111）——CreateStyleProfileInput 需扩可选 sourceType，DAO 白名单校验默认 manual（不影响 M12 既有调用方）；②渲染层受 CSP connect-src 'self' 限制**无法读本地文件**，导入 txt 必须走主进程——原卡「零新通道」修正为「+1 个只读通道 digest:pick-text」（仿 covers.ts 范式：dialog.showOpenDialog 过滤 txt→readFile UTF-8→截前 2 万字→返回 {fileName, text}；取消返回 null；>10MB 拒绝）；③resolveProfile 是 aiWriting.ts L206 私有函数，需导出供拆书复用（M15 将统一收敛为槽位解析）。可复用件：SyncCandidateDialog（五处先例；SyncCandidateItem=key/title/detail/source/tag/tagColor/checked/disabled）、lenientParse（services/jsonRepair.ts：严格 parse 失败走状态机修复重试）、chatStream（会话句柄含 abort() 可停止）。refs/landing_book-analysis-material-library.webp 为原站参考。

**功能清单**：设置中心风格包分区「从参考文本拆解」按钮 → StyleDigestDialog（components/settings/，守单文件 ≤400 行规）四态流——①**导入**：digest:pick-text 选 txt（显示文件名+字数；超 2 万字提示已截取开头；取消则停在导入态）；②**AI 拆解**：resolveProfile 默认档案+chatStream 流式（新 services/digestPrompts.ts：system 提示词约定输出严格 JSON `{"name","tone","rules":[],"sample"}`；拆解中可停止）；③**解析清洗**：lenientParse+渲染层白名单清洗（name trim 非空≤30 字/tone≤100 字/rules 逐条 trim≤100 字限 20 条/sample≤200 字，与 DAO sanitizeRules 同口径双保险）——失败报错可重试，不落库；④**勾选落库**：SyncCandidateDialog 展示候选（调性 1 项+规则 N 项+样例 1 项，默认全勾，全不勾确认禁用）→勾选项组装 styles:create(sourceType='digest')→列表刷新出「拆书」徽标→关闭弹窗丢弃参考文本。

**数据与 IPC 设计**：零新表零迁移；+1 只读通道 digest:pick-text（主进程 ipc/digest.ts，无副作用不落盘）；落库复用 styles:create（仅扩 sourceType 入参）；AI 复用 ai:chat-stream（零新 AI 通道）；preload 增 digest 组（仅 pickText）。

**入口**：设置中心风格包管理页头部（「+ 新建风格包」旁）。

**设计决策**：参考文本不落库不持久（隐私：拆完即弃，仅内存传递，弹窗关闭/取消即丢）；一次拆解一个包；只拆文风不拆情节结构/人物（那是设定集的事）；digest 包与 manual 包同池参与书绑定与注入（styleContext 不区分来源）；GBK 不自动检测（仅 UTF-8，UI 注明，乱码由用户转码）。

**不做清单**：epub/pdf/mobi 格式/整本书无截取拆解/素材库（原站概念）/批量拆解/拆情节大纲/编码自动检测/拆解历史记录。

**验收点**：1) 导入参考 txt→AI 拆解→勾选→风格包生成且来源徽标=拆书（source_type='digest' 落库）；2) 该包绑定新书后生成正文风格可感知（真实 AI 特征断言）；3) 全不勾确认禁用/取消/拆解失败均不落库；参考文本重启后无任何残留；4) 超 2 万字截断生效（只取开头）；5) 删 digest 包走既有解绑链路（FK SET NULL 回落）；6) typecheck 三重闸门+console 零报错；AI 用例重试≤3。

**已知边界**：GBK txt 乱码由用户转码；JSON 解析失败可重试；2 万字只取开头不智能选段。

**依赖**：M12 已满足（可立即开工）。**tag 号**：v0.19.0-m14-digest。

---

### ~~M15 Agent 模型偏好~~（✅ 已完成 2026-09-12，tag v0.20.0-m15-bindings）

交付概要：migration v15 agent_bindings（slot PK+FK ON DELETE CASCADE 删档案级联清绑定，无需改 deleteProfile）；shared/agent.types.ts（8 槽位/标签/覆盖说明）；bindings DAO/IPC/preload（''=删行回落、白名单校验、list 回退守卫）；agentSlots.resolveProfileForSlot 收敛全项目档案解析——generateWriting 必传 slot 参数编译期强制 14 调用点归槽（ChapterEditor 按 KIND_SLOT Record 穷尽映射分流划词/正文写作），AssistantDock 本地副本删除、拆书走 digest 槽，连通测试显式档案不经槽位；设置「功能槽位」分区 8 行下拉即改即存（默认档案说明三态诚实标注）。双轨：静态 glm-5.1 七轮收敛（真修 5 处：保存禁用一致性/KIND_SLOT 穷尽映射/零档案空态/失败回拉重置/三态标注+toBinding 守卫；附录 A1-A7+B/B2 含调用点真实 diff）+黑盒 6/6 无缺陷（报告 2026-09-12-M15-bindings.md；真实 AI 1/2 次助手槽绑真实档案出文抽查；UI 绑定→路由→级联→回落全链路实证）；自测 T1 19/19（假服务器双档案 model 路由断言，零外部 AI）。以下为原执行卡存档。

**原执行卡（存档）**——调用点映射已全量实证 2026-09-12。

---

### M16 发布版重打包（建议，待用户确认启动）

**背景**：M11-M15 五个里程碑（灵感墙/风格包/统计/拆书/槽位偏好）已交付但安装包仍为 0.15.0（M10.8 时代）。M16 目标：打一个包含全部功能的发布版安装包。

**草案步骤**：1) `npm run version`（electron-builder.yml 或 package.json 版本号定 v0.21.0 或按用户口径）；2) `npm run dist` 出 NSIS 安装包；3) 覆盖安装验证（migration v11→v15 升级链路+数据保留+新功能冒烟：灵感墙/风格包/统计页/拆书/功能槽位分区）；4) 黑盒安装验证；5) tag + 收尾。

**验收点**：全新/覆盖两种安装路径可用；旧数据无损升级（migration 链路）；新功能入口齐全；console 零报错。

**依赖**：无（M15 tag 打后即可开工）。**tag 号**：待定（v0.21.0 或沿用 m16-slug 惯例与用户确认）。

**背景（代码事实已探明）**：architecture.md ModelBinding 设计（功能槽位绑定档案，未绑定回落默认）；原站「23 个 Agent」收敛为功能域槽位。全项目 chatStream 调用点 18 处，档案解析仅 3 处：①`aiWriting.ts:206` resolveProfile（规范版，经 generateWriting 被 14 处使用）；②`AssistantDock.vue:221-231` 本地副本（唯一真重复，缺 isElectron 守卫）；③主进程 resolveConnection（仅按 profileId 取档，回落全在渲染层）。SettingsView.quickTest 与 ApiProfileDialog.test 显式传被测档案（连通测试语义），**不纳入槽位**。

**槽位→调用点映射（18 处全覆盖）**：
| 槽位 | 调用点 |
|---|---|
| writing 正文写作 | ChapterEditor.vue:359 runGeneration 的 continue/chapter-polish；CanvasView.vue:586 按场景生成正文（沿 M12 注入口径） |
| selection 划词改写 | 同一 runGeneration 的 polish/expand/rewrite（按 kind 分流） |
| genesis 构思台 | GenesisView.vue:192、:255 |
| plot 情节大纲 | usePlotAi.ts:176 |
| scene 场景规划 | CanvasView.vue:448 四模式 |
| extract 提取同步 | useWikiSync:103/useMemorySync:101,:304/usePlotSync:82/useReverseSync:115/useAutoSync:392（静默档同槽）/useWikiCleanup:112/WikiView.vue:296 词条生成（按域归入） |
| assistant 助手聊天 | AssistantDock.vue:183 |
| digest 拆书 | StyleDigestDialog.vue:77 |

**功能清单**：定义 8 个槽位：正文写作（续写/整章润色）/划词改写/构思台/情节大纲 AI/场景规划 AI/提取同步（设定集+叙事档案+情节三目标）/助手聊天/拆书；设置中心「功能槽位」分区：每槽位下拉（跟随默认/各档案）；调用时按槽位解析档案。

**数据与 IPC 设计草案**：migration v15 建 `agent_bindings(slot TEXT PRIMARY KEY, profile_id TEXT NOT NULL)`；IPC：`bindings:list` + `bindings:set(slot, profileId|'')`（槽位常量入 src/shared/agent.types.ts）；渲染层抽 `services/agentSlots.ts`：`resolveProfileForSlot(slot)` 收敛三处解析（未绑定槽位走原 resolveProfile 逻辑）；preload 增 bindings 组。

**入口**：设置中心新分区（风格包分区附近）。

**设计决策**：槽位=功能域非 Agent 实体（不建 23 行）；「跟随默认」=表内无行（bindings:set 传空串即删行回落）；删除档案级联清绑定（deleteProfile 增清理，仿 FK SET NULL 语义手动实现或 FK+ON DELETE CASCADE）；params/温度跟档案走，不做槽位级覆盖；拆书槽位=M14 的 resolveProfile 调用点改造。

**不做清单**：23 Agent 实体与自定义提示词/槽位级温度覆盖/按书绑定（全局槽位）

**步骤分解**（SOP 小步提交+typecheck 三重闸门；双轨并行期间禁碰 dev 进程）：
0. 本卡映射表已固化（2026-09-12 探索实证）
1. 数据层：migration v15（`agent_bindings(slot TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES api_profiles(id) ON DELETE CASCADE)`——删档案级联靠 FK（foreign_keys=ON 已设），**无需改 deleteProfile**）+ shared/agent.types.ts（8 槽位常量+中文标签）+ DAO bindings.ts（list/set：slot 白名单、''=删行回落、非空先验档案存在 INSERT OR REPLACE）+ IPC 两通道（slot 白名单+UUID-or-空校验）+ preload
2. 收敛：新建 services/agentSlots.ts resolveProfileForSlot（绑定命中→用之；否则原「默认→第一→报错」回落）+ generateWriting 增**必传** slot 参数（typecheck 强制 14 调用点显式归槽）+ 删旧 resolveProfile 导出 + AssistantDock 删本地副本 + StyleDigestDialog 改 digest 槽
3. 设置分区：SlotBindingsSection.vue（8 行下拉：跟随默认/各档案，即改即存，显示当前默认档案名）
4. 自测 tmp/m15-*.mjs（本地假服务器双档案不同 model，抓请求 model 字段断言路由；零真实 AI）：未绑定回落/五槽位绑定生效（writing/plot/assistant/digest/extract）/''删绑定回落/删档案级联回落/分区 UI 即改即存/reload 持久/console 零报错
5. 双轨：材料 material-M15-bindings.md → 静态 `--base v0.19.0-m14-digest --model glm-5.1` → 黑盒（真实 UI 分区交互+绑定后出文正常+真实 AI 抽查≤2）
6. 交付亲手验证指引 → 用户确认 → tag v0.20.0-m15-bindings → 收尾

**验收点**：两档案不同模型时，情节大纲 AI 与助手各走各的档案（抓请求模型名验证）；未绑定槽位回落默认；删除档案后对应槽位回落默认不报错；typecheck+console 零报错+零真实 AI 消耗。

**依赖**：无硬上游（M14 已交付使拆书槽位可直接纳入）。**tag 号**：v0.20.0-m15-bindings。

---

**技术债**：见 roadmap 技术债登记区（浮球遮挡由 M11 第 0 步清偿；settings 白名单收紧/封面自定义/书籍卡片删除键可达性等仍挂账）。

## 10. 快速命令

```bash
npm run dev                                        # 开发
npm run dev -- --remote-debugging-port=9222        # CDP 自动化
npm run typecheck                                  # 三重闸门（tsc×2+build）
node scripts/accept-via-llm.mjs <材料.md> --base v0.20.0-m15-bindings --model glm-5.1 --base-url https://tokenrhythm.studio/v1 --key-env TOKENRHYTHM_API_KEY
npm run dist                                       # 打包 NSIS
```
