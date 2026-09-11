# M14 验收材料（拆书：参考文本 AI 拆解 → 风格包 source_type='digest'）

- 日期：2026-09-11 · 会话 41
- diff 基准：`v0.18.0-m13-stats`（静态审查请显式 `--base v0.18.0-m13-stats`）
- 关键提交：81af3cb（数据面 sourceType）、26e10c1（pick-text 通道）、c7d2681（拆解服务）、644c386（弹窗+入口）

## 范围

1. **styles:create 扩 sourceType**：`CreateStyleProfileInput.sourceType?: StyleSourceType`，DAO `VALID_SOURCE_TYPES`（已有 'manual'/'digest'）白名单校验、缺省/非法回落 'manual'——M12 既有调用方零影响；update 不开放来源修改（来源是创建史实，不可变）。
2. **digest:pick-text 只读通道**（`main/ipc/digest.ts`，执行卡实证修正：渲染层受 CSP 限制无法读本地文件，「零新通道」修正为 +1 只读通道）：dialog 过滤 txt→readFile UTF-8（去 BOM）→截前 2 万字（`DIGEST_TEXT_LIMIT`）→返回 `{fileName, text, totalChars, truncated}`；取消返回 null 不算错误；>10MB 拒绝。**文本仅内存传递：不落库、不落盘、无任何持久化（隐私决策）**。
3. **拆解服务** `services/digestPrompts.ts`：system 文风分析师角色（只拆文笔风格，明确「不要分析情节、人物、世界观」，提示词无内部术语）+ 严格 JSON 约定 `{name, tone, rules[], sample}`；`parseDigestOutput` 首尾大括号截取+`lenientParse` 宽容解析+渲染层白名单清洗（name ≤30 非空/tone ≤100/rules ≤20 条×100 字/sample ≤200——与 DAO sanitizeRules 同口径**双保险**）；`aiWriting.ts` 的 `resolveProfile` 导出复用（默认档案→第一档案）。
4. **StyleDigestDialog 四态流**（components/settings/，≈240 行守 400 规）：
   - import：选择 txt 入口 + UTF-8/截取说明 + 失败信息（保留已选文本可重试）
   - running：文件名+总字数+截取提示、流式实时预览（尾 400 字）、「停止」（abort，代次号 seq 防在途回调竞态——踩坑 #14 同型）
   - review：复用 SyncCandidateDialog（调性 1 项+规则 N 项+样例 1 项，默认全勾，全不勾确认禁用；**主弹窗 overlay 与候选面板互斥渲染，不嵌套**）
   - 落库：勾选项按 key 归位 → `styles:create({sourceType:'digest'})` → 列表刷新显示「拆书」徽标（M12 已预留）→ 关闭即丢弃参考文本
5. **入口**：设置中心风格包分区头部「从参考文本拆解」按钮 + 空态文案更新；digest 包与 manual 包同池参与书绑定与注入（styleContext 不区分来源）。
6. **零新表零迁移**；AI 复用 ai:chat-stream（零新 AI 通道）；preload 增 digest 组（仅 pickText）。

## 验收点

1. 导入参考 txt→AI 拆解→勾选→风格包生成且来源徽标=拆书（source_type='digest' 落库）
2. 该包绑定新书后生成正文风格可感知（真实 AI 特征断言——黑盒覆盖）
3. 全不勾确认禁用/取消/拆解失败均不落库；参考文本重启后无任何残留
4. 超 2 万字截断生效（只取开头）
5. 删 digest 包走既有解绑链路（FK SET NULL 回落）
6. typecheck 三重闸门+console 零报错；AI 用例重试≤3

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron（9222），测试数据自建自清；**外部 AI 消耗 1 次**（T3 真实档案抽查），T1/T2 全程本地假服务器零外部额度。

