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

结论：有条件通过（llm-review-2026-09-12-15-56-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 高危：agentSlots.ts 核心逻辑未出现在 diff | **diff 截断，材料补全** | 文件已随 6fee266 提交（typecheck 三重闸门依赖其存在）；全文入附录 B 供静态验证 |
| 中危：onPick 全局守卫与行级禁用不一致（保存期间改其他槽被静默吞） | **采纳，真问题** | 已修复：保存期间禁用全部下拉（`:disabled="saving !== ''"`），与全局守卫一致——不存在可交互但被吞的状态 |
| 中危：ChapterEditor 分流疑点（polish/expand 疑含整章语义） | **误报（枚举不可见）** | PanelKind = 'continue' \| SelectionAction \| 'chapter-polish'，SelectionAction = 'polish'\|'expand'\|'rewrite' 仅来自划词浮条 startSelectionAction；整章润色是独立 kind 'chapter-polish'→writing。两枚举定义摘录附录 B 佐证，分流精确无歧义 |
| 无法判定：FK CASCADE 运行状态 | 运行时证据 | T8 实证：删档案 B 后绑定行 3→0；foreign_keys=ON 源码位置 database.ts getDb（M0 起既有，M12 r1 已裁定过同一主题） |
| 无法判定：t1 断言真实性 | 运行时/黑盒范围 | 假服务器路由断言属运行时实证；黑盒将复验真实 UI 路径 |

## 附录 B：核心源码事实（r1 截断补全）

### services/agentSlots.ts（全文）

```ts
/** 解析槽位应使用的档案：槽位绑定 → 默认档案 → 第一个档案 → 报错 */
export async function resolveProfileForSlot(slot: AgentSlot): Promise<ApiProfile> {
  if (!isElectron) throw new Error('AI 功能仅支持在应用内使用')
  const [listRes, defRes, bindRes] = await Promise.all([
    window.api.apiProfiles.list(),
    window.api.settings.get<string>('ai.default_profile_id', ''),
    window.api.bindings.list()
  ])
  if (!listRes.ok) throw new Error(listRes.error)
  if (!defRes.ok) throw new Error(defRes.error)
  if (!bindRes.ok) throw new Error(bindRes.error)
  const profiles = listRes.data
  if (profiles.length === 0) {
    throw new Error('还没有可用的 AI 档案，请先到「设置」配置 API')
  }
  // 槽位绑定优先；绑定指向的档案已删（理论上 FK 已清行，防御性校验）则继续回落
  const bound = bindRes.data.find((b) => b.slot === slot)
  if (bound) {
    const hit = profiles.find((p) => p.id === bound.profileId)
    if (hit) return hit
  }
  return profiles.find((p) => p.id === defRes.data) ?? profiles[0]
}
```

### ChapterEditor 槽位分流佐证（枚举定义）

```ts
// ChapterEditor.vue:280
type PanelKind = 'continue' | SelectionAction | 'chapter-polish'
// aiWriting.ts:115
export type SelectionAction = 'polish' | 'expand' | 'rewrite'
// 划词浮条（:650-652）startSelectionAction('polish'/'expand'/'rewrite') 是 SelectionAction 唯一来源；
// 整章润色按钮（:610）固定 'chapter-polish'，AI 续写按钮（:637）固定 'continue'
```

### FK 级联依据（database.ts getDb，M0 起既有）

```ts
db.pragma('foreign_keys = ON') // 启用外键级联（删书连带删章节）
```

## 附录 A2：r2 裁定（glm-5.1，2026-09-12）

结论：有条件通过（llm-review-2026-09-12-16-02-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 低：零档案时 8 个仅含「跟随默认」的无效下拉仍渲染 | **采纳** | 已改：8 行区域 `v-else`（profiles 为空时仅显示引导文案，不渲染下拉） |
| 低：ChapterEditor 分流字面量比对，新增 SelectionAction 成员会静默错槽 | **采纳（升级为编译期穷尽）** | 改为 `KIND_SLOT: Record<PanelKind, AgentSlot>` 穷尽映射——Record 键完整性使新增 kind 漏配槽位时 typecheck 直接报错（比建议的类型守卫更强） |
| 疑点：diff 严重截断（agentSlots 全文/签名变更/调用点散落） | **材料补全** | 附录 B 增 generateWriting 签名变更与 14 调用点归槽清单（file:line→slot 对照）；归槽完备性由必传参数+typecheck 三重闸门保证 |
| 无法判定：FK CASCADE/断言真实性等运行时项 | 黑盒范围 | 同 r1，T8 已实证 |

### generateWriting 签名变更与调用点归槽清单（r2 补全）

```ts
// aiWriting.ts（签名：第三参必传，编译期强制调用方显式归槽）
export async function generateWriting(
  messages: ChatMessage[],
  handlers: StreamHandlers,
  slot: AgentSlot
): Promise<{ session: StreamSession; profileName: string }> {
  const profile = await resolveProfileForSlot(slot)
  ...
}
```

