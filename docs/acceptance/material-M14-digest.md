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

## 附录 B：黑盒验收结果

（待黑盒后填写）
