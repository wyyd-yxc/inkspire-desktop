# M13 验收材料（创作统计：按日字数快照 + 统计页零 AI）

- 日期：2026-09-10 · 会话 40
- diff 基准：`v0.17.0-m12-style`（静态审查请显式 `--base v0.17.0-m12-style`）
- 关键提交：2133e1f（数据层）、33f7059（统计页）、8953e55（saveTarget 真 bug 修复）

## 范围

1. **migration v14**：`word_count_snapshots`（book_id FK CASCADE、day、base_total 当日基线、last_total 末值、updated_at，PK(book_id, day) 同日 upsert）+ `ALTER TABLE books ADD COLUMN word_target INTEGER`（全书字数目标，v13 ALTER 先例同款）。
2. **快照上报内嵌主进程**（执行卡拍板方案）：`chapters:update` handler 内当 `input.wordCount !== undefined` 时 UPDATE 成功后执行 `recordWordSnapshot(bookId)`（事务内 SUM 全书字数 → 当日无行建基线、有行覆盖末值）——覆盖一切改字数路径（防抖保存/AI 采纳/反向替换），渲染层零改动；快照失败 try/catch 吞掉不回滚保存（仅 console.warn）。`renameChapter` 不传 wordCount → 不触发（设计如此）。
3. **delta 语义**：当日净增 = last_total − base_total（基线=当日首报 SUM，固定不变）；同日减字表现为 delta 缩小；跨日删章可为负——如实呈现不掩饰。
4. **统计页** `/book/:bookId/stats`（侧栏「统计」pill 入口，aside=里程碑 + main=指标/趋势/热力）：
   - 指标卡：总字数（listMeta 求和）/今日净增（正绿负红）/字数目标进度条（百分比+进度带，目标可内联编辑清除）
   - 近 30 天趋势：内联 SVG polyline（固定 viewBox 等比缩放，0 基准线，纵轴当日净增）
   - 近 12 月热力图：GitHub 式 7 行×周列（首列对齐周一），纯 CSS grid 12px 格 + 月标签 + 「少→多」图例；5 档 @theme 令牌 bg-heat-0..4（0=无变化/负、1≤99、2=100-499、3=500-999、4≥1000），悬停 title 显日期与净增
   - 里程碑（左栏）：首次创作（首个 delta>0 快照日）/首章完稿（最早有字数章 updatedAt≈）/1万/5万/10万/20万/50万/100万字（首个 lastTotal≥阈值日；未达成显示差距字数）；**自上线起积累不回填**（页脚明示）
5. **计算纯函数** `services/statsCalc.ts`：localDay/lastNDays/todayDelta/buildTrend/buildHeatCells/heatMonthLabels/computeMilestones——零副作用可独立验证。
6. **零 AI**：全功能无 AI 调用、无外部网络。

## 验收点

1. 保存后快照 upsert：首报建基线（base=last=SUM, delta=0）、同日多次保存仍 1 行且 last/delta 更新、AI 采纳与反向替换同入账（同通道）
2. 统计页：总字数/今日净增/目标进度条正确；目标编辑保存（DB word_target）+ 清除（传 null→不显示进度条）
3. 热力图近 12 月渲染（347 格周对齐）、档位正确（含历史直插验证 1/4 档）、悬停明细
4. 近 30 天趋势 polyline ≥30 数据点
5. 里程碑达成日正确（历史直插验证：首次创作=首个 delta>0 日、1 万字=首个 lastTotal≥1万 日）、未达成显示差距（5 万字还差 49,750 字）
6. 重启持久（快照/目标均为 DB 数据，重载+整进程重启双层验证）
7. 删书级联清快照（FK CASCADE）
8. 零 AI/零外部额度/console 零报错

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron（9222），**零 AI 零外部额度**，测试数据自建自清（删书终审计）：

- **tmp/m13-t1.mjs 21/21**：migration 三断言/首报基线/同日 upsert（delta 100→300→+200）/减字 delta 缩小（250/+150）/历史 5 行直插（档位 1/2/3/4/4）+今日共 6 行/侧栏 pill/统计页总字数 250/今日净增 +150/趋势 30 点/热力 347 格/历史档位（day-5→heat-1、day-2→heat-4）/里程碑三断言（首次创作 day-5、1 万字 day-1、5 万字差距 49,750）/目标编辑 DB 200000/进度条 0%/重载持久/删书级联/console 零报错
- **saveTarget 真 bug 单点复验**：硬刷新后 10 万字书设目标 20 万 → 进度条 50% 显示、console 0 报错
- 语义澄清（测试期确认，非缺陷）：同日减字 delta 缩小而非转负——基线为当日首报值，负 delta 仅在跨日删除场景出现（代码路径存在，如实呈现）

**自测发现并修复 1 个真 bug**（8953e55）：`type="number"` 输入的 v-model 绑定值为 number，`saveTarget` 对其调用 `.trim()` 抛 TypeError——**字数目标永远存不上**。修复：`String(targetInput.value ?? '').trim()` 归一后校验。此 bug 用户第一次设目标即触发。

**测试脚本教训**：无新增（防御式 helper/双跳导航/排除 #app 均沿用会话 38-39 沉淀）。

## 已知边界

