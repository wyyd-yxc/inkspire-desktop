# 工作日志（Worklog）

> 新会话开工前先读本文最新一节 + roadmap。按 documentation-standards.md 的模板追加，只增不删。

---

## [2026-08-22 11:00] 会话 1：项目立项与 M0 地基

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. 调研 inkspires.cn 官网 + 官方文档站（doc.inkspires.cn），梳理出完整功能图谱（书斋/创世台/章节画布/剧情画布/万物百科/正文工作台/作品记忆/墨灵助手/灵感墙/作品风格/拆书/23 个 Agent/创作统计）。
  2. 与用户确认四项决策：Electron、Vue 3、MVP=核心创作闭环（M1–M5）、UI 先按文档还原（用户后续提供真实截图校准）。
  3. `git init`（main 分支）、配置 `.gitignore`（排除依赖/构建产物/数据库/密钥）。
  4. 撰写全套规范与设计文档：documentation-standards / coding-standards / git-workflow / acceptance-workflow / design-goals / architecture / roadmap。
- **修改的文件**：`.gitignore`、`docs/standards/*4`、`docs/design/*2`、`docs/plan/roadmap.md`、`docs/worklog/worklog.md`（均新增）。
- **遇到的问题与解决**：无（本节为立项记录）。
- **遗留问题**：
  - 用户尚未提供 OpenRouter API Key（用于 ox-alpha 二次验收），当前先用内置子代理验收，规范已预留升级路径（`scripts/accept-via-openrouter.mjs` 于 M1 创建）。
  - 用户尚未提供墨灵真实界面截图，UI 以文档站截图为基准。
- **下一步**：M0 剩余项——electron-vite 脚手架搭建、空白窗口跑通、下载官网截图入 refs/、首次 commit；随后进入 M1 书斋。

---

## [2026-08-22 12:30] 会话 2：M0 脚手架实现与二次验收整改

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. 搭建 electron-vite 5 脚手架（Electron 43 + Vue 3.5 + TS 7 + Pinia 4 + vue-router 5 + Tailwind 4 + electron-builder 26），手动创建全部配置与源码，未用交互式模板。
  2. 下载官网 10 张产品截图入 refs/，用视觉分析确认原站为**淡紫罗兰配色**（背景 #f5f3fa、主色 #6c5ce7），据此刻制 theme.css 设计令牌（此前误设为水墨青，已纠正）。
  3. `npm run dev` 跑通：Electron 窗口启动、Vue 渲染（DOM 快照验证）、主题计算样式验证（背景/渐变/主色全部生效）。TypeScript 双 tsconfig 检查通过（TS7 移除 baseUrl、include 不得写入 compilerOptions，均踩坑修复）。
  4. 独立子代理二次验收（general-purpose）：结论**有条件通过**，6/6 验收点达成，报告存 docs/acceptance/2026-08-22-M0-scaffold.md。
  5. 按验收条件完成整改：architecture 主题描述与实现对齐（P1）；app:ping 改走 wrap() 统一 IpcResult 结构并加异常保护（P2）；本条 worklog 补记 + 依赖登记（P3）；删除 .npmrc 非标准镜像键（P4）；sandbox 收紧为 true、loadURL 补 catch（P5）。
- **依赖登记**（规范 coding-standards 第 8 节）：
  | 包 | 用途 | 备选方案 |
  |---|---|---|
  | electron 43 / electron-vite 5 / electron-builder 26 | 桌面壳、构建、打包 | Tauri（已评估弃） |
  | vue 3.5 / vue-router 5 / pinia 4 | 前端框架/路由/状态 | React（用户已选 Vue） |
  | tailwindcss 4 + @tailwindcss/vite | 样式令牌与工具类 | 原生 CSS 变量（混用） |
  | typescript 7 | 类型检查 | — |