14 调用点归槽对照（grep `generateWriting(` 全集，无遗漏）：

| 调用点 | slot |
|---|---|
| components/ChapterEditor.vue（runGeneration，KIND_SLOT 映射） | selection（polish/expand/rewrite）/ writing（continue/chapter-polish） |
| composables/useMemorySync.ts:101、:304 | extract |
| composables/useWikiCleanup.ts:112 | extract |
| composables/useAutoSync.ts:392（静默档 collectAi） | extract |
| composables/usePlotAi.ts:176 | plot |
| composables/useReverseSync.ts:115 | extract |
| composables/useWikiSync.ts:103 | extract |
| composables/usePlotSync.ts:82 | extract |
| views/GenesisView.vue:192、:255 | genesis |
| views/WikiView.vue:296 | extract |
| views/CanvasView.vue:448（场景节点） | scene |
| views/CanvasView.vue:586（按场景生成正文） | writing |

非 generateWriting 的 chatStream 直调：AssistantDock（assistant 槽，本地副本已删）、StyleDigestDialog（digest 槽）、SettingsView.quickTest 与 ApiProfileDialog.test（显式被测档案，不经槽位）。

## 附录 A3：r3 裁定（glm-5.1，2026-09-12）

结论：有条件通过（llm-review-2026-09-12-16-09-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中危：保存失败时未刷新，下拉显示值与库真实绑定割裂 | **采纳** | catch 块追加 `await load()` 回拉真实状态重置 DOM |
| 低：IPC 边界 slot 参数标注 AgentSlot 类型「掩盖跨进程类型丢失」 | **不采纳（项目惯例）** | 全项目 IPC handler 均直接标注共享类型（styles/plot/inspirations 等十余通道同型）+运行时白名单校验（AGENT_SLOTS.includes+UUID_RE 兜底）；单机信任边界内的一致约定，M2 起 static 审查从未要求改为 string |
| 低：每次生成 3 次本地 IPC 查询开销 | **不采纳（权衡留档）** | 原 resolveProfile 本就每次 2 次 IPC；本地 better-sqlite3 IPC 亚毫秒级，生成请求秒级网络耗时面前可忽略；引入缓存需与档案增删/绑定变更联动失效，复杂度不划算——性能留档不排期 |
| 低：材料笔误 composposables | **采纳** | 已更正 |
| 无法判定：调用点完备性/FK 运行时/断言真实性 | 附录 B 清单+typecheck 必传参数保证；T8/黑盒实证 | 同前 |

## 附录 A4：r4 裁定（glm-5.1，2026-09-12）

结论：有条件通过（llm-review-2026-09-12-16-11-.md）。余项收敛至 2 低危。

| 项 | 裁定 | 处理 |
|---|---|---|
| 低：默认档案名显示误导（指向已删档案时把第一个档案名当默认名展示） | **采纳（诚实标注）** | 改为三态：指向有效档案→「当前：X」；未设/指向已删→「未指向有效档案，实际回落「第一个档案名」」；与 resolveProfileForSlot 实际回落行为一致 |
| 低：setBinding 校验与写入间 TOCTOU 竞态 | **不采纳（沿 M13 r2 同口径）** | better-sqlite3 同步执行，getProfile 校验与 INSERT 在同一同步调用栈内完成，无并发窗口；渲染层 IPC 顺序处理；即便理论错档也有 resolveProfileForSlot 防御性校验兜底不崩 |

## 附录 A5：r5 裁定（glm-5.1，2026-09-12）

结论：有条件通过（llm-review-2026-09-12-16-14-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中危（材料疑点）：diff 截断致归槽清单不可静态复核，疑「绕过 generateWriting 直调 chatStream」 | **证据补全，非缺陷** | chatStream 直调全集 grep 证据（下方）；typecheck 必传参数是全仓编译期保障（任何漏传 slot 的调用在 tsc 即失败，不依赖审查员逐文件核对） |
| 低：IPC 边界 AgentSlot 类型注解 | **维持 r3 不采纳** | 项目级惯例（十余通道同型+运行时白名单），单机信任边界内一致约定 |
| 低：toBinding `as AgentSlot` 不安全断言 | **采纳（惯例对齐）** | 改白名单回退式守卫（inspirations/styles DAO 同惯例）：非法 slot 行跳过不返回 |

### chatStream 直调全集 grep 证据（排除 generateWriting 通道外无遗漏）

```
grep -rn "chatStream(" src/renderer/src --include="*.vue" --include="*.ts"
→ services/ai.ts（定义）、services/aiWriting.ts（generateWriting 内唯一入口）
→ components/AssistantDock.vue（assistant 槽）
→ components/settings/StyleDigestDialog.vue（digest 槽）
→ views/SettingsView.vue quickTest、components/ApiProfileDialog.vue test（显式被测档案，连通测试语义不经槽位）
```

## 附录 C：黑盒验收结果

（待黑盒后填写）
