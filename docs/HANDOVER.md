# 项目交接文档（HANDOVER）

> **新会话/新模型开工第一入口**。本文件始终保持「随时可交接」状态，每次里程碑收尾后更新。
> 最后更新：2026-09-06 · 会话 35 · **M10 剧情画布双轨验收通过，待用户确认打 tag v0.12.0**

## 0. 移交摘要（新模型 60 秒读完）

- **M0-M10 + 画布连线全部完成并通过双轨验收**，11 个版本 tag（v0.1.0-m0-scaffold ~ v0.11.0-m9-assistant + v0.9.0-edges）
- M16 打包已完成（InkSpire-Setup-0.6.0.exe 已安装本机），但版本号 0.6.0 后有大量变更，**需要重打包**
- **下一步**：① 等用户亲手验证 M10 → 确认后打 tag v0.12.0；② M16 重打包（版本升 0.12.0，优先）；③ M11 灵感墙
- git 干净：11 tag、工作区 clean
- 你能跑 `npm run dev` 验证环境；测试方法见第 5 节；所有坑见第 6 节（**18 条，必读**）
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
| M10 | 剧情画布（事件+四类连线+AI 三模式+搜索高亮） | ✅ 静态四轮整改闭环+黑盒 14/14 通过，**待用户确认打 tag v0.12.0** |
| M11-M15 | 灵感墙/风格/统计/拆书/Agent偏好 | ⬜ |
| M16 | 重打包（版本升 0.10.0+） | ⬜ **M10 后优先** |

**数据库 migration 当前版本 = 10**（books/api_profiles+settings/chapters/genesis_steps/wiki_entries/scenes/scene_edges/memories/assistant_messages/plot_events+plot_edges）。

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
- 数据：better-sqlite3 v13（NAPI prebuilds 跨 ABI），库文件在 %APPDATA%/inkspire-desktop/inkspire.sqlite，migration v9
- AI：`src/main/ai/` Provider 抽象+注册表；openaiCompatible.ts（SSE 流式+429 自动重试+AbortSignal 中止）
- 注入链路：ChapterEditor.loadGenesis/loadWiki/loadMemory → caches → writingContext → systemPrompt
- UI：Tailwind 4 @theme 紫罗兰令牌（#6c5ce7），弹窗/Toast/确认框/AiWritingPanel 可复用

## 5. 验收流程（双轨，详见 docs/standards/acceptance-workflow.md）

1. 开发自测：`npm run dev -- --remote-debugging-port=9222`，node+WebSocket 连 CDP 驱动真实 Electron（参考 tmp/ 下脚本）
2. 双轨验收：
   - **静态审查**：`node scripts/accept-via-llm.mjs <材料.md> --base <tag> --model MiniMaxAI/MiniMax-M3 --provider-name "GMI Cloud"`（输出存 docs/acceptance/llm-review-*.md）
   - **黑盒子代理**：Agent(general-purpose)，提示词含验收点+CDP 方法+自建自清纪律。**AI 用例重试≤3；代理报错超 3 次取消黑盒**
3. 任一不通过即不通过；整改后复验；用户确认 → tag
4. 验收报告、材料全部入库

## 6. 踩坑速查（18 条，新模型必读）

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

### ~~M10 剧情画布~~（✅ 已完成，待用户确认 tag v0.12.0）

交付概要：migration v10 两表 + IPC 八通道 + `/book/:bookId/plot`（PlotCanvasView + 4 个 plot 组件 + 2 个 composable）。
事件 CRUD/拖拽持久化/四类连线（main 金实线/logic 蓝虚 6 4/relation 灰虚 2 4/reference 绿点 1 4）/双击详情面板/搜索高亮/
AI 三模式（初始化链 5-8 事件、向后延伸多行避让、分歧推演 2-4 方向择一采纳+逻辑边标签=方向名）。
验收：静态审查四轮（GMI MiniMax M3，条件项全整改，报告 llm-review-2026-09-06-*.md ×4）+ 黑盒 14/14 通过
（2026-09-06-M10-plot-canvas.md；含重启持久化逐像素比对、删书四表级联、跨书越权拒绝）。
遗留：黑盒 2 条轻微 UX 债已挂 roadmap 技术债区；分歧项（update/remove 归属校验）留用户裁决（建议维持现状）。

### M16 重打包（下一个，M10 用户确认后立即做）

- 版本号升 0.12.0（package.json + electron-builder.yml），`npm run dist` 出 NSIS 安装包
- 验收：全新 Windows 安装即用（黑盒 12/12 口径不变，报告 2026-08-30-M16-package.md 可参考）
- 注意：本机已装 0.6.0 版（%LOCALAPPDATA%/Programs/InkSpire/），与 dev 共享 userData

### 后续
- M11 灵感墙（plot_events.parent_id 子画布预留列届时以 migration v11+ 落 FK）→ M12 风格包 → M13 统计 → M14 拆书 → M15 Agent 偏好
- 技术债：见 roadmap 技术债登记区（M10 新增 3 条：toast 拦截点击/自环无提示/update-remove 归属裁决）

## 10. 快速命令

```bash
npm run dev                                        # 开发
npm run dev -- --remote-debugging-port=9222        # CDP 自动化
npm run typecheck                                  # 三重闸门（tsc×2+build）
node scripts/accept-via-llm.mjs <材料.md> --base <tag> --model MiniMaxAI/MiniMax-M3 --provider-name "GMI Cloud"
npm run dist                                       # 打包 NSIS
```
