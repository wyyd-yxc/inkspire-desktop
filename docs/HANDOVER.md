# 项目交接文档（HANDOVER）

> **新会话/新模型开工第一入口**。本文件始终保持「随时可交接」状态，每次里程碑收尾后更新。
> 最后更新：2026-08-23 · 会话 17 · **M5 创世台+用户反馈修复全部完成（双轨验收通过），待用户确认打 tag v0.6.0。下一步 M16 打包。**

## 0. 移交摘要（新模型 60 秒读完）

- M0-M5 全部开发完成并双轨验收通过；M5 用户反馈修复（设定未注入AI续写/提示词昵称泄漏/采纳容错）也已验收通过
- **唯一待办**：用户确认 M5 修复后打 tag `v0.6.0-m5-genesis`（用户说「先不打 tag」，需等用户明确指示）
- **下一步**：M16 打包 NSIS 安装包（让用户装到电脑上日常用），然后继续 M6+ 功能模块
- 项目无未保存工作：git 干净，34 提交 5 tag（v0.1.0~v0.5.0）
- 你能跑 `npm run dev` 验证环境；测试方法见第 5 节；所有坑见第 6 节

## 1. 项目是什么

复刻 inkspires.cn（墨灵小说，AI 网文创作工作台）为 **Windows 桌面应用**：本地 SQLite 存数据 + 用户自定义 AI API（OpenAI 兼容协议）。最终交付 NSIS 安装包。用户是编程小白，全程中文沟通，需要通俗解释。

## 2. 当前状态（截至本文件更新时）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 脚手架+文档规范体系 | ✅ tag v0.1.0 |
| M1 | 书斋（书籍 CRUD） | ✅ tag v0.2.0 |
| M2 | 设置中心（AI Provider+API 档案） | ✅ tag v0.3.0 |
| M3 | 正文工作台（章节树+TipTap+自动保存） | ✅ tag v0.4.0 |
| M4 | AI 写作（续写/划词/整章润色） | ✅ tag v0.5.0 |
| M5 | 创世台五步（定风/定魂/造世/布局/执笔）+接通AI写作 | ✅ 开发+双轨验收+用户反馈修复全完成，**待用户确认打 tag v0.6.0** |
| M6+ | 万物百科/章节画布/作品记忆/墨灵助手/灵感墙/风格包/统计/拆书/Agent偏好 | ⬜ |
| M16 | 打包 NSIS 安装包 | ⬜ **M5 确认后立即做** |
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
5. ox-alpha：非流式返回空白体；流式对 >2 万字输入也空。**方案：diff 限 1.5 万字+stream:true**。ox-alpha 近期服务不稳定，静态审查暂用 TokenRhythm deepseek-v4-pro 代理（`--base-url --key-env` 参数）。OpenRouter 账户无付费 credits（402）
6. Vue3 v-for 内字符串 ref 是数组→用函数式 ref（Map 收集）
7. TipTap 切换内容不清 undo 历史→用 :key=章节id 整体重建编辑器组件
8. mock 测试不能替代真实链路（M1 的 P0 教训）：写路径必须进 selftest/CDP 实测
9. CDP 驱动 Electron：`npm run dev -- --remote-debugging-port=9222`，`fetch http://127.0.0.1:9222/json` 找页面，原生 WebSocket 调 Runtime.evaluate（awaitPromise:true）
10. CSP 里 connect-src 'self'：渲染层不能直接请求外部 API（本来也禁止，全部走主进程）
11. **Vue reactive Proxy 无法跨 IPC 结构化克隆**（M5 P0）：凡 Vue 组件内把 ref/reactive 对象传给 window.api.*（IPC），必须先 `JSON.parse(JSON.stringify(toRaw(data)))` 去响应式，否则抛 "An object could not be cloned." 静默失败
12. **rAF 节流冻结**（M4）：窗口后台/失焦时 requestAnimationFrame 不执行 → 用 nextTick（微任务）+ 主进程 `backgroundThrottling: false`
13. **HMR 状态污染**（M3/M4）：改编辑器/生成相关代码后必须完全重启 dev 再测（taskkill electron 后重启），否则 onUpdate→保存链路可能假性失效
14. **AI 生成并发锁生命周期**（M4）：chatStream 会话建立即 resolve，并发锁（isBusy）必须覆盖到 onDone/onError 才释放；generationSeq 序号防竞态
15. **漏 import 导致静默失败**（M5 修复阻断级）：ChapterEditor.vue 用了 isElectron 但未 import，loadGenesis 抛 ReferenceError 被 `void` 吞掉。**教训：凡用 isElectron 必须显式 import（全仓 6 个文件都 import 了）；catch 块不要全静默，至少 console.warn；验收不能用「续写含关键词」间接判定 genesis 注入（关键词可能来自 book.description）**
16. **提示词不要用内部流程术语**（M5 修复）：定风/定魂/造世/布局/执笔是 UI 步骤名，不能写进发给 AI 的 prompt，否则 AI 把它当故事概念写进输出

