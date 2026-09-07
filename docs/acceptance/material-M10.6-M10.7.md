# M10.6+M10.7 验收材料（词条质量 + 正文中枢联动）

- 日期：2026-09-06 · 会话 37
- diff 基准：`v0.13.0-m10.5-sync`（静态审查请显式 `--base v0.13.0-m10.5-sync`；diff 截断盲区的关键源码已随 M10.5 材料 r2-r4 入库，本轮新增源码在附录）
- 提交链：793dd6f（M10.6 词条质量）→ a608415/cee705d/a4cd85c（M10.7 剧情+重构）→ e65804b（反向更新）→ 93974d4/07a692f（自测修复）

## 一、M10.6 百科词条质量（修「重复词条」问题）

**根因（用户报障「百科有重复词条」）**：
1. 创世台推送 `genesisToWorldEntries` 的 firstLine 不按冒号切分 → 整段设定文本（60 字封顶）成为词条名（实证：「林昭：青云宗弃徒…」60 字 vs 「林昭」并存）
2. 查重仅 normText 全等 → 「韦正铭/韦正铭舰长」等前缀包含近义对全漏
3. 百科页导入用 `===` 精确比对与创世台推送（normText）强度不一；手动新建/AI 生成/DAO 三层零查重

**整改**：
- **治本**：新 `extractEntityName(raw, fallback)`——首个中英文冒号/逗号/句号/分号/顿号/问叹号前段，≤20 字；无分隔符或超长回退类型默认名（主角/世界规则）
- **统一判定**：`isWikiNameDup(aName,aType,bName,bType)`（normText 全等跨类型 + 同类型前缀包含≥2 字）；渲染层 syncService 与主进程 db/wiki.ts 双实现（注释互指）
- **五入口全覆盖**：创世推送、百科导入（对齐）、手动保存（checkDup 预检阻止）、AI 生成采纳（经 save 预检）、正文提取确认（逐条 checkDup 复检+跳过计数）、静默自动档（isWikiNameDup 同强度）；**DAO 终极兜底**：createWikiEntry/updateWikiEntry 命中抛「已存在重复词条「X」」——任何入口漏检都不产生重复
- **新 IPC** `wiki:check-dup`（bookId/name/type/excludeId）
- **prompt 防线**：buildExistingWikiText 注入前实体名规范化 + limit 800→1200
- **「🧹 整理词条」**（useWikiCleanup）：①病态名（>20 字创世导入条）确定性修复（撞名转合并组）；②本地近似分组（同类型前缀包含连通分量）；③AI 近似合并建议（≥6 条才跑，组 id 白名单过滤）；④采纳时**引用转移**（剧情事件/场景 wiki_refs 换成保留条 id）+ 摘要拼接 + 删被并条

**自测**（tmp/m106-t1.mjs，**11/11**）：推送治本（name=「林昭」/「灵力分九品」非 60 字）→ 近似名存在时推送幂等 → 手动保存重名预检（面板未关+重复提示）→ 整理面板（直连 DB 造历史存量：病态名自动修复「苏九」、近似对「玄铁令残片」并入「玄铁令」、**引用转移**剧情事件 wiki_refs 换 id、AI 近似组）→ DAO 兜底拒绝（前缀包含/跨类型全等）→ console 零报错。AI 调用 1 次。

## 二、M10.7 正文中枢联动

**正向补缺（正文→剧情，此前完全缺失）**：
- `buildPlotExtractMessages`（从已写正文回溯事件，注入已有事件链防重复，tags 要求第N章）
- `usePlotSync`（新 composable）：变更章/单章批量 → 逐章 AI → 标题 isWikiNameDup 去重（对已有事件+批内）→ 候选面板「上画布」→ 按**章节序**落位（每章一列，章内纵排）→ 水位推进
- 第三目标接线：SyncDialog「回溯事件→剧情画布」勾选、自动同步 targets {wiki,memory,plot}、设置页第三勾选、剧情画布页「⇦ 从正文提取」按钮、`sync.plot_watermark`（主进程合并白名单+读白名单已放行）

