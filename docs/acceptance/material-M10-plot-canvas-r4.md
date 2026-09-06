# M10 剧情画布 — 验收材料（第四轮：三轮审查条件项闭环）

> 前序：material-M10-plot-canvas.md（主体/验收点）→ r2（渲染层全量源码+首轮回应）→ r3（入口/样式源码+二轮整改）→ 本轮。
> 本轮只闭环三轮审查（llm-review-2026-09-06-07-04）「最终建议」的两个代码项，并附完整整改 diff。

## 三轮条件项处置

| 三轮建议 | 处置 |
|---|---|
| P1 DAO 层 book_id 归属校验 | **已整改**（commit c780a08）：① createPlotEdge 校验连线两端事件存在且 book_id 与 input.bookId 一致（防跨书借边悬挂行）；② createPlotEvent 校验挂接词条存在且属于本书（防跨书词条注入）。update/remove 因 IPC 形状不含 bookId（与 M7 scenes 同构）维持注释登记，待多档/协同需求落地时随 migration 一并补齐 |
| P2-② 默认坐标/标题 | **已整改**（commit c780a08）：默认 pos_x 改 `COALESCE(MAX(pos_x),0)+340`；默认标题改「新事件」。注：渲染层所有创建路径均显式传 posX/posY/title，此为 DAO 兜底；主进程单线程 + wrap 同步包裹，实际无并发路径 |
| P2-① parent_id 备用索引 | 不在建已应用的 v10 里补（禁改历史迁移）；登记为 M11 子画布落地时随 migration v11+ 一并处理 |
| P3-③ 标签色板撞色 | **已整改**（commit c780a08）：色板 8→16 色 |
| P3-④ ChapterSidebar ref Map 清理 | M3 时代存量代码，非 M10 变更面（M10 仅新增一个链接）；按「不扩 scope」原则不于本里程碑改动 |
| P3-⑤ reference 类型设计出处 | 主体材料「设计边界」已声明：四类型出自 HANDOVER M10 任务卡（main/logic/relation/reference），连线视觉为自定设计（原站文档未定义四类视觉） |
| 端到端录屏 | 黑盒子代理以 CDP 驱动真实 Electron 执行全验收点（下一轨道），并实测「写入→重启 app→再查」持久化与删书级联 |

## 附录：本轮整改 diff（c780a08 + 注释登记 c610314 相关行）

c780a08 fix(plot): 三轮静态审查整改——连线两端/挂接词条归属校验(DAO)；默认落位改 MAX(pos_x)+340；标签色板扩 16 色
c610314 fix(plot): 静态审查二轮整改——延伸落位多行避让(与分歧对称)；中止改由 finally 统一释放 isBusy；跨书归属信任边界注释登记
d00e049 fix(plot): 静态审查整改——wikiRefs 数组 UUID 校验；parent_id 预留列无 FK 的设计注释
daefb63 fix(plot): 自测两修——overflow-hidden 裁剪右手柄致拖线失灵(手柄移出裁剪层)；分歧采纳响应式 Proxy 过 IPC 克隆失败(toRaw+深拷贝)；分歧落位占位避让
bb85e0a feat(plot): AI 三模式——初始化事件链/向后延伸/分歧推演(方向候选择一采纳)+流式可中止+宽松JSON解析
6e6dcbb feat(plot): 剧情画布基础——事件 CRUD/拖拽持久化/四类连线+编辑器/双击详情面板/搜索高亮/侧栏入口
e3d088b feat(db+ipc): M10 数据层——migration v10 plot_events/plot_edges + DAO + plot 域八通道 IPC + preload 桥
fbddc4d docs: M9 用户确认，tag v0.11.0-m9-assistant——HANDOVER/roadmap 状态收尾

