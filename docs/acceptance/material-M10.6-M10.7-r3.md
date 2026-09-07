# M10.6+M10.7 验收材料 r3（二轮处置 + 收尾）

> 前序：主体材料 → r2（一轮盲区补齐）。二轮审查（有条件通过）两项严重处置如下，整改 commit 5f3bdb3，回归 T1 14/14。

## 二轮遗留处置

| 二轮条目 | 处置 |
|---|---|
| 严重-1 跨标签文本（`<b>林</b>昭`）替换失效 | **登记已知边界不改**：①产品 UI 无内联格式来源——编辑器未暴露加粗/斜体按钮，划词管线输出纯文本/块级段落，正文真实形态为 `<p>纯文本</p>`；②失败模式安全（无法匹配→跳过并计数，绝不误改）；③Range API 跨节点重构复杂度与收益不成比例。已写入材料「已知边界」与代码注释 |
| 严重-2 同章多修订竞态/计数误导 | **已整改**（5f3bdb3）：applyEdits 前同目标（kind+targetId+field）去重——同次传播替换对恒同，第二条结果被第一条涵盖；replaced 语义改为实际替换次数（split 差值累加） |
| 一般-1 findDuplicate 全表扫描 | 已登记（r2），维持 |
| 无法判定 1-2（实体边界/复杂结构） | 黑盒轨道运行验证 + 自测已含跨段 quote 实证（正文 diff 逐字节断言通过） |

## 当前提交链（自 v0.13.0）
5f3bdb3 fix(m10.7): 二轮审查整改——同目标修订去重(替换对恒同防计数误导)；replaced 语义改为实际替换次数；跨标签安全跳过登记为已知边界
2630fe2 fix(m10.6): normText/normNameDup 补书名号《》〈〉【】〔〕过滤（静态审查建议，两处同步）
07a692f fix(m10.7): usePlotSync 章节缓存按 bookId 失效（跨书导航组件复用致陈旧水位比对→误报没有待提取）
93974d4 fix(m10.7): 反向替换语义收敛为确定性——quote 仅作定位与防幻觉校验，应用时该章文本节点内旧值→新值（段落结构保持，diff 精确等于全局替换）；剧情提取 tags 强制第N章
e65804b feat(m10.7): 反向受限更新——useReverseSync(AI 定位+防幻觉双校验 quote 逐字存在且含旧值+连带扫描记忆/剧情/场景)+正文文本节点定点替换(wordCount 重算)+词条/事件改名触发确认+SyncCandidateDialog 原文→建议对照
a4cd85c refactor(m10.7): 面板/删除编排抽 usePlotPanel，PlotCanvasView 353 行（≤400 规范）
cee705d refactor(m10.7): 搜索高亮抽 usePlotSearch，PlotCanvasView 回到 ≤400 行
a608415 feat(m10.7): 正文→剧情提取（正文中枢正向补缺）——buildPlotExtractMessages+usePlotSync(变更章批量/单章+标题去重+章节序落位+水位)+SyncDialog/自动同步/设置页三目标
bc19df4 test(m10.6): 词条质量自测 11/11——治本/五入口查重/整理合并+引用转移（tmp 脚本不入库则此提交仅含空变更）
793dd6f feat(m10.6): 百科词条质量——name 提取治本(extractEntityName 首分隔符切分≤20字)+查重下沉五入口(isWikiNameDup 全等/同类型前缀包含，DAO 兜底+wiki:check-dup)+prompt 防线增强+整理词条(病态名修复/本地近似组/AI 近似合并/引用转移)
d2d1723 docs: M10.5 用户确认收尾——tag v0.13.0-m10.5-sync；立项 M10.6 词条质量 + M10.7 正文中枢联动
