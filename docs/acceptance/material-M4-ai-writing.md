# M4 AI 写作 — 验收材料

## 里程碑与范围

M4 交付编辑器 AI 写作能力（MVP 最后一块核心拼图）：AI 续写、划词三操作（润色/扩写/改写）、整章润色，全部流式输出、可中断、预览后采纳。

## 验收点（roadmap 定义）

1. **AI 续写**：状态栏「✦ AI 续写」→ 流式逐字预览（面板）→「采纳插入」追加到正文末尾 → 自动保存落库；生成中可「停止」；可「重写」
2. **划词操作**：选中文字 → 浮条（润色/扩写/改写）→ 流式生成 → 采纳后**仅替换选区**，选区外文字保持不变
3. **整章润色**：标题栏「✧ 整章润色」→ 流式生成（正文不被中途改动）→ 采纳后整章替换
4. **上下文**：提示词包含书名/题材/简介 + 章节标题 + 前文尾部（截断至 3000 字）；system 约束输出纯正文
5. **并发与中断**：生成中锁 busy（重复点击被拦）；停止/关闭面板/切换章节/组件卸载均正确中止
6. **持久化**：采纳后的内容经自动保存链路（防抖 1.5s/Ctrl+S/切章 flush）落库，重启保留

## 开发自测声明（CDP 驱动真实 Electron，测试脚本 tmp/m4-verify.mjs、tmp/m4-selection-test.mjs）

- 续写全链路：点击「AI 续写」→ 170+ 个 chunk 流式到达面板 → ready → 采纳 → 正文 19→592 字符 → flushSave 落库 569 字（wordCount 精确）
- 划词：DOM Range 选中「他走进房间。」→ 浮条出现 → 润色 → 采纳 → 选区替换为「他推开房门，脚步在空旷的地板上落出沉闷的回响。」，选区外「房间很大。」保留 → 落库 43 字
- 整章润色与划词共用同一面板管线（acceptGeneration 的 setContent 分支），未单独实测（验收时请补）
- typecheck（node/web）双 0

## 实现要点（供代码审查定位）

- `src/renderer/src/services/aiWriting.ts`：提示词构造 + resolveProfile（默认档案→第一个→引导报错）
- `src/renderer/src/components/AiWritingPanel.vue`：面板（generating/ready 态、append/finish/fail 暴露、停止/重写/采纳）
- `src/renderer/src/components/ChapterEditor.vue`：runGeneration（nextTick 调度+busy 锁）、划词浮条（selectionUpdate+coordsAtPos 定位+mousedown.prevent）、acceptGeneration（continue=文末/chapter-polish=setContent/selection=deleteRange+insertContentAt）、closePanel/stopGeneration 中止
- `src/main/index.ts`：backgroundThrottling: false（配合窗口后台场景）
- 复用：services/ai.ts（流订阅队列缓冲）、ipc/ai.ts（requestId+事件回推+5min 硬超时）

## 关键修复记录（M4 期间）

1. **rAF 节流冻结**：窗口后台时 requestAnimationFrame 不执行 → 生成永不启动。修复：nextTick + backgroundThrottling:false
2. HMR 状态污染：编辑器相关改动后必须完全重启再测（已记入踩坑速查）

## 已知边界（登记在案，非缺陷）

- 续写为「面板预览+采纳」模式，非原站的行内幽灵文字（后续里程碑可升级）
- 生成质量取决于用户配置的模型（当前默认档案 deepseek-v4-flash）
- 推理模型的思考链（reasoning 事件）不进预览，仅正文显示
- AI 功能强制要求 Electron 环境（浏览器 mock 模式不可用，会明确报错）
