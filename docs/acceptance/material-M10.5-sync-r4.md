# M10.5 验收材料 r4（三轮遗留处置 + 收尾）

> 前序：material-M10.5-sync.md → r2（一轮逐条回应+整改）→ r3（三项证据补正）→ 本轮。
> 整改提交：935dbdc（§1 原子水位 IPC + §5 loadPlot 收敛）、94d0ccb（transaction 包裹 + aria-label）。

## 三轮遗留处置

| 三轮条目 | 处置 |
|---|---|
| 中危-1 mergeWatermarkChapter 无事务 | **已整改**（94d0ccb）：读→合并→写整体包进 `d.transaction()`，原子意图显式化，防后续重构破坏串行假设。typecheck 绿；行为等价（单进程内原本串行），专项探针 tmp/m105-probe-wm.mjs 可随时复跑（10/10 零丢失基线） |
| 低危-1 白名单未收紧（sync.* 走通用 set） | 登记不改：settings 通用白名单机制为 M2 遗产，全域统一收紧属独立重构；水位已专用通道（写路径实际走 sync:watermark-merge），通用 set 保留仅剩设置分区 UI 在用。多键收紧登记技术债 |
| 低危-2 PlotAiDialog contextInfo 必填 prop 兼容 | 已核：全仓唯一调用点 PlotCanvasView.vue L362 `:context-info="syncInfo"`（grep 实证），且 syncInfo 恒为字符串（ref('') 初始），T2 实测渲染正常。无兼容问题 |
| 低危-3 startAutoSync 单例/停止保护 | 已有：`let started = false; if (started \|\| !isElectron) return; started = true`（useAutoSync.ts L57/91-92）模块级幂等守卫，重复调用与 HMR 重载均不会多定时器。App 卸载即进程退出，无需 onBeforeUnmount |
| 规范-1 ToastHost pointer-events-auto | 二轮已裁定：该类是 M10 黑盒问题 1 的病根（toast 挡点击），移除即修复，toast 纯展示无交互需求。非误删 |
| 规范-2 同步按钮无障碍 | **已整改**（94d0ccb）：补 aria-label「同步正文到百科与记忆」 |
| T2/T3/T4 原始日志文件形式 | 说明：T2/T3/T4 输出在本会话终端（未落盘文件），汇总行已录入 r3 附录 E；**黑盒轨道将独立复测全部 8 条验收点并留存独立日志与截图**，形式证据以黑盒报告为准 |
| 三轮「无法判定项」 | 交由黑盒轨道运行验证（cdp 驱动真实 Electron 全验收点复测） |

## 当前提交链（自 v0.12.0）

94d0ccb fix(m10.5): 三轮审查整改——mergeWatermarkChapter 包裹 db.transaction(原子意图显式化)；同步按钮补 aria-label
935dbdc fix(m10.5): 静态审查整改——水位合并下沉主进程原子 IPC(sync:watermark-merge，消除渲染层 get→set 交错丢更新)；loadPlot 收敛复用 buildPlotChainText(§5 DRY)
5488aa0 fix(m10.5): 自测两修——水位并发竞态(setWatermarkChapter 改以 DB 最新值合并，防互相覆盖)；混合场景全重复章节立即推水位(防下轮重抽白耗额度)
5c85364 feat(m10.5): 自动同步——useAutoSync 全局调度两档(提醒红点/静默入库≤3章轮)+设置分区即改即生效+60s轻节拍零AI检测；chapters:get 轻量取章；changedChapters 泛型化；修 useMemorySync bookId 非响应式
4c7cb4f feat(m10.5): 各页同步入口——工作台侧栏「⟳ 同步」弹窗(目标×范围，百科/记忆并行推送)；创世台造世「⇨ 推送设定到百科」(幂等)；侧栏红点提醒位
f6f26b3 feat(m10.5): 剧情双向联动——剧情 AI 三模式上下文注入已写进度+既定事实(弹窗显联动信息行)；正文 AI systemPrompt 加剧情事件链槽位(预算1000)；章节画布场景生成同注入；chapters:list-meta 轻量 IPC
fef377d feat(m10.5): 正文→百科——WikiView「从正文提取」：AI 扫描章节提取候选词条(注入已有词条清单防同名同义)→勾选确认→入库默认 manual+按 name 规范化幂等+水位推进
99a24e0 style(m10.5): useMemorySync 压缩至 400 行内
41e6387 feat(m10.5): 记忆去重——抽取 prompt 注入已有记忆(AI 级防同义)+入库前规范化比对(本地级)；未抽取章节批量(水位)；清理重复(精确删+AI 近似合并确认面板)；SyncCandidateDialog 通用勾选面板(还清勾选确认技术债)
01aa65d chore(m10.5): 第 0 步——tag v0.12.0 收尾；清偿 M10 两条轻微债（toast 不再拦截点击/自环连线补提示）；HANDOVER/roadmap 立项 M10.5
