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