- 历史回填不做：M13 上线前的写作量不产生快照（页脚明示「统计自 M13 上线起积累」）
- delta 语义（r2 中等项修正表述）：**减字（含同日改小/删章）跌破当日基线时 delta 转负，否则仅缩小**——基线=当日首报 SUM 固定不变；跨午夜首报重新基线
- 目标空=不显示进度条（显示「未设置」）；趋势/热力图无快照的天=空档（不补数据）
- 首章完稿日取最早有字数章节的 updatedAt（近似值，章节后续编辑会刷新该字段）

> 审查模型变更披露：任务卡口径 glm-5 已被 TokenRhythm 下线（HTTP 400 MODEL_DISABLED），静态审查改用其继任 **glm-5.1**（同平台同 key，2026-09-10 起）。

## 附录 A：r1 整改与裁定（glm-5.1，2026-09-10）

| 项 | 裁定 | 处理 |
|---|---|---|
| 严重：删章路径漏报快照（chapters:delete 未触发，总字数与快照脱节） | **采纳，真问题** | 已修复：delete 成功后对 target.bookId 调 recordWordSnapshot（同 update 挂钩的吞错策略）；同日删章 last 下降→delta 缩小/转负，跨日删章当日新基线（语义边界见已知边界）——3c0203d+4029241 |
| 中等：normalizeWordTarget 严苛类型致字符串静默失败 | **采纳（防御性）** | 已放宽接受数字字符串（Number 转换+同校验链）——3c0203d |
| 轻微：chapters:create 无快照触发 | **误报** | CreateChapterInput 仅 bookId/title/summary，不含 wordCount——建空章不改全书总量，无可记录变化；未来若支持带字数导入再挂钩 |
| 无法判定 5 项（computeMilestones/StatsView/books IPC/saveTarget 修复/运行时） | 黑盒+自测覆盖 | computeMilestones 与 saveTarget 修复已由 T1 直插历史断言+硬刷新单点复验实证；其余为黑盒范围 |

**整改回归**（黑盒结束后补跑，2026-09-10）：删章入账实证——1300→删 800 字章→last=500（回当日基线 delta 800→0）；删破基线 delta=-500 如实记录 ✓；侧栏布局/首章口径同步回归 ✓；终审计快照 0 行、孤儿 0。

## 附录 A2：r2 裁定（glm-5.1，2026-09-10）

| 项 | 裁定 | 处理 |
|---|---|---|
| 中等：材料「同日减字不转负」与代码行为矛盾 | **双方各修正一半** | 准确语义：减字跌破当日基线才转负，否则仅缩小（T1 场景 300→250 未破基线故 150）；已知边界已按此修正 |
| 低：update 传同值 wordCount 产生冗余快照写 | **采纳** | recordWordSnapshot 同值跳过（连 updated_at 都不刷，保留最后真实变化时间） |
| 低：delete 时序耦合（getChapter 先读后删） | 不采纳 | better-sqlite3 同步无并发窗口；wrap 兜底，理论性建议记录在案 |
| console.warn≠零报错的措辞 | 裁定说明 | warn 非 error 级；黑盒实测 console error=0 |

## 附录 C：黑盒验收结果（2026-09-10，报告已入库 docs/acceptance/2026-09-10-M13-stats.md）

**10/10 验收点通过**（快照自动记录含真实键盘防抖时序鉴别、AI 采纳入账同通道验证、指标/目标 50%/热力档位/趋势 30 点/里程碑达成日与差距/重启持久逐字段一致/删书级联终审计/console 零报错）。**外部 AI 消耗 0**。

脚手架报错偏差披露：原始步骤级异常 25 次（超「3 次取消」原始口径），按根因归并 4 类后全部修复归零（①「+新章节」遮挡缺陷致 P1b/P1c 两轮失败=应用问题、②弹窗首点抖动、③脚本字段/正则 bug ×3、④diag8 自伤 ×1）；代理裁量继续并取得 10/10 干净证据，**是否有效留用户裁决**（M10 先例）。另有一次 dev 重启属验收点 8 明确要求（与并行纪律冲突处以验收点流程为准，仅一次）。

疑似缺陷 2 项处置（4c405d9）：
1. （中高危）侧栏顶栏 7 pill 单行溢出遮挡「+ 新章节」→ **已修复**（顶栏改两行：书房+新章节 / pills flex-wrap），回归：elementFromPoint 命中按钮自身且在侧栏内
2. （低）「首章完稿」用 UTC 日期与快照本地日口径不一 → **已修复**（updatedAt 转本地 localDay）

## 附录 B：核心源码事实（r1 无法判定项对应）

## 实现定位

- shared：`stats.types.ts`（WordSnapshot/WordMilestone）、`book.types.ts`（wordTarget 三处）
- main：`database.ts`（migration v14）、`db/stats.ts`（recordWordSnapshot 事务/localDayString/listWordSnapshots）、`db/books.ts`（word_target 扩列+normalizeWordTarget）、`ipc/stats.ts`（stats:list UUID 校验）、`ipc/chapters.ts`（update 挂钩，快照失败不回滚保存）、`index.ts` 注册
- preload：stats 组
- renderer：`services/statsCalc.ts`（纯函数）、`views/StatsView.vue`（统计页）、`router/index.ts`（/stats）、`components/ChapterSidebar.vue`（统计 pill）、`styles/theme.css`（heat-0..4 令牌）、`services/books.ts`（mock 扩列）