```diff
diff --git a/src/main/db/plot.ts b/src/main/db/plot.ts
index 18a73fd..a6f4402 100644
--- a/src/main/db/plot.ts
+++ b/src/main/db/plot.ts
@@ -79,19 +79,28 @@ export function getPlotEvent(id: string): PlotEvent | undefined {
 export function createPlotEvent(input: CreatePlotEventInput): PlotEvent {
   if (!input.bookId) throw new Error('缺少书籍 id')
   const d: Database = getDb()
-  const count = (
-    d.prepare('SELECT COUNT(*) AS c FROM plot_events WHERE book_id = ?').get(input.bookId) as {
-      c: number
-    }
-  ).c
+  // 词条归属校验（M10 三轮静态审查 P1）：挂接词条必须存在且属于本书，防跨书词条错乱注入
+  for (const rid of input.wikiRefs ?? []) {
+    const w = d.prepare('SELECT book_id FROM wiki_entries WHERE id = ?').get(rid) as
+      | { book_id: string }
+      | undefined
+    if (!w) throw new Error('挂接的百科词条不存在')
+    if (w.book_id !== input.bookId) throw new Error('挂接的百科词条必须属于本书')
+  }
+  // 默认落位取本书最大 x 右移一格（防删事件后 COUNT 回退导致坐标重叠，三轮静态审查 P2）
+  const maxX = (
+    d
+      .prepare('SELECT COALESCE(MAX(pos_x), 0) AS m FROM plot_events WHERE book_id = ?')
+      .get(input.bookId) as { m: number }
+  ).m
   const now = new Date().toISOString()
   const row: PlotEventRow = {
     id: randomUUID(),
     book_id: input.bookId,
-    title: input.title?.trim() || `事件 ${count + 1}`,
+    title: input.title?.trim() || `新事件`,
     description: input.description ?? '',
     tags: JSON.stringify(input.tags ?? []),
-    pos_x: input.posX ?? (count + 1) * 340,
+    pos_x: input.posX ?? maxX + 340,
     pos_y: input.posY ?? 240,
     parent_id: null, // 子画布预留字段，M10 恒不写值
     wiki_refs: JSON.stringify(input.wikiRefs ?? []),
diff --git a/src/main/db/plotEdges.ts b/src/main/db/plotEdges.ts
index 4f27918..7df655e 100644
--- a/src/main/db/plotEdges.ts
+++ b/src/main/db/plotEdges.ts
@@ -51,6 +51,14 @@ export function createPlotEdge(input: CreatePlotEdgeInput): PlotEdge {
   if (input.sourceId === input.targetId) throw new Error('不能连接事件到自身')
 
   const d: Database = getDb()
+  // 归属校验（M10 三轮静态审查 P1）：连线两端必须是本书的既有事件，防跨书"借边"悬挂行
+  for (const eid of [input.sourceId, input.targetId]) {
+    const ev = d.prepare('SELECT book_id FROM plot_events WHERE id = ?').get(eid) as
+      | { book_id: string }
+      | undefined
+    if (!ev) throw new Error('连线两端必须是已存在的剧情事件')
+    if (ev.book_id !== input.bookId) throw new Error('连线两端事件必须属于同一本书')
+  }
   // 任意方向已存在连线即拒绝（方向承载因果语义，反向边视为矛盾；类型/标签可在连线编辑器修改）
   const dup = d
     .prepare(
diff --git a/src/renderer/src/services/plotStyle.ts b/src/renderer/src/services/plotStyle.ts
index c505670..b89e69d 100644
--- a/src/renderer/src/services/plotStyle.ts
+++ b/src/renderer/src/services/plotStyle.ts
@@ -11,8 +11,14 @@ export const PLOT_EDGE_STYLES: Record<PlotEdgeType, { stroke: string; dash: stri
   reference: { stroke: '#58a27a', dash: '1 4', label: '引用' }
 }
 
-/** 标签色板：事件节点左侧色条按首个标签取色（同一标签恒同色，标签决定节点视觉色，照原站文档） */
-const TAG_PALETTE = ['#6c5ce7', '#c9a227', '#5b9bd1', '#3fa66a', '#e07b54', '#8b5fbf', '#d16a8a', '#4aa8a2']
+/** 标签色板：事件节点左侧色条按首个标签取色（同一标签恒同色，标签决定节点视觉色，照原站文档）。
+ *  16 色降低不同语义标签哈希撞色概率（M10 三轮静态审查 P3） */
+const TAG_PALETTE = [
+  '#6c5ce7', '#c9a227', '#5b9bd1', '#3fa66a',
+  '#e07b54', '#8b5fbf', '#d16a8a', '#4aa8a2',
+  '#b0713f', '#5a7d2f', '#a3495f', '#3f7d99',
+  '#9466a8', '#c2884e', '#6a9c89', '#7a6ff0'
+]
 
 export function tagColor(tag: string): string {
   let h = 0
```