- **tmp/m14-t1.mjs 主链路 15/15**：原生文件对话框**真实驱动**（win32 消息级自动化：`ComboBoxEx32(1148)→ComboBox(1148)→Edit(1148)` 三层下钻逐字符 WM_CHAR 键入+回车，突破 CDP 不可达原生对话框的限制——tmp/m14-win-helper.ps1）；断言：拆解请求恰 1 条到达假服务器/system=文风分析师角色/参考文本全文注入 user 消息/「不要分析情节」约定在/候选 5 项（调性 1+规则 3+样例 1）默认全勾/确认按钮「生成风格包（5）」/落库 sourceType='digest' 且调性规则样例逐字正确/列表数+1/「拆书」徽标渲染/**未勾选正文零残留（主库+WAL 文件字节级搜索）**
- **tmp/m14-t2.mjs 边界 19/19**：
  - a) 原生对话框 WM_CLOSE 取消 → 停留导入态、不落库
  - b) AI 返回非 JSON → 「无法解析」报错回落导入态（保留已选文本）、不落库
  - c) markdown 围栏+前后杂文本+**值内未转义英文引号** → 容错解析出候选面板；全不勾时确认禁用（生成风格包（0））；取消不落库
  - d) 2.5 万字文件 → running 态 UI 显示「已截取前 2 万字+总字数」；请求 user 消息 20,343 字=脚手架+截后文本（头部标记在、尾部标记不在——**只取开头实证**）
  - e) 拆解中「停止」→ 回导入态提示「已停止拆解」、不落库
  - f) 拆解中直接关闭弹窗 → 重开为全新导入态（无报错残留）、中断不落库
  - g) API 建 digest 包+绑定书 → 删包 → 书自动解绑（FK SET NULL 回归）
  - h) 全程 console 零报错
- **tmp/m14-t3.mjs 真实 AI 抽查 4/4（消耗 1 次调用）**：真实档案（基元律动）拆解公域章回体文本（西游记风格改写段）→ 产出「古典快打白话风」：调性 39 字+6 条叙事规则（人称/句式/动词/对话/描写比例，逐条对应参考文本特征）+样例摘录；候选 8 项全勾落库 digest、重启前清理
- **测试基建教训（新增 2 条）**：①win32 PS1 脚本必须 UTF-8 **带 BOM**（无 BOM 时 PowerShell 5.1 按 GBK 解析，中文字符串损坏）；②假服务器 SSE `data:` 帧的 JSON 字符串内换行必须转义 `\n`（真实 OpenAI 兼容服务器同责），否则主进程解析丢帧——T2 首跑踩到并已在脚本修正

**执行卡偏差披露**：
1. 「零新通道」→ +1 只读通道 digest:pick-text（执行卡已实证修正，渲染层 CSP 限制）
2. review 态以 SyncCandidateDialog **替换**主弹窗 overlay（互斥渲染）而非嵌套——避免双遮罩层叠
3. 「停止」后与失败后参考文本保留在内存供重试（弹窗未关即未弃），关闭弹窗即丢弃——隐私承诺口径为「不落库不持久」，与执行卡一致

## 已知边界

- 编码仅 UTF-8：GBK 等编码乱码由用户转码（UI 注明）；无自动检测
- sample 为 AI 摘录：提示词要求「原句连续摘录不改写」，但不做与原文的逐字校验（渲染层无力承担，如实呈现）
- 超 2 万字只取开头，不做智能选段
- 拆解质量依赖模型能力：解析失败可手动重试，无自动重试/降级
- 一次拆解一个包；拆解历史不留存（参考文本与 AI 原始输出均不持久）

> 审查模型沿用 glm-5.1（M13 起 glm-5 已下线）。

## 附录 A：r1 整改与裁定（glm-5.1，2026-09-11）

结论：有条件通过（llm-review-2026-09-11-15-57-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中等：buildCandidates 未见清洗，超长返回或撑爆 UI | **误报** | 候选数据流唯一入口为 `parseDigestOutput→sanitizeDigest`（渲染层清洗：tone ≤100/rules ≤20×100/sample ≤200），`buildCandidates` 仅接收该产物（`parsed.value` 唯一赋值点），超长内容在进入 review 前已钳制；SyncCandidateDialog title 另有 CSS truncate 兜底。T2-c 容错解析用例实证清洗链路生效 |
| 中等：部分不勾选时允许核心字段空串落库 | **不采纳（设计口径）** | 风格包字段本为可选语义——M12 手动创建同口径（StyleProfileDialog 各字段均可空，DAO tone/rules/sample 均容许空），「只要规则」的包是合法用法；「全不勾」已由确认禁用拦截（包名恒在，不产生无名空包） |
| 低：phase='running' 置于 await resolveProfile 之后，档案解析慢时无反馈 | **采纳** | 已提前至 resolveProfile 之前（失败经 fail() 回落导入态提示），回归见 r2 |
| 无法判定：win32 对话框自动化真伪 | 运行时证据覆盖 | T1 15/15 PASS（真实 Electron+真实原生对话框全链路，候选面板出现即对话框闭环的必然结果）；黑盒将再次以真实 UI 覆盖 |
| 无法判定：abort 是否真中断网络 | 源码事实+实证 | services/ai.ts abort→window.api.ai.abort→主进程 ai:abort→provider AbortSignal 中止（M4 起验收的在途链路）；T2-e/f 实证停止后状态与落库正确 |
| 无法判定：SyncCandidateDialog 全不勾禁用健壮性 | 既有组件+实证 | M10.5 已验收组件：确认按钮 `:disabled="checkedCount === 0"`；T2-c2 实证（生成风格包（0）disabled=true） |
| 无法判定：真实 AI 拆解质量与注入感知（验收点 2） | 分层覆盖 | 拆解质量 T3 真实调用实证（古典快打白话风 6 规则）；「绑定新书→正文风格可感知」为黑盒真实 AI 用例范围 |
| 疑点：AI 用例重试≤3 未在材料体现 | 说明 | 重试≤3 是黑盒子代理任务书纪律（acceptance-workflow 双轨口径），不属开发自测范围；黑盒报告将披露实际重试次数 |
| 疑点：零残留字节搜索「多余」 | 说明 | 代码确无持久化逻辑（即预期结论）；字节级搜索是对「不落库不持久」承诺的运行时反证（主库+WAL 实测），保留 |

## 附录 A2：r2 裁定（glm-5.1，2026-09-11）

结论：有条件通过（llm-review-2026-09-11-16-03-.md）。整改回归：typecheck 绿 + T1 15/15 + T2 19/19（含 e 停止/f 拆解中关闭两用例，直击竞态修复面）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中等：startDigest 竞态——chatStream 返回后未校验代次号，停止可能漏 abort 新流；catch 块未校验会覆盖停止消息 | **采纳，真问题** | 已修复：建流后 `if (mySeq !== seq) { session.abort(); session = null; return }`；catch 块加 `if (mySeq !== seq) return`——停止/重开后在途链路一律中断且不覆盖状态 |
| 低：关闭弹窗未清空 parsed/candidates（拆解产物驻留内存） | **采纳（隐私口径一致性）** | watch else 分支同步清空 parsed.value=null、candidates.value=[] |
| 低/信息：rule 候选项无 tagColor | 不采纳（类型可选+设计色） | SyncCandidateItem.tagColor 为可选字段（sync.types.ts L18 `tagColor?: string`，typecheck 绿即证）；SyncCandidateDialog 对缺省 tagColor 有默认底色分支（L92）——调性紫（主色）/规则默认墨褐/样例暖褐为有意区分 |
| 信息：digestPrompts.ts 被 diff 截断无法验证 | 材料补全 | 核心源码入附录 B（提示词/解析/清洗全文+断言依据源码摘录），供下轮复审静态验证 |
| 无法判定：VALID_SOURCE_TYPES 含 digest | 材料补全 | src/main/db/styles.ts L19（附录 B 摘录） |
| 无法判定：「拆书」徽标渲染 | 材料补全 | StylePackagesSection.vue 徽标条件渲染（附录 B 摘录） |
| 无法判定：typecheck/console（需运行） | 运行时证据 | typecheck 本轮实跑绿；console 零报错 T1/T2/T3 全程 CDP 收集为 0 |

## 附录 B：核心源码事实（r2 截断补全）

### services/digestPrompts.ts（全文）

```ts
/** 拆解 system 提示：文风分析师角色，只输出严格 JSON */
const DIGEST_SYSTEM_PROMPT = [
  '你是一位资深小说文风分析师，擅长从文本中提炼可复用的写作风格。',
  '只分析文笔风格（叙事人称与视角、时态、句式长短与节奏、对话与描写比例、用词调性），',
  '不要分析情节、人物、世界观或故事内容。全部使用中文书写。'
].join('')