**反向受限更新（其它模块→正文→其它模块）**：
- **触发**：词条改名（WikiView.save 检测新旧名差异）/ 剧情事件改名（PlotCanvasView onSubmitPanel）→ ConfirmDialog「同步旧表述？」
- **AI 定位**：本地粗筛（仅含旧值的章送 AI，4000 字/章）→ `buildLocateMessages`（quote 必须逐字原文片段且完整包含旧值）→ parseLocate
- **防幻觉双校验**：quote ∈ 章纯文本 && quote 包含旧值——未通过者剔除并计数告知
- **连带确定性扫描**（零 AI）：记忆 content / 剧情事件 title+description / 场景 summary 中的旧值子串 → 一并列入候选
- **候选面板**：SyncCandidateDialog 扩展 oldText/newText 字段渲染「原文→改为」对照（向后兼容旧用法）
- **应用（绝不动无关部分的保证）**：正文 = DOMParser **文本节点内** oldValue→newValue（quote 仅作定位与防幻觉校验，AI suggestion 不参与改写——确定性替换使 diff 精确等于全局替换，段落结构保持）；wordCount 按最终内容重算；记忆/剧情/场景 = 字符串替换走各自 update
- **中枢语义**：正文改动 → ⟳ 同步外推（百科/记忆/剧情三目标）；非正文改动 → 反向管线先落正文再外推

**自测**（tmp/m107-t1.mjs，**14/14**，AI 调用 3 次）：
- B1：提取候选 4 事件（跨 2 章）→ 上画布各含第N章标签 → 剧情水位推进 → 复跑被水位拦截
- B2：词条「血衣楼」→「赤衣盟」→ 确认扫描 → AI 定位面板（8 处，含幻觉剔除计数）→ 应用 →
  **核心断言：`before.split(旧).join(新) === after`（正文 HTML 除替换点外逐字节不变）PASS**；旧名清零；新名写入；wordCount=按最终内容重算的真实值；记忆与剧情事件连带替换；词条名已改

**自测过程发现并修复的缺陷**（93974d4 / 07a692f）：
1. P1 剧情提取跨书缓存：usePlotSync 内部 chapters 缓存不随 bookId 失效（Vue Router 复用组件实例）→ 误报「没有待提取」——按 bookId 失效
2. P2 反向替换最初采用 AI suggestion 整句替换，quote 跨段时会合并段落且动到句内其它文字——收敛为确定性替换（AI 只定位不参与改写）
3. P2 剧情提取 tags 依赖 AI 输出——落库时强制第一项为「第N章」

## 三、设计边界（按口径验收）

- 近义（非字面）重复词条：isWikiNameDup 抓前缀包含与全等，**跨措辞同义靠整理词条的 AI 近似组**（建议制，勾选采纳）
- 正文反向替换是「旧值→新值」确定性子串替换（不做语境改写）；跨段 quote 校验通过后等价于该章全局替换（改名场景符合预期）；需要语境级改写时可拒绝面板改手动划词润色
- plot_events 不加章节列：提取事件以 tags「第N章」标记归属（零 migration）
- 反向触发点仅「名称类变更」（词条 name/事件 title）；记忆 content 变更不触发（事实陈述非名称）
- 反向应用时若目标章正在编辑器中打开且未保存，应用后需切章刷新（应用发生在非工作台页面，无防抖竞态）

## 四、实现定位

- M10.6：`services/wikiPrompts.ts`（extractEntityName/genesisToWorldEntries/buildWikiDedupMessages/parseWikiDedup）、`services/syncService.ts`（isWikiNameDup）、`main/db/wiki.ts`（findDuplicate/兜底）、`main/ipc/wiki.ts`（check-dup）、`composables/useWikiCleanup.ts`、`composables/useWikiSync.ts`（复检）、`composables/useAutoSync.ts`（静默档判定）、`views/WikiView.vue`（预检/导入对齐/整理入口）、`views/GenesisView.vue`（推送判定）
- M10.7：`services/plotPrompts.ts`（buildPlotExtractMessages）、`services/reverseSyncPrompts.ts`（locate+htmlToText+粗筛）、`services/syncService.ts`（PLOT_WATERMARK_KEY）、`composables/usePlotSync.ts`、`composables/useReverseSync.ts`、`composables/usePlotSearch.ts`/`usePlotPanel.ts`（瘦身抽取）、`components/sync/SyncDialog.vue`（三目标）、`components/sync/SyncCandidateDialog.vue`（对照渲染）、`views/WorkspaceView.vue`（plot 分支+第三面板）、`views/SettingsView.vue`（第三勾选）、`views/PlotCanvasView.vue`（提取按钮+反向触发）、`main/db/settings.ts`+`main/ipc/settings.ts`（plot 水位键）、`preload/index.ts`（wiki.checkDup）

## 五、已知边界

- 词条整理的 AI 近似组有误合并可能（面板逐组勾选为最终裁决；建议制不自动执行）
- 反向 AI 定位对「旧值为常见短词」（如单字名）可能命中过多——双校验只保证 quote 真实存在，相关性靠 prompt 约束与人工勾选
- 剧情提取事件间不自动连线（因果未知，由用户在画布连接）
- 反向应用后若该章正打开于工作台，编辑器内存态不会自动刷新（toast 无提示，需切章；后续可加刷新提示）
