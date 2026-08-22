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