export function buildDigestMessages(refText: string): ChatMessage[] {
  return [
    { role: 'system', content: DIGEST_SYSTEM_PROMPT },
    { role: 'user', content: `请分析以下参考文本的文风，产出一个可直接约束 AI 写作的风格包。
严格输出如下 JSON（不要任何额外文字、不要 markdown 代码块）：
{ "name": "风格包名（12 字内...）", "tone": "文笔调性总括（一句话 60 字内）", "rules": ["叙事规则条目", "..."], "sample": "从参考文本原句中摘出的一个连续句段（100 字内，不得改写）" }
要求：
- rules 给 4-8 条具体可执行的叙事规则（人称/视角/时态/句式/对话/描写偏好），每条 50 字内
- sample 必须是参考文本中原句的连续摘录
- 所有字段值内部禁止使用英文双引号（引用请用「」）

参考文本：
${refText.slice(0, REF_TEXT_LIMIT)}` }
  ]
}

export function parseDigestOutput(text: string): DigestResult | null {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  const obj = lenientParse<...>(text.slice(first, last + 1))
  if (!obj) return null
  return sanitizeDigest({ name: String(obj.name ?? ''), tone: String(obj.tone ?? ''),
    rules: Array.isArray(obj.rules) ? obj.rules.map((r) => String(r)) : [], sample: String(obj.sample ?? '') })
}

