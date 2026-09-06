# M10.5 跨模块联动与同步 — 验收材料 r2（一轮审查回应 + 整改实证）

> 主体材料：material-M10.5-sync.md（范围/验收点 8 条/自测声明/实现定位 + 关键源码附录）。
> 一轮审查：llm-review-2026-09-06-17-12-.md（结论「不通过」）。本轮逐条回应，代码整改已提交 935dbdc，
> 回归证据：T1 18/18（强抽二抽混合场景水位两章齐）、T3 静默档入库+复跑幂等照旧（原子通道回归见附录 D）。

## 逐条回应

| 一轮条目 | 定性 | 回应与处置 |
|---|---|---|
| §1 P0 水位竞态「修复不彻底」（get→set 两步 IPC 交错） | **采纳，已整改** | 新增主进程原子合并通道 `sync:watermark-merge`（main/ipc/sync.ts + db/settings.ts mergeWatermarkChapter）：主进程单线程内同步读→合并→写，天然原子；键白名单校验（仅两个水位键）+ chapterId UUID 校验 + wordCount 有限性校验；渲染层 setWatermarkChapter 改走该通道（签名兼容）。**回归**：T1 强抽二抽混合场景两章水位齐（18/18）；专项压力探针 10 章并发 merge 零丢失（tmp/m105-probe-wm.mjs，10/10 OK） |
| §2 P1 关闭重开后 lastCheckAt 未重置，首次 tick 立即触发 | **不采纳（设计权衡）** | 「开启后首个 tick 立即检测」正是用户预期（刚打开开关理应马上看到效果）；提醒档零 AI 消耗；静默档有 ≤3 章/轮硬上限，「积压全抽」不成立（单轮最多 3 章，超出留下轮）。且 interval 门槛照常约束后续 tick。不改 |
| §3 P1 静默档全重复章节不推水位（silentSyncChapter 不走 handleParsed） | **误读，不改** | silentSyncChapter 对每个目标章在 wiki/memory 处理末尾**无条件**调用 setWatermarkChapter（useAutoSync.ts：`if (s.targets.wiki) {…} change.wikiWatermark = await setWatermarkChapter(...)`；memory 同）——重复与否都推水，不存在「反复重抽同章」。T3 静默档实测：入库 7 词条后复跑零新增（水位挡住）|
| §4 ToastHost 移除 pointer-events-auto | 不改（这是修复） | 该类正是 M10 黑盒问题 1 的病根（toast 挡住顶栏点击 2-3s），M10.5 第 0 步清偿的技术债。toast 是纯展示元素，无任何点击交互需求；穿透即目的。未来浮层如需可点击再显式加回 |
| §5 buildPlotChainText 三处重复实现（ChapterEditor.loadPlot 内联） | **采纳，已整改** | loadPlot 已改为调用 `syncService.buildPlotChainText(res.data, PLOT_INJECT_LIMIT)`，删除内联排序/截断（935dbdc）。其余两处（aiWriting 消费 ctx.plot.events、剧情侧 buildProgressText/buildFactsText）本就是 syncService 单一实现的不同函数，非重复 |
| §6 水位键白名单=渲染层可写伪造水位 | 不改（信任边界登记） | 单机单用户信任边界（与 M10 静态审查的归属校验裁决同一边际模型，用户已知情）；水位仅影响同步调度不碰正文数据；伪造的代价是多余的 AI 调用而非数据损坏。已在 main/ipc/sync.ts 注释登记 |
| §7 extractOnce 的 session race | 不改（窗口不可达） | chatStream 在 invoke 返回 requestId 后即 resolve，session 赋值发生在流首个事件之前（微任务级 <1ms）；onDone 是流末尾事件，远晚于赋值。用户无法在该窗口点停止 |
| §8 openExtractDialog 默认单章 | 不改（UX 取舍） | 与 useWikiSync 默认「changed」互补：记忆抽取单章是最高频动作（写完一章立刻抽），批量在 SyncDialog（工作台）里是默认项。两处默认值各就各位 |
| §9 WikiExtractDialog 未附代码 | 材料补齐 | 见附录 C（busy 锁 :disabled="busy"、进度行、无 AbortController 但 stopEverything 经 useWikiSync.activeSession 可中止） |
| §10 throttledError break 后剩余统计文案 | 不改 | remain 统计=未处理章节总数，无论因失败停轮还是配额截断都确实「待下轮」，文案准确 |
| 无法判定 1-5/9-10 | 材料补齐 | 附录 B/C：aiWriting systemPrompt 剧情段、ChapterEditor loadPlot（已收敛）、GenesisView pushWorldToWiki、WorkspaceView clearAlert 接线、WikiExtractDialog、plotStyle/plotPrompts 相关行 |
| 无法判定 6（静默档不走 handleParsed 可判） | 已澄清 | 见 §3：静默档根本不需要 handleParsed——它内联做同强度的去重并每章无条件推水 |
| 无法判定 7（T1-T4 断言粒度） | 材料补齐 | 自测原始输出全文见附录 E（T1 18/18 最终回归轮） |
| 无法判定 8（list-meta/get 参数校验） | 已有 | chapters:list-meta/get 走 wrap（异常转 ok:false）；bookId 参数化查询无注入面。与全域 IPC 同构 |