- **修改的文件**：package.json、electron.vite.config.ts、tsconfig*.json、electron-builder.yml、src/main/index.ts、src/main/ipc/wrap.ts（新）、src/preload/index.ts、src/preload/index.d.ts、src/shared/ipc.ts、src/renderer/**（新）、docs/*、refs/*（新）、.npmrc（删）。
- **遇到的问题与解决**：
  1. npm 11 的 allow-scripts 拦截 electron/esbuild 安装脚本 → `npm approve-scripts` 批准后 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js` 手动装二进制（注意镜像 URL 曾拼写错误导致 zip 校验失败）。
  2. TS7：`include` 不能写在 compilerOptions 内；`baseUrl` 已移除；`.vue`/`.css` 需 env.d.ts 声明。
  3. npm 项目级 .npmrc 自定义键（electron_mirror）每次告警 → 删除，改用环境变量方案（见上）。
- **遗留问题**：M0 的「测试 IPC 通路」按钮需在 Electron 窗口内人工点击确认（外部浏览器无 preload），待用户亲自验收时一并体验。
- **下一步**：用户确认 M0 → tag v0.1.0-m0-scaffold；进入 M1 书斋（better-sqlite3 引入、books 表、书斋 UI）。

---

## [2026-08-22 12:40] 会话 3：M1 书斋（数据库 + 完整 UI）

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. 引入 better-sqlite3 13（NAPI 预编译二进制，跨 Node/Electron ABI，无需 node-gyp rebuild；electron-builder install-app-deps 的 node-gyp 失败可忽略，已在本文登记）。
  2. 数据层：`db/database.ts`（WAL 模式 + schema_migrations 版本化迁移）+ `db/books.ts`（行↔实体映射、CRUD、空书名校验）。
  3. IPC：`ipc/books.ts` 四通道（books:list/create/update/delete）全走 wrap() 统一 IpcResult；preload 暴露 window.api.books.*。
  4. 书斋 UI：BookCard（渐变封面按书名稳定取色、分类标签、状态徽标、hover 删除）、BookCreateDialog（书名/十分类/简介）、ConfirmDialog（通用危险确认）、ToastHost+useToast（自制轻量提示）、空状态引导、加载态。
  5. 渲染层服务 `services/books.ts`：Electron 内走真实 IPC；纯浏览器调试时自动降级为内存 mock（便于 UI 视觉调试）。
- **修改的文件**：src/shared/book.types.ts（新）、src/main/db/（新 2 个）、src/main/ipc/books.ts（新）、src/main/index.ts（注册+selftest 扩展）、src/preload/index.ts、src/renderer/src/（views/BookshelfView 重写、components 3 个新、services/composables 各 1 新、App.vue 挂 ToastHost）、package.json。
- **遇到的问题与解决**：
  1. `v-model="expr"` 编译报错（v-model 必须是合法成员表达式）→ ConfirmDialog 改 `:model-value` + `@update:model-value`。
  2. **时序 bug**：确认弹窗按钮先关弹窗（连带清空 pendingDelete）后 emit confirm，导致 doDelete 读到 null 静默跳过、书删不掉 → 改为组件内先 emit('confirm') 再 visible=false。浏览器实测复现并验证修复。
  3. hover 显示的删除按钮 Playwright 不可点（hidden）→ CUA 坐标方案（hover 卡片后按卡片矩形推算按钮位置）。
- **自测结果**（全过）：
  - Electron 全链路 selftest：`books:list → {"ok":true,"data":[...]}`（better-sqlite3 在 Electron ABI 正常）
  - 持久化：Node 直写书籍→重启 Electron→selftest 读到该书→清理
  - 浏览器 mock 模式 UI 验收：卡片网格/新建全流程/删除全流程（含 hover 交互）/toast/空状态
  - typecheck node/web 双 0 错误
- **遗留问题**：封面上传未做（M1 验收点未含，挂 M12 作品风格附近再做）；「点击卡片进入创作」待 M3 路由。
- **下一步**：M1 子代理二次验收 → 用户确认 → tag；然后 M2 设置中心（API 档案 CRUD + 连通测试）。

---

## [2026-08-22 13:50] 会话 4：M1 二次验收整改（P0 修复）

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. 二次验收结论**不通过**（报告 2026-08-22-M1-bookshelf.md）：`books:create/update` 的 SQL 命名参数与 run() 传参键不匹配（@createdAt/@updatedAt vs created_at/updated_at），真实 Electron 内建书 100% 失败。验收员以 --remote-debugging-port+CDP 驱动真实应用复现。
  2. 修复 src/main/db/books.ts 两处参数名（统一 snake_case 对齐列名）。
  3. **堵自测盲区**：selftest 从只测 list 升级为完整 CRUD 链路（create→list 确认→update→remove→list 确认删除），实测输出全部通过：`{create:true,listSawIt:true,update:true,remove:true,listAfterDelete:false}`。
  4. P2 对齐：architecture.md 数据模型 cover_path→cover、nanoid→randomUUID。
- **教训（写给后续模型）**：mock 测试不能替代真实链路验证；凡新增 IPC 写通道，必须将其纳入 selftest 全链路序列。
- **修改的文件**：src/main/db/books.ts、src/main/index.ts（selftest 扩展）、docs/design/architecture.md、docs/worklog/worklog.md。
- **遗留问题**：无新增；复验通过后 M1 转「待用户确认」。
- **下一步**：验收员复验 M1 → 用户确认 → tag v0.2.0-m1-bookshelf；M2 设置中心。

---

## [2026-08-22 14:10] 会话 4 补记：M1 复验通过

- 验收员复验结论**通过**：真实 Electron 内实测「新建书籍（UI 全流程）→ 完全重启 → 仍在」与「编辑→保存→重启保留」两条用户路径，typecheck 双 0，测试数据与进程已清理。报告已追加「复验记录」一节。
- M1 状态转「待用户确认」；用户确认后打 tag `v0.1.0-m0-scaffold` 与 `v0.2.0-m1-bookshelf`。
- 验收遗留的轻微项（删除按钮仅 hover 可达、mock 显式开关）已登记至 roadmap 技术债区，计划 M2 顺带处理。

---

## [2026-08-22 15:20] 会话 5：M2 设置中心（AI Provider + 档案管理 + 连通测试）

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. 用户确认 M0/M1，已打 tag `v0.1.0-m0-scaffold`、`v0.2.0-m1-bookshelf`；并授权使用 ZCode 中配置的模型与 Key。
  2. 从 ZCode 配置（~/.zcode/v2/config.json + 环境变量）定位到「基元律动 TokenRhythm」（OpenAI 兼容端点 https://tokenrhythm.studio/v1，deepseek-v4 系列模型），实测 OpenAI 协议可用（ZCode 本身用的是其 Anthropic 协议端点）。
  3. 数据层：migration v2（api_profiles + settings 表）、apiProfiles DAO（baseUrl 归一化/必填校验）、settings DAO（KV，键白名单在 IPC 层强制）。
  4. AI Provider 抽象（src/main/ai/）：provider.ts 接口+注册表；openaiCompatible.ts 实现（fetch+SSE 逐行解析、reasoning_content 透传、错误脱敏、AbortSignal 中止）。新增协议只需新实现+注册，上层零改动。
  5. IPC：api-profiles CRUD、settings:get/set（白名单 ai.default_profile_id）、ai:chat-stream（requestId + webContents 事件回推 start/chunk/reasoning/done/error）+ ai:abort + 5 分钟硬超时。
  6. UI：设置中心（/settings）：档案卡片列表（默认标记/行内测试/编辑/删除）、ApiProfileDialog（名称/协议/地址/Key密码框/模型/高级参数折叠 + 保存前「测试连接」流式输出区）、书斋顶栏齿轮入口。
  7. 渲染层 services/ai.ts：流订阅/自动解绑/abort 封装。
- **自测结果**（CDP 驱动真实 Electron，scripts/cdp-m2-test.mjs）：
  - 全链路：创建档案→真实流式对话（返回「连接测试成功」，reasoning 透传）→设默认→列表确认，全部通过
  - 中断：收 3 个 chunk 后 abort，收到「已中止」事件 ✓
  - 设置中心 DOM 结构断言（标题/返回/新建/卡片/默认标记/测试按钮）✓
  - typecheck 双 0
- **数据说明**：应用数据库中已预置档案「基元律动（ZCode 同款）」（deepseek-v4-flash，默认档案）。Key 来自本机环境变量 TOKENRHYTHM_API_KEY，只存于本机 SQLite，未写入任何 git 文件/日志/文档。
- **修改的文件**：src/shared/ai.types.ts（新）、src/main/db/{database,apiProfiles,settings}.ts、src/main/ai/{provider,openaiCompatible}.ts（新）、src/main/ipc/{ai,settings}.ts（新）、src/main/index.ts、src/preload/index.ts、src/renderer/src/{services/ai.ts,views/SettingsView.vue,components/ApiProfileDialog.vue}（新）、BookshelfView.vue（齿轮入口）、router、scripts/cdp-m2-test.mjs（新，开发期工具）。
- **遇到的问题与解决**：Provider 内部 setTimeout+throwIfAborted 的硬超时实现无效（无法中止外部 signal）→ 移至 IPC 层由 AbortController 统一控制。
- **遗留问题**：无阻断项。技术债 M1 的两项（hover 删除可达性、mock 显式开关）未在 M2 处理，顺延 M3（见 roadmap）。
- **下一步**：M2 子代理二次验收 → 用户确认 → tag v0.3.0-m2-settings；M3 正文工作台。

---

## [2026-08-22 16:10] 会话 5 补记：M2 验收整改

- 二次验收结论**有条件通过**（8/8 验收点过；2 一般 + 5 轻微），整改情况：
  - P1（一般）默认档案悬挂指向：清空逻辑从渲染层下沉到 DAO 层（deleteProfile 内检查并清 ai.default_profile_id）——CDP 实测 IPC 直删后 default 为空串 ✓
  - P2（一般）弹窗测试无中断：「测试连接」变为可切换「停止」，弹窗关闭/组件卸载自动 abort
  - P3（轻微）流订阅时序竞态：services/ai.ts 改为先订阅+队列缓冲、拿到 requestId 后回放过滤——真实 UI 点击冒烟通过（流式输出+耗时统计正常）✓
  - P4（轻微）ipc/ai.ts 类型断言：resolveConnection 分离返回 {conn, kind}
  - P5（轻微）高级参数范围钳制（temperature 0~2、maxTokens ≥1）
  - P6（轻微）apiKey 明文下发渲染层：**保留现状**（单机应用、渲染层在信任边界内、编辑弹窗需回显），登记为已知设计权衡
  - P7（轻微）worklog 与 roadmap 技术债不一致：roadmap 已更新
- **修改的文件**：src/main/db/apiProfiles.ts、src/main/ipc/ai.ts、src/renderer/src/services/ai.ts、components/ApiProfileDialog.vue、docs/plan/roadmap.md、worklog。
- **遗留问题**：无。待复验 → 用户确认 → tag。
- **下一步**：复验 M2 → M3 正文工作台。

---

## [2026-08-22 17:00] 会话 5 补记 2：M2 复验小修

- 复验结论：整改 5/7 全过、P3 引入监听器泄漏回归、P4 断言残留，另发现行内测试按钮完成后不复位（问题 8）。三处修复：
  1. services/ai.ts 终结事件后解绑监听器（防高频累积泄漏）
  2. ipc/ai.ts ResolvedChat.kind 直接标注 ProviderKind，删除 as 断言
  3. SettingsView 行内测试：testingId（进行中）与 resultForId（结果归属）分离——按钮复位且结果保留显示（修复过程中曾误删「编辑」按钮，当即发现恢复）
- 实测：CDP 点击真实行内「测试」→ 完成后按钮恢复「测试」、输出区保留「连接成功（首字 2634ms · 总 2.7s）」、编辑按钮存在；typecheck 双 0。
- M2 全部验收意见闭环，待用户确认后 tag v0.3.0-m2-settings。

---

## [2026-08-22 18:00] 会话 6：M2 确认打 tag；启用 ox-alpha 外部验收；M3 启动

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. 用户确认 M2，已打 tag `v0.3.0-m2-settings`。
  2. 按用户指示启用外部模型二次验收：在 ZCode 配置中找到 OpenRouter 档案（key 有效），模型列表确认 `stealth/ox-alpha` 存在并实测对话正常（HTTP 200）。
  3. 新增 `scripts/accept-via-llm.mjs`：材料+diff 发给 ox-alpha 静态审查，报告存 docs/acceptance/llm-review-*.md；key 从环境变量或 ZCode 配置读取，绝不入日志。
  4. acceptance-workflow.md 第 3 节更新为双轨验收：LLM 静态审查（ox-alpha）+ 本地子代理黑盒验收，两份报告都入库，任一不通过即不通过。
- **下一步**：M3 正文工作台（chapters 表、章节树、TipTap 编辑器、自动保存、字数统计）。

---

## [2026-08-22 19:30] 会话 7：M3 正文工作台

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. migration v3：chapters 表（FK 级联删书→删章、book_id+sort_order 索引）；database.ts 开启 foreign_keys。
  2. chapters DAO：CRUD + 上移/下移（事务交换序号）+ 删除后序号压缩；IPC 五通道全走 wrap。
  3. 正文工作台 UI（/book/:id/write）：ChapterSidebar（章节列表/自动命名「第 N 章」/行内重命名/上下移/删除/全书字数）+ ChapterEditor（TipTap 3 + StarterKit；标题行内编辑；网文排版：首行缩进 2em、段距；状态栏字数+保存态）。
  4. 自动保存：输入 1.5s 防抖落盘；Ctrl+S 立即保存；切换章节前 flush；组件卸载 flush。字数=纯文本去空白字符数。
  5. 书斋卡片点击进入工作台。
- **依赖登记**：@tiptap/vue-3、@tiptap/starter-kit、@tiptap/pm（3.30）——用途：沉浸式正文编辑器；备选 Lexical/CodeMirror（文档模型与划词扩展生态更契合 TipTap，选它）。
- **自测结果**（CDP 驱动真实 Electron）：
  - IPC 全链路：万字正文保存字数精确（12960）、自动命名、自定义标题、排序 ✓
  - UI：万字 9 段渲染、连续输入 5 次仅 10ms（无卡顿）、自动保存增量落库（13005 字）✓
  - 完全重启后：章节/正文/自动保存内容全部保留、编辑器重新加载 ✓
  - 外键级联：删书后章节数归零 ✓
  - typecheck 双 0 ✓
- **修改的文件**：src/shared/chapter.types.ts（新）、src/main/db/{database,chapters}.ts、src/main/ipc/chapters.ts（新）、src/main/index.ts、src/preload/index.ts、src/renderer/src/{views/WorkspaceView.vue,components/{ChapterSidebar,ChapterEditor}.vue}（新）、BookCard.vue、router、package.json。
- **遇到的问题与解决**：无阻断；updateChapter 初版有冗余分支（wordCount 双写）已精简。
- **遗留问题**：右栏（章节信息/后续作品记忆）未做，规划 M8；章节拖拽排序未做（上下移替代），挂技术债。
- **下一步**：M3 双轨验收（ox-alpha 静态审查 + 子代理黑盒）→ 用户确认 → tag；M4 AI 写作。

---

## [2026-08-22 20:30] 会话 8：M3 双轨验收与整改

- **双轨验收结果**：
  - 黑盒子代理：**有条件通过**（P1 重命名 focus 报错、P2 布尔命名、P3 一次未复现跳回书斋）；报告 2026-08-22-M3-workspace.md
  - ox-alpha 静态审查（LLM）：**有条件通过**——数据层「相互印证质量扎实」；揪出 undo 历史跨章节残留与自动命名重名两个我和黑盒都漏掉的问题；报告 llm-review-2026-08-22-06-14-.md
- **整改（全部 CDP 实测验证）**：
  1. P1：v-for 内字符串 ref 是数组 → 改函数式 ref（Map 收集），focus/select 正常
  2. undo 串章节：ChapterEditor 以 :key=章节id 整体重建（全新编辑器实例，历史干净）；实测甲→乙切换内容正确
  3. 自动命名重名：删章后再建递增避开现存标题（实测删第2章后新建得「第 4 章」，无重复）
  4. P2：switching→isSwitching；Ctrl+S 全局兜底（window keydown，覆盖标题框焦点）
- **ox-alpha 接入踩坑（写给后续模型）**：非流式返回空白体（HTTP 200 但 body 全空格）；流式对 >2 万字输入也返回空。最终方案：diff 限 1.5 万字+流式 SSE 解析。脚本 accept-via-llm.mjs 已固化。
- **修改的文件**：ChapterSidebar.vue、ChapterEditor.vue、WorkspaceView.vue、chapters.ts、scripts/accept-via-llm.mjs。
- **遗留问题**：P3（一次未复现的跳回书斋）保持观察，再现时按 bug 流程处理。
- **下一步**：用户确认 M3 → tag v0.4.0-m3-workspace；M4 AI 写作。

---

## [2026-08-22 21:00] 会话 9：M3 确认；交接保障先行

- **使用的模型**：GLM-5.3（zai-start-plan）
- **用户已确认 M3**，已打 tag `v0.4.0-m3-workspace`。
- **额度预警**：用户告知当前模型额度将尽，将切换其他模型继续。应对：新增 `docs/HANDOVER.md` 交接文档（新会话第一入口：状态总览/开工 SOP/架构速览/验收流程/踩坑速查/凭据位置/M4 任务卡/快速命令），并承诺此后每完成一小块即 commit、每会话必更新 worklog，保证任意断点可无损交接。
- **下一步**：M4 AI 写作（任务卡见 HANDOVER.md 第 9 节）。

---

## [2026-08-22 22:30] 会话 10：M4 AI 写作（开发+自测完成，待双轨验收）

- **使用的模型**：GLM-5.3（zai-start-plan）
- **完成内容**：
  1. `services/aiWriting.ts`：续写/划词（润色/扩写/改写）/整章润色的提示词构造（书信息+前文尾部 3k+输出纪律）+ 默认档案解析（默认→第一个→报错引导）。
  2. `AiWritingPanel.vue`：流式预览面板（generating/ready 两态、停止/重写/采纳）。
  3. `ChapterEditor.vue` 集成：状态栏「✦ AI 续写」、划词浮条（润色/扩写/改写，函数式定位+mousedown.prevent 防丢选区）、标题栏「✧ 整章润色」；采纳：续写=文末插入、划词=替换选区、整章=setContent；busy 锁防并发；卸载中止。
  4. WorkspaceView 传 book 上下文。
- **自测结果**（CDP 真实 Electron，测试脚本 tmp/m4-*.mjs）：
  - 续写全链路：点击→170+ chunk 流式→面板 ready→采纳→插入 592 字符→flushSave 落库 569 字 ✓
  - 划词：DOM Range 选中「他走进房间。」→浮条出现→润色→采纳→选区精准替换（「房间很大。」保留）→落库 43 字 ✓
- **踩坑（重大，写给后续模型）**：
  1. **rAF 节流冻结**：窗口后台/失焦时 requestAnimationFrame 不执行，生成流程永不启动（面板永远「等待模型输出…」）。修复：nextTick（微任务）+ 主进程 `backgroundThrottling: false`。诊断方法：window.__m4dbg 数组逐步打点。
  2. **HMR 状态污染**：多次热重载后 onUpdate→保存链路失效（M3 时代正常的路径测出「不保存」假象）。**涉及编辑器/生成流程的改动必须完全重启 dev 再测**。
  3. TokenRhythm API 有慢时段（5-20s 首字），测试超时要给足（脚本 50×3s）。
- **修改的文件**：services/aiWriting.ts（新）、components/AiWritingPanel.vue（新）、ChapterEditor.vue（大改）、WorkspaceView.vue、main/index.ts（backgroundThrottling）。
- **遗留问题**：M4 双轨验收未做（额度告急，主动收尾交接）——下一会话第一件事：按 HANDOVER 第 5 节跑 ox-alpha 材料审查 + 黑盒验收，然后请用户确认 → tag v0.5.0。
- **下一步**：交接（更新 HANDOVER 至 M4 状态）→ 新模型执行 M4 验收 → M5 创世台。

---

## [2026-08-22 23:30] 会话 11：M4 双轨验收（用户追加额度授权）

- **使用的模型**：GLM-5.3（zai-start-plan）
- **双轨验收执行**：
  1. **静态审查**：ox-alpha 当日不可用（连短输入都返回空，此前正常——服务端波动）+ OpenRouter 账户 402 无 credits（付费模型不可用）。降级方案：accept-via-llm.mjs 增加 --base-url/--key-env 参数 → 用 TokenRhythm deepseek-v4-pro 代理执行。**审查报告**（llm-review-2026-08-22-10-10-.md）发现 2 高 + 1 中 + 1 低：
     - 高：续写/停止竞态（nextTick 回调在 stop 后仍发起生成）
     - 高：划词采纳用生成前位置快照，生成期间文档变化会替换错位置
     - 中：浮条定位未叠加滚动偏移
     - 低：整章润色无入口确认（采纳即确认，登记不改）
  2. **整改**（commit a44ff3e）：generationSeq 序号作废机制（双检：nextTick 回调前+会话建立后）、划词采纳前快照文字校验（漂移则拒绝并保留面板内容）、浮条 scrollTop 叠加+滚动隐藏。
  3. **黑盒验收**：首次派发子代理模型请求失败（ZCode 后端波动），重派成功执行中。
- **修改的文件**：ChapterEditor.vue、scripts/accept-via-llm.mjs。
- **遗留问题**：ox-alpha 空回复根因未明（服务端 vs 免费额度），恢复后应复审；OpenRouter 无付费 credits（如需付费模型审查需用户充值或继续用 TokenRhythm 代理）。
- **下一步**：黑盒验收报告 → 整改（若有）→ 用户确认 → tag v0.5.0-m4-ai-writing → M5 创世台。

---

## [2026-08-23 00:40] 会话 12：M4 黑盒验收与整改复验

- **黑盒验收**（报告 2026-08-22-M4-ai-writing.md）：**有条件通过**（7/9 过，抓到 1 阻断 + 1 高）：
  - P1（阻断）流式中并发锁失效：chatStream 会话建立即 resolve，finally 提前释放 busy → 流式中可再发起并行请求（实测两个 requestId 各 200+ chunk——双倍计费）
  - P2（高）面板跨生成不重置：reset 只依赖 visible 翻转，停止后再发起旧文本残留/停止按钮消失/可采纳半截文本
  - P3-P6（轻微）：主动停止弹错误 toast；被拒后再点采纳误报成功；\n\n 塌陷单段；busy 命名
  - 亮点：LLM 审查三缺陷的整改全部实测有效；整章润色/划词/持久化全过
- **整改**（实测复验 tmp/m4-reverify.mjs 全过）：
  1. P1：并发锁生命周期覆盖到 onDone/onError（release 按 seq 校验）；主动停止的流静默（mySeq 不匹配时不弹错——P3 一并解决）
  2. P2：AiWritingPanel 暴露 reset()，runGeneration 发起前显式调用
  3. P4：划词快照被清空后再点采纳 → 引导提示而非误报成功
  4. P5：aiTextToHtml（换行分段+HTML 转义）保住网文段落
  5. P6：busy → isBusy
- **复验证据**：流式中再点续写 requestId 保持 1 + 拦截提示出现；停止后再发起面板为新内容无残留；主动停止无错误 toast。
- **下一步**：用户确认 M4 → tag v0.5.0-m4-ai-writing → M5 创世台。

---

## [2026-08-23 01:10] 会话 13：正式移交（GLM-5.3 → GLM-5.2）

- **原因**：GLM-5.3 额度耗尽，用户决定切换 GLM-5.2 继续。
- **移交时状态**：git 干净（21 提交、4 tag：v0.1.0~v0.4.0）；M4 双轨验收闭环+整改+复验完成，**唯一待办是用户亲手验证 M4 后打 tag v0.5.0**；无未保存工作、无进行中进程（electron 已清）。
- **移交载体**：docs/HANDOVER.md（第 0 节新增移交摘要+M4 验证指引）+ 本日志。
- **给 GLM-5.2 的提示**：严格按 HANDOVER 第 3 节 SOP 开工；第 6 节 12 条踩坑必读（尤其 HMR 污染与 rAF 节流）；验收双轨制继续执行；额度同样有限时优先保 worklog/HANDOVER 同步，小步 commit。
- **下一步**（交接后）：M4 用户确认+tag → M5 创世台（HANDOVER 第 9 节任务卡）。

---

## [2026-08-23 09:00] 会话 14：M4 用户确认收官

- 用户亲手验证 M4 通过，已打 tag `v0.5.0-m4-ai-writing`（MVP 进度 4/5）。
- roadmap/HANDOVER 同步更新至「下一步 M5 创世台」。GLM-5.2 从 HANDOVER 第 9 节任务卡开始 M5。
- GLM-5.3 使命完成，正式交棒。

---

## [2026-08-23 10:30] 会话 15：M5 创世台五步（MVP 收官，开发+自测完成）

- **使用的模型**：GLM-5.3（额度恢复后继续，用户未切换）
- **完成内容**：
  1. migration v4（genesis_steps 表，复合主键 book_id+step，FK 级联）；DAO UPSERT；IPC get/save/save-step
  2. 预设风格包 5 种（热血/轻松/悬疑/古风/硬科幻，含 promptHint，M14 拆书后换真实风格包）
  3. genesisPrompts：定魂 AI 辅助（JSON 输出解析填表）+ 造世冷启动（【段名】四段解析：全书大纲/第一卷大纲/世界法则/主角设定）
  4. GenesisView 五步向导：步骤条跳转/完成打勾/每步独立保存/复用 AiWritingPanel
  5. 接通 M4：ChapterEditor 加载该书 genesis（文风 promptHint + 定魂 logline/支柱 + 布局写作规则）注入 systemPrompt
  6. 入口：书斋卡片「创世台」按钮 + 工作台侧栏「创世台」链接 + 创世台第5步跳工作台
- **自测结果**（CDP 真实 Electron，tmp/m5-verify.mjs）：
  - 五步全走通：定风绑定/定魂保存/布局保存（IPC 直接存）+ 造世冷启动（真实 AI 生成+采纳落库）
  - 持久化：genesis.get 返回 4 步全部 done+hasData
  - **设定注入**：续写 579 字紧扣设定（陈默/剑灵/灵力/封印——来自定魂与文风约束）✓
  - typecheck 双 0
- **修改的文件**：shared/{genesis.types,presetStyles}.ts、main/db/{database,genesis}.ts、main/ipc/genesis.ts、main/index.ts、preload/index.ts、renderer/services/{genesisPrompts,aiWriting}.ts、views/GenesisView.vue、components/{ChapterSidebar,ChapterEditor,BookCard}.vue、views/WorkspaceView.vue、router。
- **遗留问题**：布局大纲与 M3 章节树不自动同步（M7 章节画布接）；万物百科词条管理（M6）。
- **下一步**：M5 双轨验收 → 用户确认 → tag v0.6.0 → **MVP 全部完成** → 建议 M16 打包出安装包。

---

## [2026-08-23 12:00] 会话 16：M5 双轨验收与 P0 整改

- **双轨验收**：
  - 静态审查（deepseek-v4-pro）：有条件通过（diff 截断致 GenesisView 未送审，bookId 传递误报，as-never 已修）
  - 黑盒验收：**不通过**——抓到 P0 阻断：Vue reactive Proxy 无法跨 IPC 结构化克隆，定风/定魂/布局三步 UI 保存静默失败（toast「An object could not be cloned.」被吞）。自测漏掉因脚本用 IPC 直调传普通对象绕过了响应式层。
- **整改**：GenesisView.saveStep 传 IPC 前用 `JSON.parse(JSON.stringify(toRaw(data)))` 去响应式。
- **复验**（tmp/m5-p0-reverify.mjs，真实 UI 点击路径）：定风/定魂/布局三步全部落库（step1/2/4 done+hasData），无错误 toast ✓
- **教训（写给后续模型）**：**凡是 Vue 组件内把 ref/reactive 对象传给 window.api.*（IPC）的，必须先 toRaw+深拷贝去响应式**——Electron 结构化克隆不支持 Proxy。自测脚本不能只走 IPC 直调，必须覆盖真实 UI 交互路径。
- **下一步**：验收员复验 → 用户确认 → tag v0.6.0 → MVP 完成。

---

## [2026-08-23 13:00] 会话 16 补记：M5 复验通过——MVP 完成

- 验收员复验结论**通过**：真实 UI 路径五步全部落库 + 重启持久化 + M4 设定注入真实闭环（续写 557 字含「林渊/剑灵」——来自定魂注入而非前文）。
- **MVP 全部完成**（M1-M5）：建书→设定→AI 写作 闭环可用。
- 待用户确认后打 tag v0.6.0-m5-genesis。
- **下一步建议**：M16 打包 NSIS 安装包（让用户真正装上日常用），然后继续 M6+ 功能模块。

---

## [2026-08-23 14:30] 会话 17：M5 用户反馈修复（双轨验收通过）

- **用户反馈两个问题**：① 创世台定魂 AI 辅助有时无法采纳 + AI 输出嵌入「定魂」等步骤昵称 ② 创世台完成后 AI 续写未遵守设定
- **根因调查**（两个 Explore 代理）：
  - 问题①：genesisPrompts.ts 提示词直接用「定魂设定」等步骤昵称（3 处 user prompt）；parseSoulAssist 只剥纯围栏无法处理散文包裹，且 logline 空即整表作废
  - 问题②（阻断）：ChapterEditor.vue 用了 isElectron 但**未 import**，loadGenesis 抛 ReferenceError 被 `void` 静默吞掉，genesisCache 永远空 {}，systemPrompt 的 genesis 注入全部跳过。**此前验收「通过」是假阳性**（关键词可能来自 book.description 而非 genesis）
- **修复**（commit f031cfa + 7ba4446）：
  1. 提示词去昵称：定魂→故事核心（3 处）
  2. parseSoulAssist：JSON 提取改首{到末}子串（兼容散文包裹/围栏变体）；字段降级（有任意非空即返回）
  3. ChapterEditor 补 `import { isElectron }`；catch 加 console.warn；ensureGenesisLoaded 防「秒点续写」竞态
  4. acceptSoulAssist 字段级合并（仅覆盖 AI 非空字段）
  5. 静态审查额外修复：s.cheat 可选链防旧数据崩溃；loadGenesis 切书清缓存+序号防覆盖；rules 显式非空判断
- **双轨验收**：
  - 静态审查（deepseek-v4-pro）：发现 5 项（#2/#3 已修，#5 误报已确认 bookId 已传，#1/#4/#6 低优先级挂技术债）
  - 黑盒验收：**通过**（6 项全过）——续写含 genesis-only 关键词「星辉/镜/家母遗物」（前文无，证明注入生效）；无昵称泄漏；采纳容错 4 用例全过；字段合并 6 断言全过；重启持久化全过
- **教训**：① Vue 组件用 isElectron 必须 import（全仓 5 个文件都 import 了唯独 ChapterEditor 漏）；② 验收不能用「续写含关键词」间接判定 genesis 注入——关键词可能来自 book.description；③ typecheck 报 Cannot find name 应被拦截，此次漏网需排查
- **下一步**：用户确认 → M5 修复完成可打 tag → M16 打包。

---

## [2026-08-23 15:00] 会话 18：移交准备（不打 tag，切换模型）

- 用户指示：M5 修复已完成但**暂不打 tag**，将切换其它模型继续。撰写移交报告。
- 移交时状态：git 干净（34 提交 5 tag v0.1.0~v0.5.0）；M5 全部完成含用户反馈修复，双轨验收通过；无未保存工作、无进行中进程。
- HANDOVER 已更新至当前状态（第 0/2/6/9 节），踩坑速查扩充至 16 条（含 M4/M5 新增 6 条）。
- **给新模型的指示**：① 询问用户是否确认 M5 → 打 tag v0.6.0；② M16 打包 NSIS 安装包（优先）；③ 然后 M6 万物百科。详见 HANDOVER 第 9 节。

---

## [2026-08-23 16:00] 会话 19：默认 AI 模型更换为 GMI Cloud MiniMax M3

- **用户要求**：软件内模型替换为 ZCode 中 GMI Cloud 来源的 MiniMax M3。
- **操作**：
  1. 从 ZCode 配置定位 GMI Cloud（https://api.gmi-serving.com/v1，模型 MiniMaxAI/MiniMax-M3）；实测 OpenAI 兼容协议非流式+流式均可用（HTTP 200，流式 [DONE] 正常）
  2. 直写应用数据库新增档案「GMI Cloud · MiniMax M3」并设为默认（key 从 ZCode 配置读取，仅存本机 SQLite，未入 git/日志）
  3. 端到端验证：启动应用经自身管线（preload→IPC→Provider→SSE）以新默认档案流式对话成功（回复正常、无错误）
- **档案现状**：「GMI Cloud · MiniMax M3」（默认）+「基元律动（ZCode 同款）」（保留，仍作验收审查模型来源）
- **注意**：MiniMax M3 无 reasoning_content（非推理输出格式），应用面板仅显示正文，无影响
- **下一步**：不变——用户确认 M5 打 tag v0.6.0 → M16 打包。

---

## [2026-08-29 18:00] 会话 20：划词润色/扩写/改写上下文衔接修复

- **用户反馈**：划词功能生成文字有时与上下文冲突或衔接不好。
- **根因**（Explore 代理确证）：
  1. contextTail 传编辑器全文（含选区+选区后文字）且锚定文档末尾——选区紧邻前文可能不在窗口内；选区后文被错标为「前文结尾」诱导 AI 复述 → 替换后与保留的后文冲突；选区文字出现两次
  2. 提示词无衔接纪律（无接前文末句/接后文首句/禁重复/片段形态保持）
  3. selectionTarget 无前后文概念
  4. aiTextToHtml 一律包 <p>，句中片段替换把原段拆成三段
- **修复**（commit 683262d）：
  1. selectionTarget 快照增加 before/after 窗口（选区前后各 1500 字，textBetween 截取）
  2. buildSelectionMessages 新签名 (ctx, sel:{text,before,after}, action)；三段式提示词【选区前文】【待处理原文】【选区后文】+ 衔接纪律（开头接前文末句/结尾接后文首句/禁重复/片段保持片段/扩写 2~3 倍）
  3. 采纳区分形态：同段落内（sameParent）行内纯文本替换（折叠换行）不拆段；跨段走块替换
- **自测**（tmp/seam-verify.mjs + seam-regression.mjs，CDP 真实 UI）：句中片段润色后段落数不变、前后文保留、无重复句、衔接自然（"井绳冰凉刺骨。→他仰起头…师父嘱托→远处传来鸡鸣"）；回归续写/整章润色/跨段选区全过；typecheck 双 0
- **双轨验收**：
  - 静态审查改用 **GMI Cloud MiniMax M3**（deepseek-v4-pro 被平台下线）；结论**有条件通过**——其"严重"项实为材料限制：diff 窗口（v0.5.0..HEAD 含整个 M5）15000 字截断致 aiWriting.ts 未送审（代码实际已改否则 typecheck 必败）；"scope creep"同因（tag 未打导致 diff 跨里程碑）。中等项 #5（常量同步）已在最后编辑中消除（SELECTION_CONTEXT_LIMIT 已删，仅剩编辑器侧 SEL_CTX_WINDOW）；#6（genesisLoadingPromise 竞态）经分析不成立（变量在调用时读最新值）；#3/#4/#7-#10 记录在案
  - 黑盒验收执行中
- **下一步**：黑盒报告 → 收尾 → 用户验证。

---

## [2026-08-30 11:00] 会话 21：划词衔接二次强化（接缝锚点+关键名词保持）

- **用户反馈**：划词润色/扩写/改写仍偶发与上下文冲突、衔接不佳（会话 20 三段式修复后的残余问题）。
- **残余根因**（代码审查+强依赖场景实测确证）：
  1. 窗口 1500 字在任意字符处切断，AI 看到的上文开头/下文结尾是半句话，衔接锚点模糊
  2. 真正决定衔接质量的紧邻两句被淹没在长窗口里
  3. 无「防越界」纪律（提前消耗下文情节/引入矛盾设定/切换视角均未明确禁止）
  4. **缺关键名词保持纪律**——实测复现：选区「她把信放在桌上」被改写成「她将那几页薄纸搁在桌上」，下文「信封上的火漆完好无损」指代链断裂
- **修复**：
  1. 提示词层（aiWriting.ts）：新增【衔接锚点】块——从前后窗口提取「上文末句/下文首句」单独高亮（lastSentence/firstSentence 工具函数）；衔接要求补充「不得提前揭示下文情节」「关键名词不得改写为代称（指代必须成立）」「不得切换视角/时间线/场景」「保持对话引号形态」
  2. 编辑器层（ChapterEditor.vue）：clipBefore/clipAfter 窗口切点吸附段落边界，保证窗口首末句完整
- **实测**（tmp/seam-strong-verify.mjs，强依赖场景：选区承担传信功能、下文依赖信的存在）：
  - 修复前：改写输出丢「信」（→薄纸），指代链断 ✗
  - 修复后：60 字输出保留「信搁在桌角」，无下文复述（火漆）、无前文复述（木匣）、无昵称 ✓
- **修改的文件**：src/renderer/src/services/aiWriting.ts、src/renderer/src/components/ChapterEditor.vue。
- **遗留问题**：接缝锚点对超长句（无句末标点）回退为按长度截取（80 字），极端情况锚点可能不是完整句——可接受。
- **下一步**：用户验证 → M5 修复确认后打 tag v0.6.0 → M16 打包。

---

## [2026-08-30 13:30] 会话 22：M16 打包发布完成（双轨验收：黑盒通过+静态有条件通过已整改）

- **前置**：用户确认 M5，已打 tag `v0.6.0-m5-genesis`。
- **交付**：
  1. 应用版本 0.1.0→0.6.0；程序化生成应用图标 build/icon.ico（罗兰紫底白墨滴，256 PNG-in-ICO，视觉校验通过）
  2. `dist/InkSpire-Setup-0.6.0.exe`（111MB NSIS 安装包）+ `dist/win-unpacked/` 免安装目录
  3. electron-builder.yml：npmRebuild:false（NAPI 预编译免重编译）+ 显式 asarUnpack 固化原生模块解包
- **构建踩坑三连**：① node-gyp 缺 Python → npmRebuild:false；② GitHub 下载 Electron zip 超时 → ELECTRON_MIRROR；③ 同类 → ELECTRON_BUILDER_BINARIES_MIRROR（两者均为环境变量，勿写 .npmrc）
- **自测**：打包版烟测（CDP 9223）preload/SQLite/写路径回环/默认档案(MiniMax M3)流式全过
- **双轨验收**：
  - 静态审查（GMI MiniMax M3，三轮迭代）：首轮 diff 为空（脚本缺陷——tag 恰为 HEAD，已修脚本支持 --base；注意 tag 全名是 v0.6.0-m5-genesis 不存在裸 v0.5.0）；二轮给补正清单；三轮「有条件通过」，必须项（显式 asarUnpack）已整改并重建+回归烟测通过
  - 黑盒验收：**通过**（12/12）——静默安装 /S 退出码 0、卸载入口齐全、安装版 CDP 全链路验证、设置中心两档案完好、安装版内 AI 流式成功
- **重要发现**：安装版与开发版共享 userData（%APPDATA%/inkspire-desktop，app.getName 取自 package.json name）→ 本机安装后 AI 档案即席可用
- **应用已安装**：C:/Users/Administrator.DESKTOP-GRPRATA/AppData/Local/Programs/InkSpire/InkSpire.exe（黑盒安装并保留；显式 asarUnpack 重建版已通过静默覆盖安装同步至本机——外壳进程会挂起但 NSIS 子进程正常完成，杀掉外壳即可，安装版 mtime 已对齐最终产物并启动验证通过）
- **待办**：用户确认 M16 → tag v0.7.0-m16-package；后续 M6 万物百科 / 代码签名 / 自动更新

---

## [2026-08-30 15:30] 会话 23：M6 万物百科（开发+自测完成）

- **交付**：migration v5 wiki_entries（6 类型/属性/关系/系统角色/注入模式）；wiki 四通道 IPC；wikiPrompts（AI 生成词条严格 JSON+容错解析+防撞名+创世台导入幂等转换）；WikiView 三栏 UI（筛选/搜索/卡片/右侧编辑面板）；AI 写作注入（wikiCache 三件套，always 词条 1200 字预算进 systemPrompt）；入口三处。
- **自测中抓到并修复 2 个真实 bug**：
  1. **stale bookId（产品级）**：WikiView/GenesisView/WorkspaceView 在 setup 一次性捕获 route.params.bookId，同路由跨书导航时 Vue Router 复用组件实例→旧书 id 残留→FK 失败/数据错乱。修复：三视图 bookId 改 computed + watch 重载。教训记入踩坑速查。
  2. **AI 输出 JSON 内未转义引号**：实测复现「剑名"寂鸣"」致 JSON.parse 必败。修复：新增 services/jsonRepair.ts lenientJsonRepair（状态机把值内孤立引号转义）+ lenientParse，parseWikiGenerate 与 parseSoulAssist 共用；提示词同步加「字段值内禁用英文双引号」。
- **自测结果**（tmp/m6-*.mjs，真实 UI 路径）：CRUD 回环 ✓、UI 新建落库 ✓、AI 生成词条→采纳填表（name/属性 4 个）✓、创世台导入（2 条 always+幂等）✓、always 词条注入续写 663 字紧扣设定 ✓、typecheck 双 0
- **小瑕疵（不阻塞）**：创世台导入的词条名取首行可能带句号（用户可在面板改）；接缝锚点对无标点长句回退长度截取
- **下一步**：M6 双轨验收 → 用户确认 → tag v0.7.0 → M7 章节画布。

---

## [2026-08-30 18:00] 会话 24：M6 双轨验收通过

- **黑盒验收：通过**（8/8，报告 2026-08-30-M6-wiki.md）——stale bookId 回归实测（A/B 跨书各归其主）、AI 生成一次成功（失败率 0）、注入对照（always 生效/manual 不出现）、重启持久化全过。
- **静态审查（GMI MiniMax M3）：有条件通过**——核心路径材料齐备；轻微项（parseJson 警告/relations Map 查找/卸载清理）已全部落实；其余意见为 diff 截断固有局限（黑盒已覆盖运行时）。
- **整改**：wiki DAO parseJson 加 console.warn；loadWiki relations 查找改 Map（去 O(N²)）；onBeforeUnmount 作废未完成加载。
- **M6 状态：待用户确认 → tag v0.7.0-m6-wiki**。
- **下一步**：M7 章节画布（@vue-flow 引入、场景节点、5 种 AI 场景生成、按场景生成正文）。

---

## [2026-08-30 20:00] 会话 25：M7 章节画布（三轮复验闭环）

- **交付**：migration v6 scenes 表；scenes 五通道 IPC；scenePrompts（5 模式场景生成 JSON+宽容解析+正则救援+逐场景正文提示词）；CanvasView（Vue Flow 自定义节点/拖拽落库按x重排/详情面板词条挂接/AI 面板/生成正文循环→写入章节→自动跳工作台）；侧栏章节 hover 画布入口。
- **验收拉锯（三轮+遗留专项，报告 2026-08-30-M7-canvas.md）**：
  - R1 黑盒不通过：**Vue Flow 事件单参数载荷**（{event,node} 而非双参数）致节点交互全废——阻断修复
  - R2 复验不通过：整改 commit 自身引入**对象简写语法错**（批量 .value 替换误伤）且 typecheck 盲区放行——修语法+补搭桥/改写入口+治理盲区（vue-tsc 与 TS7 不兼容→electron-vite build 作 SFC 编译闸门并入 typecheck）
  - R3 有条件通过+遗留专项再抓：抽取函数改名后**残留旧调用**（onNodeDragStopReorder）致搭桥采纳崩溃+脏数据——修+搭桥实机自测通过（过渡场景落锚点前、sortOrder 连续无 #0、无崩溃）
- **流程教训（第三次同类）**：修复必须实机运行自测后再提交；函数改名后全文件引用自查；tsc 不解析 SFC，语法错误靠 electron-vite build 闸门
- **M7 状态：自测+验收全闭环，待用户确认 → tag v0.8.0-m7-canvas**
- **下一步**：M8 作品记忆 → M9 墨灵助手 → M10 剧情画布（逐个交付节奏不变）。


---

## [2026-08-30 22:00] 会话 26：连线功能开发中途暂停（用户额度预警，移交）

- **背景**：用户要求画布场景连线（多线叙事可视化+场景关系表达），规划获批（连线 v1=关系表达+AI 参考，生成顺序仍按 x 线性；分支独立生成后续版本）。
- **完成**：shared/canvas.types.ts 连线类型全部就位（可编译）。
- **未开始**：migration v7 scene_edges / DAO / IPC / preload / CanvasView 渲染与交互 / 正文关系注入——**精确断点与逐步任务卡见 HANDOVER 第 9 节**。
- **移交状态**：git 干净、types 可编译、无进行中进程；M7 章节画布已三轮复验闭环**待用户确认打 tag v0.8.0**（新会话开工第一件事：问用户确认 M7 → tag）。
- **下一会话开工路径**：读 HANDOVER 第 0/3/6 节 → 问 M7 确认打 tag → 按第 9 节断点续做连线 → M8-M10 逐个交付。
- **流程提醒（第三次同类教训强化）**：凡函数改名/批量替换，必须全文件引用自查+实机运行自测后再提交；typecheck 闸门已含 electron-vite build（SFC 编译）但仍拦不住「未定义标识符」类运行时错误——SFC 内新增函数调用务必人工核对存在性。

---

## [2026-08-30 23:00] 会话 27：画布场景连线完成（自测 6/6）

- M7 用户确认，tag v0.8.0-m7-canvas 已打（8474d5d）。
- 连线功能交付：migration v7 scene_edges（双 FK 级联）；sceneEdges DAO（防自身/防同向重复）；四通道 IPC+preload；CanvasView（节点左右 Handle、拖线 connect 落库、三类型样式主线金实/因果蓝虚/关联灰点、label 上边、单击选中→工具栏编辑器 类型/标签/删除）；场景删除连线 FK 级联+本地同步；生成正文携带出入关系描述（防因果写反）。
- 自测（tmp/edge-verify.mjs）：建边/校验双拦截/渲染 label/更新/级联删/带关系正文生成跳转 全过 ✓
- **下一步**：双轨验收 → 整改 → 用户确认 → tag v0.9.0 → M8 作品记忆。