```diff
diff --git a/src/main/ipc/plot.ts b/src/main/ipc/plot.ts
index 6491bd0..b6d75cc 100644
--- a/src/main/ipc/plot.ts
+++ b/src/main/ipc/plot.ts
@@ -31,7 +31,10 @@ function assertUuid(...ids: string[]): void {
   }
 }
 
-/** 校验输入里的词条引用数组（防污染 id 触发下游 wiki 查询异常，M10 静态审查建议） */
+/** 校验输入里的词条引用数组（防污染 id 触发下游 wiki 查询异常，M10 静态审查建议）。
+ *  设计登记（M10 静态审查 P1）：只验格式不验「词条属于该书」/ 连线两端是否属书——
+ *  UUID 随机不可枚举 + 单机单用户信任边界（与 M7 scenes/sceneEdges、apiKey 明文同一边际模型），
+ *  若后续做多档/协同再以 migration + DAO 归属校验补齐。 */
 function assertWikiRefs(input: { wikiRefs?: string[] }): void {
   for (const rid of input.wikiRefs ?? []) {
     if (!UUID_RE.test(rid)) throw new Error('词条引用格式非法')
diff --git a/src/renderer/src/composables/usePlotAi.ts b/src/renderer/src/composables/usePlotAi.ts
index 88ed4ac..731700a 100644
--- a/src/renderer/src/composables/usePlotAi.ts
+++ b/src/renderer/src/composables/usePlotAi.ts
@@ -170,10 +170,11 @@ export function usePlotAi(deps: {
     return events.value.filter((e) => ids.has(e.id)).slice(0, 8)
   }
 
-  /** 面板停止：中止当前流（中止会走 onError → 面板标记结束，不算错误路径） */
+  /** 面板停止：中止当前流（中止会走 onError → 面板标记结束，不算错误路径）。
+   *  不在此处释放 isBusy——由 startPlotGen 的 finally 在流真正终结后统一释放，
+   *  避免中止动画期间 isBusy 提前可入导致新旧流交叠（M10 静态审查 P2）。 */
   function stopEverything(): void {
     activeSession?.abort()
-    isBusy.value = false
   }
 
   // ---- 采纳落库（AI 草稿为纯对象，字段逐一平铺过 IPC，踩坑 #11） ----
@@ -222,17 +223,22 @@ export function usePlotAi(deps: {
     }
   }
 
-  /** 延伸落位：锚点右侧一排；若右侧同排已被占则下移一行避让 */
+  /** 延伸落位：锚点右侧找空排（逐行下移最多 5 行，与分歧落位同一避让策略） */
   function freeRowYAfter(anchor: PlotEvent, count: number): number {
     const spanEnd = anchor.posX + (count + 1) * 340
-    const occupied = events.value.some(
-      (e) =>
-        e.id !== anchor.id &&
-        Math.abs(e.posY - anchor.posY) < 120 &&
-        e.posX > anchor.posX &&
-        e.posX <= spanEnd + 200
-    )
-    return occupied ? anchor.posY + 220 : anchor.posY
+    let rowY = anchor.posY
+    for (let tries = 0; tries < 5; tries++) {
+      const occupied = events.value.some(
+        (e) =>
+          e.id !== anchor.id &&
+          Math.abs(e.posY - rowY) < 120 &&
+          e.posX > anchor.posX &&
+          e.posX <= spanEnd + 200
+      )
+      if (!occupied) break
+      rowY += 220
+    }
+    return rowY
   }
 
   /** 面板「采纳」：按模式解析 AI 输出并落库 */
```