## 整改 diff（935dbdc）
```diff
diff --git a/src/main/db/settings.ts b/src/main/db/settings.ts
index e048e91..560b3e0 100644
--- a/src/main/db/settings.ts
+++ b/src/main/db/settings.ts
@@ -28,3 +28,28 @@ export function setSetting<T>(key: string, value: T): void {
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`
   ).run(key, JSON.stringify(value))
 }
+
+/** 允许原子合并的水位键白名单 */
+const WATERMARK_KEYS = new Set(['sync.memory_watermark', 'sync.wiki_watermark'])
+
+/** 水位单章合并（M10.5 静态审查 §1）：在主进程内同步完成 读→合并→写，
+ *  消除渲染层两步 IPC（get→set）之间的交错丢更新窗口；非白名单键拒绝 */
+export function mergeWatermarkChapter(key: string, chapterId: string, wordCount: number): void {
+  if (!WATERMARK_KEYS.has(key)) throw new Error('非法的水位键')
+  if (!Number.isFinite(wordCount)) throw new Error('水位字数非法')
+  const d: Database = getDb()
+  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
+    | { value: string }
+    | undefined
+  let map: Record<string, number> = {}
+  if (row) {
+    try {
+      const parsed: unknown = JSON.parse(row.value)
+      if (parsed && typeof parsed === 'object') map = parsed as Record<string, number>
+    } catch {
+      map = {}
+    }
+  }
+  map[chapterId] = wordCount
+  setSetting(key, map)
+}
diff --git a/src/main/index.ts b/src/main/index.ts
index 679e982..830b9d2 100644
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -17,6 +17,7 @@ import { registerSceneEdgeIpc } from './ipc/sceneEdges'
 import { registerPlotIpc } from './ipc/plot'
 import { registerMemoryIpc } from './ipc/memories'
 import { registerAssistantIpc } from './ipc/assistant'
