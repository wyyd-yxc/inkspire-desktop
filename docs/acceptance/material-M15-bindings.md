# M15 验收材料（Agent 模型偏好：功能槽位绑定档案）

- 日期：2026-09-12 · 会话 42
- diff 基准：`v0.19.0-m14-digest`（静态审查请显式 `--base v0.19.0-m14-digest`）
- 关键提交：91cb785（执行卡实证）、c3a0204（数据层）、6fee266（解析收敛）、c18cbb3（设置分区）

## 范围

1. **migration v15**：`agent_bindings(slot TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES api_profiles(id) ON DELETE CASCADE)`——一槽位至多一行；表内无行=「跟随默认」；**删档案经 FK CASCADE 自动清绑定**（foreign_keys=ON 已在 getDb 设置），无需改 deleteProfile。
2. **shared/agent.types.ts**：AgentSlot 8 槽位联合类型（writing/selection/genesis/plot/scene/extract/assistant/digest）+ AGENT_SLOTS 白名单常量 + AGENT_SLOT_LABELS 中文标签 + AGENT_SLOT_HINTS 说明 + AgentBinding 实体。
3. **bindings DAO/IPC/preload**：listBindings（ORDER BY slot）+ setBinding(slot, profileId|'')（slot 白名单校验；''=删行回落；非空先 getProfile 验存在再 upsert）；IPC 两通道（bindings:list / bindings:set，slot 白名单+profileId UUID-or-空校验+wrap）；preload bindings 组。
4. **解析收敛** `services/agentSlots.ts`：`resolveProfileForSlot(slot)`——槽位绑定（且档案存在，防御性校验）→ 默认档案 → 第一个档案 → 报错。**旧解析点清零**：aiWriting.resolveProfile 删除；AssistantDock 本地副本（唯一重复实现，缺 isElectron 守卫）删除；StyleDigestDialog 改走 digest 槽。
5. **generateWriting 增必传 slot 参数**：14 个调用点编译期强制显式归槽——ChapterEditor 按 kind 分流（划词三动作→selection，续写/整章润色→writing）；GenesisView×2→genesis；CanvasView 场景节点生成→scene、按场景生成正文→writing（沿 M12 注入口径）；usePlotAi→plot；useWikiSync/useWikiCleanup/useMemorySync×2/usePlotSync/useReverseSync/useAutoSync（自动同步静默档）+WikiView 词条生成→extract（按域归入）。SettingsView.quickTest 与 ApiProfileDialog.test 显式传被测档案（连通测试语义），**不经槽位**。
6. **设置分区** `SlotBindingsSection.vue`（≈110 行守 400 规）：8 行槽位（中文标签+覆盖功能说明）+下拉「跟随默认/各档案（模型名）」**即改即存**；说明行显示当前默认档案名；零档案空态引导；插入 SettingsView 风格包分区之后。

## 验收点

1. 两档案不同模型时，各槽位请求路由到各自绑定档案（抓请求 model 名实证；情节大纲 AI 与助手各走各的）
2. 未绑定槽位回落默认；`bindings:set(slot,'')` 删绑定回落
3. 删除档案后对应槽位绑定级联清零（FK CASCADE）、回落默认不报错
4. 绑定重启持久（reload 复验）
5. 设置分区 8 行渲染+即改即存（UI 改槽→bindings:list 变化→改回跟随默认→行删除）
6. typecheck 三重闸门+console 零报错+自测零外部 AI 消耗

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron（9222），**本地假 OpenAI 服务器（127.0.0.1:18926）双档案路由断言，外部 AI 消耗 0**，测试数据自建自清。

- **tmp/m15-t1.mjs 19/19**：
  - T1 未绑定回落：续写请求 model=m15-model-a（默认档案 A）
  - T2 设置分区：8 行下拉含「跟随默认」；UI 改 writing→B 即改即存入库；UI 改回跟随默认→行删除
  - T3 plot 绑定 B→情节画布「初始化→开始生成」请求 model=m15-model-b（同轮 writing 未绑定仍 model-a，见 T1/T8）
  - T4 assistant 绑定 B→浮球面板发消息→model-b
  - T5 extract 绑定 B→设定集「从正文提取→开始提取」→model-b
  - T6 digest 绑定 B→拆书全链路（win-helper 驱动原生对话框）→拆解请求 model-b→候选面板→生成风格包
  - T7 bindings:set('plot','')→情节生成回落 model-a
  - T8 删档案 B→绑定行 3→0（FK 级联）→续写回落 model-a 不报错
  - T9 绑定 selection→A 后 reload 持久
  - 全程 console 零报错；一次性覆盖 5 个槽位的路由断言（genesis/scene 与 plot 同构——同一 resolveProfileForSlot 通道、同参数形态，由编译期必传参数保证归槽）
- **测试脚本教训**：①浮球是 `<button title="写作助手…">` 而非 div（按 title 定位）；②弹窗内按钮匹配必须限定 teleport 弹窗范围（document 级匹配会命中页面同名打开器——「从正文提取」教训）；③假服务器需按请求特征（system 含「文风分析师」）分流返回拆解 JSON，否则拆书解析失败——沿用 M14 两教训（BOM/SSE 转义）。

## 已知边界

- 槽位级温度/参数覆盖不做（params 跟档案走）；按书绑定不做（全局槽位）；23 Agent 实体与自定义提示词不做（任务卡不做清单）
- 连通测试（档案行内测试/编辑器测试）显式传档案，不经槽位路由（语义如此）
- 「跟随默认」的默认档案变更（设置里切换默认）即时生效于后续生成，无需清槽位
- 删默认档案的既有回落（默认→第一档案）语义不变；槽位绑定指向被删档案由 FK 级联清行，防御性校验兜底

> 审查模型沿用 glm-5.1。**依赖**：无外部依赖；被 M16 打包发布覆盖。

## 附录 A：r1 整改与裁定（glm-5.1，2026-09-12）

（待静态审查后填写）

## 附录 B：黑盒验收结果

（待黑盒后填写）
