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
