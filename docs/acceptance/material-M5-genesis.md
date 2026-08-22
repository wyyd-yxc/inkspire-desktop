# M5 创世台五步 — 验收材料

## 里程碑与范围
M5 交付创世台五步向导（定风/定魂/造世/布局/执笔），是 MVP 收官。设定接通 M4 AI 写作，让续写/润色真正用上世界观设定。

## 验收点
1. **五步向导**：步骤条可跳转、完成打勾；每步独立保存（UPSERT）；重启不丢
2. **定风**：5 个预设风格包卡片，点击绑定，可更换
3. **定魂**：一句话+三大支柱（题材/金手指/冲突）表单；「AI 辅助起草」流式生成 JSON 并填表
4. **造世冷启动**：基于定魂内容真实 AI 生成四段（全书大纲/第一卷大纲/世界法则/主角设定），采纳后落库展示
5. **布局**：分卷+章节大纲增删编辑；写作规则（目标字数/禁忌/写法）
6. **执笔**：跳转正文工作台，提示前四步已就绪
7. **接通 M4**：创世台设定（文风 promptHint + 定魂 logline/支柱 + 写作规则）注入 AI 续写 systemPrompt，AI 输出紧扣设定
8. **入口**：书斋卡片「创世台」按钮、工作台侧栏「创世台」链接

## 开发自测声明（CDP 真实 Electron，tmp/m5-verify.mjs）
- 五步全走通：定风绑定/定魂保存/布局保存（IPC 直接存，isDone=true）
- 造世冷启动：真实 AI 生成四段→采纳→step3 落库（hasData=true, isDone=true）
- 持久化：genesis.get 返回 4 步全部 done+hasData
- 设定注入：续写 579 字，内容含「陈默/剑灵/灵力/封印」（来自定魂与文风约束）✓
- typecheck 双 0

## 实现定位
- shared/{genesis.types,presetStyles}.ts：类型+预设风格包
- main/db/{database(migration v4),genesis}.ts、main/ipc/genesis.ts
- renderer/services/genesisPrompts.ts：提示词构造+解析
- renderer/views/GenesisView.vue：五步向导
- renderer/components/ChapterEditor.vue：loadGenesis + writingContext 注入
- renderer/services/aiWriting.ts：systemPrompt 注入 genesis

## 已知边界
- 布局大纲与 M3 章节树不自动同步（M7 章节画布接）
- 万物百科词条管理（M6）；冷启动生成内容暂存 genesis_steps，M6 迁百科
- 定风用预设风格包占位（M14 拆书后换真实风格包）
