# 项目交接文档（HANDOVER）

> **新会话/新模型开工第一入口**。本文件始终保持「随时可交接」状态，每次里程碑收尾后更新。
> 最后更新：2026-09-08 · 会话 37 续 · **M10.6/M10.7/M10.8 全部完成（tag v0.14.0/v0.15.0）；0.15.0 已打包并覆盖安装验证；产品更名「墨笺」**

## 0. 移交摘要（新模型 60 秒读完）

- **M0-M10.8 全部完成并通过双轨验收**，14 个版本 tag（最新 v0.14.0-m10.6-m10.7 / v0.15.0-m10.8-restyle）
- **产品已更名「墨笺」**（appId/数据目录/可执行名 InkSpire 不变）；题材与标签旧值经 migration v11 映射；GMI 额度耗尽后 AI 档案切 TokenRhythm glm-5
- **下一步**：M11 灵感墙（可选：OpenDesign 桌面版接入 od CLI/MCP、浮球遮挡等技术债见 roadmap）
- git：12 tag、工作区 clean（验收文档已随收尾提交）
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
| M11-M15 | 灵感墙/风格/统计/拆书/Agent偏好 | ⬜ |
| M16 | 重打包（版本升 0.14.0） | ⬜ **M10.5 确认后优先** |

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

### ~~M10.5 跨模块联动与同步~~（✅ 已完成，待用户确认 tag v0.13.0）

交付概要（五条数据流）：A 正文→百科（AI 提取候选→SyncCandidateDialog 勾选→入库 manual 幂等）；
B 正文→记忆（prompt 注入已有+normText 本地双保险去重；未抽取批量+水位）；C 记忆清理（精确删+AI 近似合并确认）；
D 剧情↔正文/记忆双向注入（剧情 AI 上下文=创世+词条+**已写进度+既定事实**；正文/场景 AI 注入剧情链预算 1000）；
E 创世台推送百科幂等。入口：工作台「⟳ 同步」弹窗/百科「从正文提取」/记忆页增强/创世台推送按钮/剧情弹窗联动信息行。
自动同步两档（提醒=红点零 AI；静默=自动入库 ≤3 章/轮），设置分区即改即生效，App 级 60s 轻节拍。
验收：静态审查四轮（核心整改：**水位原子合并下沉主进程 sync:watermark-merge + 事务包裹**、水位键移出 settings:set 写白名单（读写拆分）、loadPlot 收敛 buildPlotChainText、白名单收紧登记）；
黑盒 9/9 通过（2026-09-06-M10.5-sync.md，含白名单收紧实测/10 章并发 merge 零丢失/重启持久逐字节比对）。
遗留：黑盒 2 条轻微债已挂 roadmap（浮球遮挡 AI 采纳条/白名单机制收紧）；update/remove 归属校验分歧项维持待用户裁决。
自测修复 3 个真 bug：水位并发竞态、混合场景全重复章节推水缺失、（承接期）useMemorySync bookId 非响应式。

### M16 重打包（下一个，M10.5 确认后立即做）

- 版本号升 **0.14.0**（package.json + electron-builder.yml；注意 v0.13.0 已预留给 M10.5），`npm run dist` 出 NSIS 安装包
- 验收：全新 Windows 安装即用（黑盒 12/12 口径不变，报告 2026-08-30-M16-package.md 可参考）
- 注意：本机已装 0.6.0 版（%LOCALAPPDATA%/Programs/InkSpire/），与 dev 共享 userData

### 后续
- M11 灵感墙（plot_events.parent_id 子画布预留列届时以 migration v11+ 落 FK）→ M12 风格包 → M13 统计 → M14 拆书 → M15 Agent 偏好
- 技术债：见 roadmap 技术债登记区（M10.5 新增 2 条：浮球遮挡/白名单机制收紧）

## 10. 快速命令

```bash
npm run dev                                        # 开发
npm run dev -- --remote-debugging-port=9222        # CDP 自动化
npm run typecheck                                  # 三重闸门（tsc×2+build）
node scripts/accept-via-llm.mjs <材料.md> --base <tag> --model MiniMaxAI/MiniMax-M3 --provider-name "GMI Cloud"
npm run dist                                       # 打包 NSIS
```