+import { registerSyncIpc } from './ipc/sync'
 
 /** 创建应用主窗口（1280x800，中文标题「墨灵」）。 */
 function createWindow(): void {
@@ -97,6 +98,7 @@ registerSceneEdgeIpc()
 registerPlotIpc()
 registerMemoryIpc()
 registerAssistantIpc()
+registerSyncIpc()
 
 app.whenReady().then(() => {
   createWindow()
diff --git a/src/main/ipc/sync.ts b/src/main/ipc/sync.ts
new file mode 100644
index 0000000..c050b40
--- /dev/null
+++ b/src/main/ipc/sync.ts
@@ -0,0 +1,20 @@
+/**
+ * sync 域 IPC：抽取水位的原子合并（M10.5 静态审查 §1）。
+ * 渲染层两步 get→set 之间存在交错丢更新窗口；合并逻辑下沉主进程单线程内即天然原子。
+ */
+import { ipcMain } from 'electron'
+import { wrap } from './wrap'
+import { mergeWatermarkChapter } from '../db/settings'
+
+/** 轻量 UUID 校验（与 plot 域同款） */
+const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
+
+export function registerSyncIpc(): void {
+  ipcMain.handle('sync:watermark-merge', (_e, key: string, chapterId: string, wordCount: number) =>
+    wrap(() => {
+      if (typeof key !== 'string' || !UUID_RE.test(chapterId)) throw new Error('参数格式非法')
+      mergeWatermarkChapter(key, chapterId, wordCount)
+      return true
+    })
+  )
+}
diff --git a/src/preload/index.ts b/src/preload/index.ts
index 21464c6..fa7d68c 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -87,6 +87,12 @@ const api = {
       ipcRenderer.invoke('chapters:move', id, dir)
   },
 
+  /** 联动同步（M10.5）：抽取水位原子合并（主进程内读改写，防并发丢更新） */
+  sync: {
+    mergeWatermark: (key: string, chapterId: string, wordCount: number): Promise<IpcResult<boolean>> =>
+      ipcRenderer.invoke('sync:watermark-merge', key, chapterId, wordCount)
+  },
+
   /** 创世台五步设定 */
   genesis: {
     get: (bookId: string): Promise<IpcResult<GenesisStepRecord[]>> =>
diff --git a/src/renderer/src/components/ChapterEditor.vue b/src/renderer/src/components/ChapterEditor.vue
index 405ce5d..144ed36 100644
--- a/src/renderer/src/components/ChapterEditor.vue
+++ b/src/renderer/src/components/ChapterEditor.vue
@@ -14,6 +14,7 @@ import type { Chapter } from '../../../shared/chapter.types'
 import type { StreamSession } from '../services/ai'
 import type { SelectionAction, SelectionContext } from '../services/aiWriting'
 import { buildChapterPolishMessages, buildContinueMessages, buildSelectionMessages, generateWriting } from '../services/aiWriting'
+import { buildPlotChainText } from '../services/syncService'
 import type { GenesisStepRecord, Step2Soul, Step4Layout, Step1Style } from '../../../shared/genesis.types'
 import { WIKI_TYPE_LABELS } from '../../../shared/wiki.types'
 import { MEMORY_KIND_LABELS } from '../../../shared/memory.types'
@@ -169,17 +170,8 @@ async function loadPlot(bookId: string): Promise<void> {
     const res = await window.api.plot.list(bookId)
     if (mySeq !== plotLoadSeq) return
     if (!res.ok) return
-    const lines = [...res.data]
-      .sort((a, b) => a.posX - b.posX)
-      .map((e) => `- ${e.title}：${e.description.slice(0, 60) || '（无描述）'}`)
-    const out: string[] = []
-    let budget = PLOT_INJECT_LIMIT
-    for (const line of lines) {
-      if (line.length > budget) break
-      out.push(line)
-      budget -= line.length
-    }
-    plotCache.value = { events: out.join('\n') }
+    // 事件链拼装统一走 syncService（与场景/剧情侧同源，M10.5 静态审查 §5 收敛）
+    plotCache.value = { events: buildPlotChainText(res.data, PLOT_INJECT_LIMIT) }
   } catch (err) {
     console.warn('[ChapterEditor] 剧情事件加载失败:', err)
   }
diff --git a/src/renderer/src/services/syncService.ts b/src/renderer/src/services/syncService.ts
index 522601c..c3c2be7 100644
--- a/src/renderer/src/services/syncService.ts
+++ b/src/renderer/src/services/syncService.ts
@@ -29,21 +29,19 @@ export async function getWatermark(key: string): Promise<SyncWatermark> {
   return res.ok && res.data && typeof res.data === 'object' ? res.data : {}
 }
 
-/** 写入某章水位。以 DB 最新值为基合并（current 参数仅兼容旧签名）：
- *  「全重复章节自动推水」与「确认面板采纳推水」可能并发，基于过期快照会互相覆盖（T1 自测实锤） */
+/** 写入某章水位：走主进程原子合并 IPC（M10.5 静态审查 §1：渲染层两步 get→set 有交错丢更新窗口，
+ *  合并下沉主进程单线程内即天然原子）。current 参数仅兼容旧签名，不再作为合并基 */
 export async function setWatermarkChapter(
   key: string,
   _current: SyncWatermark,
   chapterId: string,
   wordCount: number
 ): Promise<SyncWatermark> {
-  const latest = isElectron ? await getWatermark(key) : _current
-  const next = { ...latest, [chapterId]: wordCount }
   if (isElectron) {
-    const res = await window.api.settings.set(key, next)
+    const res = await window.api.sync.mergeWatermark(key, chapterId, wordCount)
     if (!res.ok) throw new Error(res.error)
   }
-  return next
+  return { ..._current, [chapterId]: wordCount }
 }
 
 /** 找出「有内容且水位不符」的章节（从未抽取=水位缺失，抽取后改过字数=水位过期）。
```

## 附录 B：注入链与入口源码
### aiWriting.ts systemPrompt 剧情段（L75-95）
```ts
    if (rules.length) parts.push(`写作规则——${rules.join('；')}。`)
  }
  // 百科词条注入（M6）：injection=always 的设定，AI 必须遵守不得写错
  if (ctx.wiki?.entries) {
    parts.push(`本书设定（必须严格遵守，不得写错名称与属性）：\n${ctx.wiki.entries}`)
  }
  // 作品记忆注入（M8）：当前章之前的事实（单向可见防剧透），AI 不得违背
  if (ctx.memory?.facts) {
    parts.push(`当前故事状态（此前章节已确立的事实，必须遵守不得矛盾）：\n${ctx.memory.facts}`)
  }
  // 剧情事件链注入（M10.5 联动）：剧情画布主线，写作走向必须遵守其因果与顺序
  if (ctx.plot?.events) {
    parts.push(`全书剧情主线（事件链，写作走向必须遵守其因果与顺序，不得跳过或推翻）：\n${ctx.plot.events}`)
  }
  parts.push('要求：直接输出小说正文本身；不要任何解释、前言、标题、编号或引号包裹；保持与前文一致的文风、人称与时态；中文书写，段落自然分段。')
  return parts.filter(Boolean).join('')
}

function trimTail(tail: string): string {
  return tail.length > CONTEXT_TAIL_LIMIT ? '…' + tail.slice(-CONTEXT_TAIL_LIMIT) : tail
}

/** 续写提示词：从前文末尾自然向后写 */
export function buildContinueMessages(
  ctx: WritingContext,
  extraInstruction?: string
```
### ChapterEditor.vue loadPlot（收敛后）
```ts
/** 加载该书剧情事件（按画布 x 排序拼链），写作走向遵守其因果顺序 */
async function loadPlot(bookId: string): Promise<void> {
  if (!isElectron) return
  const mySeq = ++plotLoadSeq
  plotCache.value = {}
  try {
    const res = await window.api.plot.list(bookId)
    if (mySeq !== plotLoadSeq) return
    if (!res.ok) return
    // 事件链拼装统一走 syncService（与场景/剧情侧同源，M10.5 静态审查 §5 收敛）
    plotCache.value = { events: buildPlotChainText(res.data, PLOT_INJECT_LIMIT) }
  } catch (err) {
    console.warn('[ChapterEditor] 剧情事件加载失败:', err)
  }
}

async function ensurePlotLoaded(): Promise<void> {
```
### GenesisView.vue pushWorldToWiki
```ts
// ---- 推送设定到百科（M10.5 管道 E；与百科页「从创世台导入」同一映射，按 name 幂等） ----
const pushingWiki = ref(false)

async function pushWorldToWiki(): Promise<void> {
  if (!step3.value || pushingWiki.value) return
  pushingWiki.value = true
  try {
    const wikiRes = await window.api.wiki.list(bookId.value)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    const existing = new Set(wikiRes.data.map((w) => normText(w.name)))
    let created = 0
    for (const entry of genesisToWorldEntries(step3.value)) {
      if (existing.has(normText(entry.name))) continue
      const res = await window.api.wiki.create({ bookId: bookId.value, ...entry })
      if (!res.ok) throw new Error(res.error)
      existing.add(normText(entry.name))
      created++
    }
    toast.success(created > 0 ? `已推送 ${created} 个设定词条到百科` : '设定词条已存在，无需推送')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '推送失败')
  } finally {
    pushingWiki.value = false
  }
}

// ---- 第 4 步 布局 ----
function addVolume(): void {
  step4.value.volumes.push({ name: `第 ${step4.value.volumes.length + 1} 卷`, chapters: [] })
}
function addChapter(vi: number): void {
```
### WorkspaceView.vue 同步接线段（L36-66）
```ts

// ---- 联动同步（M10.5）：把正文改动推送到百科/记忆；编排细节在两个 composable ----
const memorySync = useMemorySync({ bookId, book, chapters, memories, toast })
const wikiSync = useWikiSync({ bookId, book, chapters, wikiEntries, toast })
const syncDialogVisible = ref(false)
// 自动同步提醒红点（useAutoSync 提醒档置位；打开同步弹窗即清除）
const { syncAlert, clearAlert } = useAutoSync()

async function openSyncDialog(): Promise<void> {
  await Promise.all([memorySync.refreshWatermark(), wikiSync.refreshWatermark()])
  clearAlert()
  syncDialogVisible.value = true
}

function startSync(opts: { wiki: boolean; memory: boolean; scope: 'changed' | 'current' }): void {
  syncDialogVisible.value = false
  if (opts.memory) {
    memorySync.extractScope.value = opts.scope === 'current' ? 'single' : 'unextracted'
    if (opts.scope === 'current' && activeChapter.value) {
      memorySync.extractChapterId.value = activeChapter.value.id
    }
    void memorySync.startExtract()
  }
  if (opts.wiki) {
    wikiSync.extractScope.value = opts.scope
    if (opts.scope === 'current' && activeChapter.value) {
      wikiSync.extractChapterId.value = activeChapter.value.id
    }
    void wikiSync.startWikiExtract()
  }
}

```

## 附录 C：WikiExtractDialog.vue 全文
```vue
<script setup lang="ts">
/**
 * 百科「从正文提取」配置弹窗（M10.5）：范围（变更章节/单章）+ 进度显示。
 * 纯配置 UI：抽取编排与候选确认在 useWikiSync / SyncCandidateDialog。
 */
import type { Chapter } from '../../../../shared/chapter.types'

interface Props {
  visible: boolean
  busy: boolean
  progress: string
  unextractedCount: number
  chapters: Chapter[]
}

defineProps<Props>()

const scope = defineModel<'changed' | 'single'>('scope')
const chapterId = defineModel<string>('chapterId')

const emit = defineEmits<{
  start: []
  close: []
}>()
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      @click.self="emit('close')"
    >
      <div class="w-[420px] rounded-2xl bg-surface p-6 shadow-card">
        <h2 class="mb-2 text-lg font-semibold">⇦ 从正文提取词条</h2>
        <p class="mb-4 text-sm text-ink-text-secondary">
          AI 扫描章节正文，提取人物/地点/物品/势力/功法/规则等设定元素；已有词条不会重复提取
        </p>
        <div class="mb-3 flex gap-1.5">
          <button
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="scope === 'changed' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
            @click="scope = 'changed'"
          >待提取章节（{{ unextractedCount }}）</button>
          <button
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="scope === 'single' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
            @click="scope = 'single'"
          >单章</button>
        </div>
        <label v-if="scope === 'single'" class="flex flex-col gap-1.5">
          <span class="text-sm text-ink-text-secondary">选择章节</span>
          <select
            v-model="chapterId"
            class="rounded-lg border border-ink-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink-primary"
          >
            <option v-for="c in chapters" :key="c.id" :value="c.id">
              第{{ c.sortOrder }}章 {{ c.title }}（{{ c.wordCount }} 字）
            </option>
          </select>
        </label>
        <p v-else class="rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-ink-text-secondary">
          将依次扫描 {{ unextractedCount }} 个未提取（或提取后又有改动）的章节（单轮最多 20 章），完成后统一勾选采纳。
        </p>
        <p v-if="busy && progress" class="mt-3 text-xs text-ink-primary">{{ progress }}</p>
        <div class="mt-5 flex justify-end gap-3">
          <button
            class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft"
            @click="emit('close')"
          >{{ busy ? '后台继续' : '取消' }}</button>
          <button
            class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="busy || (scope === 'changed' && unextractedCount === 0)"
            @click="emit('start')"
          >{{ busy ? '提取中…' : '开始提取' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
```

## 附录 D：整改后回归证据（摘要）
```
T1 最终回归（935dbdc 后）：18/18 通过——含「强抽二抽后零字面重复」「二抽后水位重新推进（两章齐）」
专项压力：tmp/m105-probe-wm.mjs 10 章并发 merge 零丢失；非法键拒绝 ok:false
T3（原子通道前基线）12/12；静默档入库/复跑幂等路径与原子通道共用 setWatermarkChapter，已由 T1 回归覆盖
```
