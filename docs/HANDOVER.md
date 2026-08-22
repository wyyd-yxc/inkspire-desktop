# 项目交接文档（HANDOVER）

> **新会话/新模型开工第一入口**。本文件始终保持「随时可交接」状态，每次里程碑收尾后更新。
> 最后更新：2026-08-23 · 会话 13 · **正式移交：GLM-5.3 → GLM-5.2**。M4 验收闭环待用户确认；下一步 M5。

## 0. 移交摘要（新模型 60 秒读完）

- 前任模型 GLM-5.3 因额度耗尽移交，本文件+worklog 是全部上下文
- **第一件事**：请用户亲手验证 M4（指引见下）→ 用户确认后 `git tag v0.5.0-m4-ai-writing`
- **然后**：M5 创世台五步（MVP 收官，任务卡见第 9 节）
- 项目无任何未保存工作：git 工作区干净，21 个提交，4 个 tag
- 你能跑 `npm run dev` 验证环境；测试方法见第 5 节；所有坑见第 6 节

**M4 用户验证指引（发给用户）**：启动应用 → 进书的工作台写一两句 → 点「✦ AI 续写」→ 流式出来后「采纳插入」→ 生成中再点续写应被拦截 → 划选文字→浮条→润色→采纳（只替换选中部分）。

## 1. 项目是什么

复刻 inkspires.cn（墨灵小说，AI 网文创作工作台）为 **Windows 桌面应用**：本地 SQLite 存数据 + 用户自定义 AI API（OpenAI 兼容协议）。最终交付 NSIS 安装包。用户是编程小白，全程中文沟通，需要通俗解释。

## 2. 当前状态（截至本文件更新时）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 脚手架+文档规范体系 | ✅ tag v0.1.0 |
| M1 | 书斋（书籍 CRUD） | ✅ tag v0.2.0 |
| M2 | 设置中心（AI Provider+API 档案） | ✅ tag v0.3.0 |
| M3 | 正文工作台（章节树+TipTap+自动保存） | ✅ tag v0.4.0 |
| M4 | AI 写作（续写/划词/整章润色） | ✅ 双轨验收+整改+复验完成，**待用户确认后打 tag v0.5.0** |
| M5 | 创世台五步 | ⬜ **下一步** |
| M6+ | 见 docs/plan/roadmap.md（百科/画布/记忆/助手/灵感墙/风格/统计/拆书/Agent/打包） | ⬜ |

Git：main 单分支，12+ 提交，约定式提交（feat/fix/docs/chore）。里程碑必须走完验收才能 tag。

## 3. 新会话开工 SOP（按序执行）

1. 读本文档 + `docs/worklog/worklog.md` 最后一节（最新进展与断点）
2. 读 `docs/plan/roadmap.md`（下一步的任务定义与技术债）
3. 规范（写代码前必读）：`docs/standards/coding-standards.md`；文档怎么写：`docs/standards/documentation-standards.md`
4. 环境验证：`npm run dev` 能弹窗即环境正常（首次装依赖见第 6 节踩坑）
5. 干活：小步快跑，**每完成一小块就 commit**（防会话中断丢工作）
6. 里程碑完成：自测 → 双轨验收（见第 5 节）→ 请用户确认 → tag → 更新 worklog/roadmap/本文档

## 4. 架构速览（详见 docs/design/architecture.md）

```
Electron(main: db/ ai/ ipc/) ←IPC(preload 白名单桥)→ Vue3 渲染层(views/components/stores/services)
```
- 数据：better-sqlite3（WAL+FK 级联+schema_migrations 版本迁移），库文件在 %APPDATA%/inkspire-desktop/inkspire.sqlite，当前 v3（books/api_profiles/settings/chapters）
- AI：`src/main/ai/` Provider 抽象+注册表，唯一实现 openai-compatible（SSE 流式+reasoning 透传+abort）。IPC `ai:chat-stream`（requestId+事件回推）；渲染层封装 `services/ai.ts`（先订阅+队列缓冲防竞态）
- UI：Tailwind 4 @theme 令牌（紫罗兰主题 #6c5ce7），弹窗/Toast/确认框组件可复用（components/）
- 类型：IPC 契约全部在 `src/shared/`，两侧共用；tsc 双配置（node/web）都要过

## 5. 验收流程（双轨，详见 docs/standards/acceptance-workflow.md）

1. 开发自测：`INKSPIRE_SELFTEST=1 npm run dev -- --remote-debugging-port=9222`，然后写 node 脚本连 CDP（ws://…9222）驱动真实应用（参考 scripts/cdp-m2-test.mjs 的 WebSocket 写法）
2. 双轨验收：
   - **ox-alpha 静态审查**：准备材料 md（验收点+自测声明+实现定位）→ `node scripts/accept-via-llm.mjs <材料.md>`（输出存 docs/acceptance/llm-review-*.md）
   - **黑盒子代理**：Agent(general-purpose)，提示词含验收点清单+CDP 方法+「自建自清测试数据+结束 taskkill electron」纪律