export function sanitizeDigest(input): DigestResult | null {
  const name = input.name.trim().slice(0, 30)
  if (!name) return null
  return { name, tone: input.tone.trim().slice(0, 100),
    rules: input.rules.map((r) => r.trim().slice(0, MAX_RULE_LEN)).filter(Boolean).slice(0, MAX_RULES),
    sample: input.sample.trim().slice(0, 200) }
}
```

### 断言依据源码摘录

- `src/main/db/styles.ts:19`：`const VALID_SOURCE_TYPES: Set<string> = new Set(['manual', 'digest'])`
- `src/main/db/styles.ts`（createStyleProfile）：`const sourceType = input.sourceType !== undefined && VALID_SOURCE_TYPES.has(input.sourceType) ? input.sourceType : 'manual'`
- `src/renderer/src/components/settings/StylePackagesSection.vue`（徽标）：`:class="p.sourceType === 'digest' ? 'bg-ink-warning/10 text-ink-warning' : '...'">{{ p.sourceType === 'digest' ? '拆书' : '自建' }}`
- `src/renderer/src/components/sync/SyncCandidateDialog.vue`（全不勾禁用）：`:disabled="checkedCount === 0"`；tagColor 缺省分支：`:style="it.tagColor ? { background: it.tagColor } : { background: '#6b5f4a' }"`
- `src/shared/sync.types.ts:18`：`tagColor?: string`（可选）
- `src/main/ipc/digest.ts`：`digest:pick-text` handler 全文见 diff（未截断：dialog→txt 校验→10MB 护栏→UTF-8 去 BOM→`raw.slice(0, DIGEST_TEXT_LIMIT)`→`{fileName, text, totalChars, truncated}`；取消返回 null）

### r3 补充摘录（r3 余项证据补全）

- `src/renderer/src/services/digestPrompts.ts:17-19`（截断口径一致性）：`/** 参考文本注入上限：digest:pick-text 已截 2 万字，此处兜底防绕过通道直调 */ const REF_TEXT_LIMIT = 20000`——与 main 进程 `DIGEST_TEXT_LIMIT = 20000`（src/main/ipc/digest.ts:14）同值，UI 显示的截取字数与实际注入 AI 的字数一致
- `StylePackagesSection.vue` 列表项完整模板段（徽标挂载位置，M12 已验收代码、本里程碑未改动故不在 diff 中）：

```html
<article v-for="p in profiles" :key="p.id" class="rounded-lg border border-ink-border px-4 py-3">
  <div class="flex items-center gap-2">
    <span class="font-medium">{{ p.name }}</span>
    <span class="rounded-full px-1.5 py-0.5 text-[10px]"
      :class="p.sourceType === 'digest' ? 'bg-ink-warning/10 text-ink-warning' : 'bg-ink-primary-soft text-ink-text-secondary'"
    >{{ p.sourceType === 'digest' ? '拆书' : '自建' }}</span>
    ...
