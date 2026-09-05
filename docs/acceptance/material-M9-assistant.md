# M9 墨灵助手 — 验收材料

## 范围
M9 交付墨灵助手（v1 仅正文工作台）：浮球+聊天面板+流式+上下文感知+@召唤+对话持久化。

## 验收点
1. **浮球与面板**：右下角浮球（墨灵 Logo）→ 点击展开右侧 400px 聊天面板 → ✕ 收起
2. **流式对话**：输入消息 → 发送 → AI 流式逐字回复 → busy 锁+停止按钮
3. **上下文感知**：system 自动携带当前章节标题+正文截断（2000 字）
4. **@召唤**：输入 @ → 百科词条选择器弹出 → 点击选择 → chips 显示 → 发送时注入词条设定
5. **选区感知**：选中正文文字后提问 → 选区自动附加
6. **对话持久化**：对话历史存 DB（最近 50 条）→ 重启不丢 → 清空按钮
7. **入口**：仅正文工作台（v1 设计决策）

## 开发自测声明（CDP 真实 UI，tmp/m9-verify.mjs）
- 浮球→面板→流式回复 1117 字→@ 选择器弹出→DB 持久化 2 条→清空归零 全过 ✓
- typecheck 三重闸门 ✓

## 实现定位
- shared/assistant.types.ts、main/db/{database(v9),assistantMessages}.ts、main/ipc/assistant.ts、preload
- renderer/components/AssistantDock.vue（核心组件）、views/WorkspaceView.vue（挂载+selectionText 桥接）
- components/ChapterEditor.vue（emit selection-change）

## 设计边界（v1 决策已确认）
不做：联网搜索、工具调用、思考模式档位、多会话切换、全局浮球（后续版本）。@ 选择器仅在输入末尾 @ 时触发。对话历史单会话/书。

## 已知边界
- 对话上下文窗口限制为最近 20 条（超出早期消息不参与 AI 上下文，但 DB 仍完整保存）
- systemPrompt 无创世台设定注入（创世台设定通过 props.book 传递书籍元信息，创世台详细设定可后续版本加入）