## 7. 凭据与外部资源

- **TokenRhythm**（基元律动）：https://tokenrhythm.studio/v1，key 在系统环境变量 `TOKENRHYTHM_API_KEY`。应用数据库里已预置档案「基元律动（ZCode 同款）」（deepseek-v4-flash，默认档案）
- **OpenRouter**：key 在 ZCode 配置 `~/.zcode/v2/config.json` 的 provider「OpenRouter」（accept-via-llm.mjs 自动读取）；模型 `stealth/ox-alpha`
- **铁律：任何 key 不得写入 git 文件/日志/文档**（.gitignore 已排除 .env；验收报告打印前脱敏）
- UI 参考截图：refs/（10 张官网截图）；配色已校准为紫罗兰系（#6c5ce7）

## 8. 用户协作须知

- 用户已确认 M0–M3；每里程碑要给「亲手验证指引」（点哪里、输入什么、预期什么）
- 用户要求：留扩展余地（Provider 抽象已就位）；UI 先还原原站（截图为据）；详细解释选项（小白）
- 用户可能随时切换模型：靠本文档+worklog 无缝接力，**会话结束前必须追加 worklog**

## 9. 下一步任务（M16 打包 + M6+ 功能）

**M5 已全部完成（含用户反馈修复），待用户确认打 tag v0.6.0**。用户说「先不打 tag」，新模型开工后：
1. 询问用户是否确认 M5 → 若确认则 `git tag v0.6.0-m5-genesis`
2. **M16 打包 NSIS 安装包**（优先，让用户装上日常用）：
   - `npm run dist`（electron-builder，配置在 electron-builder.yml，NSIS 目标）
   - 注意 better-sqlite3 原生模块打包：asarUnpack 可能需要调整；electron-builder install-app-deps 对 better-sqlite3 的 node-gyp rebuild 会失败（无 VS 编译环境），但 NAPI prebuilds 应能直接打入
   - 产出 InkSpire-Setup-0.1.0.exe（或当前版本号）
   - 验收：全新 Windows 机器双击安装 → 建书→设定→AI 写一章 全程无报错
   - 数据目录 userData 与安装目录解耦，升级不丢数据
3. **M6 万物百科**：wiki_entries 表（migration v5）；词条 CRUD（人物/地点/势力/物品/规则）；AI 写作时自动注入相关词条；M5 造世冷启动生成的设定从 genesis_steps 迁移到 wiki_entries
4. 后续 M7-M15 见 roadmap

**M5 关键技术细节（供 M6 参考）**：
- AI 生成并发管理：isBusy 锁生命周期必须覆盖到 onDone/onError；generationSeq 作废机制防竞态
- 面板复用：连续发起需显式 panel.reset()
- AI 输出转 HTML：aiTextToHtml（换行分段+转义）
- 创世台设定注入：ChapterEditor.loadGenesis → genesisCache → writingContext.genesis → systemPrompt
- 提示词不要用内部流程术语（定风/定魂等），用面向故事的中性描述
- **验收模型现状**：ox-alpha 不稳定；OpenRouter 无付费 credits；静态审查用 TokenRhythm deepseek-v4-pro 代理

**M5 用户反馈修复记录（commit f031cfa + 7ba4446，详见 worklog 会话 17）**：
- 阻断：isElectron 未 import 导致设定从未注入（此前验收假阳性）
- 提示词昵称泄漏 → 去昵称
- parseSoulAssist 容错 + 字段降级
- acceptSoulAssist 字段级合并
- s.cheat 可选链 + loadGenesis 切书竞态 + rules 零值判断

## 10. 快速命令

```bash
npm run dev                                        # 开发（弹应用窗口）
npm run dev -- --remote-debugging-port=9222        # 带 CDP 的开发（自动化测试用）
npx tsc --noEmit -p tsconfig.node.json             # 类型检查（两个都要过）
npx tsc --noEmit -p tsconfig.web.json
node scripts/accept-via-llm.mjs <材料.md>           # ox-alpha 静态审查
npm run dist                                       # 打 NSIS 安装包（M16 验证）
```