3. 任一不通过即不通过；整改后复验；用户确认 → tag
4. 验收报告、材料全部入库

## 6. 踩坑速查（按时间累积，新模型必读）

1. npm 11 allow-scripts 拦截安装脚本：`npm approve-scripts <pkg>`；Electron 二进制被拦后手动 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`（注意镜像 URL 拼写，错了会 zip 校验失败）
2. TS7：`include` 不能写进 compilerOptions；`baseUrl` 已移除；.vue/.css 需要 env.d.ts 声明
3. .npmrc 写 electron_mirror 会持续告警——不要写，用环境变量
4. better-sqlite3 13 用 NAPI prebuilds 跨 ABI，无需 node-gyp rebuild（install-app-deps 失败可无视）
5. ox-alpha：非流式返回空白体；流式对 >2 万字输入也空。**方案：diff 限 1.5 万字+stream:true**
6. Vue3 v-for 内字符串 ref 是数组→用函数式 ref（Map 收集）
7. TipTap 切换内容不清 undo 历史→用 :key=章节id 整体重建编辑器组件
8. mock 测试不能替代真实链路（M1 的 P0 教训）：写路径必须进 selftest/CDP 实测
9. CDP 驱动 Electron：`npm run dev -- --remote-debugging-port=9222`，`fetch http://127.0.0.1:9222/json` 找页面，原生 WebSocket 调 Runtime.evaluate（awaitPromise:true）
10. CSP 里 connect-src 'self'：渲染层不能直接请求外部 API（本来也禁止，全部走主进程）

## 7. 凭据与外部资源

- **TokenRhythm**（基元律动）：https://tokenrhythm.studio/v1，key 在系统环境变量 `TOKENRHYTHM_API_KEY`。应用数据库里已预置档案「基元律动（ZCode 同款）」（deepseek-v4-flash，默认档案）
- **OpenRouter**：key 在 ZCode 配置 `~/.zcode/v2/config.json` 的 provider「OpenRouter」（accept-via-llm.mjs 自动读取）；模型 `stealth/ox-alpha`
- **铁律：任何 key 不得写入 git 文件/日志/文档**（.gitignore 已排除 .env；验收报告打印前脱敏）
- UI 参考截图：refs/（10 张官网截图）；配色已校准为紫罗兰系（#6c5ce7）

## 8. 用户协作须知

- 用户已确认 M0–M3；每里程碑要给「亲手验证指引」（点哪里、输入什么、预期什么）
- 用户要求：留扩展余地（Provider 抽象已就位）；UI 先还原原站（截图为据）；详细解释选项（小白）
- 用户可能随时切换模型：靠本文档+worklog 无缝接力，**会话结束前必须追加 worklog**

## 9. 下一步任务（M5 创世台 + M4 收尾）

**M4 已双轨验收闭环**（静态审查 deepseek-v4-pro 代理 + 黑盒子代理，两份报告+整改+复验证据见 docs/acceptance/）。待办：
1. 用户确认 M4 → `git tag v0.5.0-m4-ai-writing`
2. **M5 创世台五步**（MVP 收官）：定风（风格包，M12 前可先做占位选择）→定魂（Logline）→造世（世界观）→布局（大纲）→执笔。数据表 genesis_steps 已规划于 architecture.md。五步向导 UI + AI 冷启动（复用 M4 的 generateWriting 管线，提示词换成各步专用）。入口：书斋卡片/工作台加「创世台」按钮。
3. MVP 完成后建议尽早做 **M16 打包**（用户能先用上），再继续 M6+ 功能

**M4 遗留技术细节（供 M5 参考）**：
- AI 生成并发管理：isBusy 锁生命周期必须覆盖到 onDone/onError（chatStream 建立即 resolve）；generationSeq 作废机制防竞态
- 面板复用：连续发起需显式 panel.reset()
- AI 输出转 HTML：aiTextToHtml（换行分段+转义）
- **验收模型现状**：ox-alpha 当日不稳定（空回复）；OpenRouter 无付费 credits（402）；静态审查暂用 TokenRhythm deepseek-v4-pro 代理（--base-url --key-env 参数）

## 10. 快速命令

```bash
npm run dev                                        # 开发（弹应用窗口）
npm run dev -- --remote-debugging-port=9222        # 带 CDP 的开发（自动化测试用）
npx tsc --noEmit -p tsconfig.node.json             # 类型检查（两个都要过）
npx tsc --noEmit -p tsconfig.web.json
node scripts/accept-via-llm.mjs <材料.md>           # ox-alpha 静态审查
npm run dist                                       # 打 NSIS 安装包（M16 验证）
```