```

- 组件性质说明：SyncCandidateDialog 为 M10.5 交付的已验收既有组件（五处复用先例），非本里程碑 diff 范围；本轮仅作为消费方复用，其禁用逻辑与 tagColor 缺省分支以上方摘录为准

## 附录 A3：r3 裁定（glm-5.1，2026-09-11）

结论：有条件通过（llm-review-2026-09-11-16-09-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中等：「拆书」徽标渲染缺 diff 证据 | **误报（既有代码）** | 徽标系 M12 已验收代码，本里程碑零改动——「不在 diff 中」恰是未改动的证明；挂载证据已补：附录 B 完整列表项模板段 + T1 运行时断言（badge-ok，真实渲染出「拆书」徽标） |
| 低：REF_TEXT_LIMIT 未声明，疑与 DIGEST_TEXT_LIMIT 口径冲突 | **采纳（材料补全）** | 已摘录定义（附录 B）：两常量同为 20000，注释即声明「兜底防绕过」语义；不存在 UI 欺骗（T2-d2 UI 字数与 d3 请求长度互证） |
| 低：review 取消直接销毁全部上下文，不能退回导入态 | **不采纳（任务卡口径）** | 执行卡设计决策原文「参考文本不落库不持久（隐私：拆完即弃）」「取消则不生成」——取消=用户主动放弃，销毁是隐私承诺的保守侧；失败/停止路径已保留文本供重试（T2-b/e 实证），覆盖主要重试场景 |
| 信息：多对象夹杂 `{...} 文本 {...}` 极端解析隐患 | **记录在案，不追加** | 此类畸形经 lenientParse 失败→parseDigestOutput 返回 null→走既有失败路径（报错回落导入态、可重试、不落库，T2-b 实证该路径）；提示词已约定单对象输出，多对象切割的收益/复杂度比不划算 |

### r4 补充摘录（类型契约全文）

`src/shared/digest.types.ts`（全文，typecheck 三重闸门绿即证与使用处一致）：

```ts
/** digest:pick-text 返回：参考文本（已截取）与截断信息；用户取消时通道返回 null */
export interface DigestPickResult {
  /** 所选文件名（仅展示用） */
  fileName: string
  /** 参考文本（UTF-8 解码，超长已截取开头 DIGEST_TEXT_LIMIT 字） */
  text: string
  /** 文件总字符数（截取前） */
  totalChars: number
  /** 是否发生了截取 */
  truncated: boolean
}

/** AI 拆解产出（清洗后的规范形态） */
export interface DigestResult {
  /** 风格包名（非空 ≤30 字） */
  name: string
  /** 文笔调性总括（≤100 字，可为空） */
  tone: string
  /** 叙事规则条目（≤20 条，每条 ≤100 字，可为空） */
  rules: string[]
  /** 样例句段（≤200 字，可为空） */
  sample: string
}
```

## 附录 A4：r4 裁定（glm-5.1，2026-09-11）

结论：有条件通过（llm-review-2026-09-11-16-12-.md）。余项均为证据补全/惯例分歧/运行时范围，静态审查收敛。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中等：digest.types.ts 缺静态证据 | **采纳（材料补全）** | 类型契约全文入附录 B（diff 截断老问题；typecheck 绿互证字段口径与 sanitizeDigest 一致） |
| 低：resolveProfile 导出违背最小暴露 | **不采纳（任务卡既定路线）** | M15 执行卡明确「渲染层抽 resolveProfileForSlot(slot) 收敛 resolveProfile」——本导出是收敛前的过渡复用点，注释已声明；跨服务导出共享函数系项目惯例（styleContext/statsCalc 同类） |
| 低：扩展名二次校验冗余 | **不采纳（IPC 边界防御惯例）** | dialog filters 仅为建议性过滤（Windows 下可手输文件名/所有文件绕过），IPC 边界白名单校验是项目安全惯例——covers.ts 同款先例（ALLOWED_EXT+路径穿越拒+空文件名防御，M12 静态审查同认可此类防御） |
| 低：review 取消销毁全部上下文 | **维持 r3 不采纳裁定** | 任务卡隐私口径（拆完即弃）；失败/停止路径保留文本重试已覆盖主要场景（T2-b/e） |

## 附录 A5：静态审查收敛声明（glm-5.1，2026-09-11）

r5 结论：有条件通过（llm-review-2026-09-11-16-15-.md）。r4→r5 无新增中高危项，余项均为已裁定惯例分歧/运行时范围，**静态审查轨道就此收敛**：

| 项 | 裁定 |
|---|---|
| 低：resolveProfile 导出破坏封装 | 维持 A4 裁定（M15 收敛路线，注释已声明）——技术债属性，不入整改 |
| 低：前端 REF_TEXT_LIMIT 二次截断冗余 | 不采纳：防御性兜底（注释声明「防绕过通道直调」），2 万字符 slice 开销可忽略；与主进程同值无双口径 |
| 信息：review 取消销毁上下文 | 维持 A3/A4 裁定（任务卡隐私口径） |

静态轨道结论：r1 两项真问题（chapters 挂钩不适用本案；竞态漏 abort + 隐私清空）已在 r2 修复并回归（typecheck 绿+T1 15/15+T2 19/19），r3-r5 余项全部裁定留档。双轨第一轨完成。

## 附录 C：黑盒验收结果

（待黑盒后填写）
