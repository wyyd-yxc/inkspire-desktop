# M10.6+M10.7 验收材料 r2（一轮回应 + 截断盲区源码补齐）

> 主体：material-M10.6-M10.7.md。一轮审查：llm-review-2026-09-07-18-10-.md（TokenRhythm glm-5，有条件通过）。
> 注：切换 GMI→TokenRhythm 系 GMI 额度耗尽（HTTP 402），glm-5 为备用档案（HANDOVER 登记在案）。

## 一轮问题处置

| 一轮条目 | 处置 |
|---|---|
| 严重-1 diff 截断致核心逻辑盲区 | **补附录全量源码**（附录 A）：useReverseSync.ts / usePlotSync.ts / wikiPrompts.ts(extractEntityName/genesisToWorldEntries) / useWikiCleanup.ts / reverseSyncPrompts.ts |
| 一般-2 findDuplicate 全表扫描 | 登记不改：单书词条量级几十条、better-sqlite3 同步内存遍历微秒级；LIKE 预筛无法表达「前缀包含双向+normText 归一」，重构收益为负。技术债登记 |
| 建议-3 书名号过滤 | **已整改**：normText/normNameDup 过滤集补《》〈〉【】〔〕（渲染层+主进程同步，commit 待查）。口径确认：严查重符合预期（「林昭」与「《林昭》」判重） |
| 无法判定 1-4 | 附录 A 源码 + 黑盒运行验证（正文替换 diff 断言/引用转移/剧情提取去重均有自测实证，黑盒将复测） |

## 附录 A：核心源码
### src/renderer/src/composables/useReverseSync.ts
```ts
/**
 * 反向受限更新编排（M10.7 正文中枢）：其它模块（词条/剧情事件）变更 → 扫描正文与关联模块中的
 * 旧表述 → AI 定位 + 防幻觉双校验（quote 逐字存在且包含旧值）+ 连带确定性扫描 →
 * SyncCandidateDialog「原文→建议」逐处勾选 → 应用（正文仅文本节点内替换，绝不碰无关部分）。
 */
import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import type { Chapter } from '../../../shared/chapter.types'
import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildLocateMessages,
  chaptersMentioning,
  htmlToText,
  parseLocate
} from '../services/reverseSyncPrompts'
import type { useToast } from './useToast'

/** 一条待应用的反向修订 */
interface ReverseEdit {
  kind: 'chapter' | 'memory' | 'plot' | 'scene'
  targetId: string
  quote: string
  suggestion: string
  /** 确定性替换的旧/新值（应用时 quote 内只换这对值，AI suggestion 仅定位不参与改写——保证无关部分逐字节不变） */
  oldValue: string
  newValue: string
  /** 非正文目标的宿主上下文（chapterId 供场景定位；plot 存字段名） */
  hostChapterId?: string
}

/** 章节字数统计（与 ChapterEditor.countWords 同口径：去全部空白） */
function countWords(text: string): number {
  return text.replace(/\s/g, '').length
}

/** 正文 HTML 定点替换（M10.7）：quote 校验通过后，该章文本节点内做 oldValue→newValue 的确定性替换。
 *  逐文本节点替换保证段落结构与无关文字逐字节不变（跨段 quote 不会合并段落）。
 *  语义：勾选一个 quote 即替换该章内该旧值的全部出现（改名语义本应如此）。 */
function replaceInHtml(
  html: string,
  oldValue: string,
  newValue: string
): { html: string; replaced: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let replaced = 0
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent ?? ''
        if (t.includes(oldValue)) {
          child.textContent = t.split(oldValue).join(newValue)
          replaced++
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child)
      }
    }
  }
  walk(doc.body)
  return { html: doc.body.innerHTML, replaced }
}

export function useReverseSync(deps: {
  bookId: string | MaybeRefOrGetter<string>
  toast: ReturnType<typeof useToast>
}) {
  const { toast } = deps
  const bookId = () => toValue(deps.bookId)

  const scanning = ref(false)
  const applying = ref(false)
  const candidateDialogVisible = ref(false)
  const candidateItems = ref<SyncCandidateItem[]>([])
  const candidateTitle = ref('同步旧表述到正文与关联模块')
  const candidateDescription = ref('')
  let pendingEdits: ReverseEdit[] = []
  let activeSession: StreamSession | null = null

  /** 传播入口：实体某名称类字段从 oldValue 变为 newValue */
  async function propagate(entity: {
    kind: 'wiki' | 'plot'
    oldValue: string
    newValue: string
    context?: string
  }): Promise<void> {
    const oldValue = entity.oldValue.trim()
    if (scanning.value || !oldValue || oldValue === entity.newValue.trim()) return
    scanning.value = true
    try {
      const chaptersRes = await window.api.chapters.list(bookId())
      if (!chaptersRes.ok) throw new Error(chaptersRes.error)
      const chapters: Chapter[] = chaptersRes.data
      const chapterTitleById = new Map(chapters.map((c) => [c.id, c]))

      // 1) 本地粗筛 + AI 定位（命中章才送 AI）
      const hits = chaptersMentioning(chapters, oldValue)
      const edits: ReverseEdit[] = []
      let hallucinationRejected = 0
      if (hits.length > 0) {
        const messages = buildLocateMessages({
          entityKind: entity.kind === 'wiki' ? '设定词条' : '剧情事件',
          oldValue,
          newValue: entity.newValue,
          context: entity.context ?? '',
          hits: hits.map((h) => ({
            chapterTitle: `第${h.chapter.sortOrder}章 ${h.chapter.title}`,
            chapterId: h.chapter.id,
            text: h.text
          }))
        })
        let acc = ''
        const promise = new Promise<string>((resolve, reject) => {
          void generateWriting(messages, {
            onChunk: (t) => {
              acc += t
            },
            onDone: () => resolve(acc),
            onError: (m) => reject(new Error(m))
          }).then(({ session }) => {
            activeSession = session
          })
        })
        const located = parseLocate(await promise)
        // 防幻觉双校验：quote 逐字存在于该章纯文本，且包含旧值
        const textById = new Map(hits.map((h) => [h.chapter.id, h.text]))
        for (const hit of located) {
          const plain = textById.get(hit.chapterId)
          if (!plain) continue
          if (!plain.includes(hit.quote) || !hit.quote.includes(oldValue)) {
            hallucinationRejected++
            continue
          }
          const ch = chapterTitleById.get(hit.chapterId)
          edits.push({
            kind: 'chapter',
            targetId: hit.chapterId,
            quote: hit.quote,
            suggestion: hit.suggestion,
            oldValue,
            newValue: entity.newValue
          })
          void ch
        }
      }

      // 2) 连带确定性扫描（记忆/剧情/场景中的旧值子串）
      const memRes = await window.api.memories.list(bookId())
      for (const m of memRes.ok ? memRes.data : []) {
        if (m.content.includes(oldValue)) {
          edits.push({
            kind: 'memory',
            targetId: m.id,
            quote: oldValue,
            suggestion: entity.newValue,
            oldValue,
            newValue: entity.newValue
          })
        }
      }
      const plotRes = await window.api.plot.list(bookId())
      for (const p of plotRes.ok ? plotRes.data : []) {
        for (const field of ['title', 'description'] as const) {
          if (p[field].includes(oldValue)) {
            edits.push({
              kind: 'plot',
              targetId: p.id,
              quote: oldValue,
              suggestion: entity.newValue,
              oldValue,
              newValue: entity.newValue,
              hostChapterId: field
            })
          }
        }
      }
      for (const ch of chapters) {
        const sRes = await window.api.scenes.list(ch.id)
        for (const sc of sRes.ok ? sRes.data : []) {
          if (sc.summary.includes(oldValue)) {
            edits.push({
              kind: 'scene',
              targetId: sc.id,
              quote: oldValue,
              suggestion: entity.newValue,
              oldValue,
              newValue: entity.newValue,
              hostChapterId: ch.id
            })
          }
        }
      }

      if (edits.length === 0) {
        toast.info(
          '正文与关联模块中没有出现旧表述' +
            (hits.length > 0 ? `（AI 建议中 ${hallucinationRejected} 条未通过原文校验已剔除）` : '')
        )
        return
      }
      // 候选面板（正文项 oldText/newText 展示整句对照；连带项展示字段级替换）
      pendingEdits = edits
      candidateItems.value = edits.map((e, i) => {
        if (e.kind === 'chapter') {
          const ch = chapterTitleById.get(e.targetId)
          return {
            key: `rev:chapter:${i}`,
            title: e.suggestion,
            detail: `原文：${e.quote}`,
            source: `第${ch?.sortOrder ?? '?'}章 ${ch?.title ?? ''}` + (edits.length ? '' : ''),
            tag: '正文修订',
            oldText: e.quote,
            newText: e.quote.split(e.oldValue).join(e.newValue),
            checked: true
          }
        }
        const label =
          e.kind === 'memory' ? '作品记忆' : e.kind === 'plot' ? '剧情事件' : '场景摘要'
        return {
          key: `rev:${e.kind}:${i}`,
          title: e.suggestion,
          detail: `包含旧表述的${label}条目`,
          source: label,
          tag: label,
          oldText: e.quote,
          newText: e.quote.split(e.oldValue).join(e.newValue),
          checked: true
        }
      })
      candidateTitle.value = `同步旧表述「${oldValue}」`
      candidateDescription.value = `共 ${edits.length} 处建议修改（AI 建议已逐条对照原文校验${hallucinationRejected ? `，剔除 ${hallucinationRejected} 条无法定位的幻觉建议` : ''}）。只替换勾选项，其余内容一个字不动。`
      candidateDialogVisible.value = true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '扫描失败')
    } finally {
      scanning.value = false
    }
  }

  /** 应用勾选修订：正文走文本节点定点替换；记忆/剧情/场景走字段替换 */
  async function applyEdits(checked: SyncCandidateItem[]): Promise<void> {
    if (applying.value) return
    applying.value = true
    try {
      let applied = 0
      let skipped = 0
      for (const item of checked) {
        const idx = Number(item.key.split(':').pop())
        const edit = pendingEdits[idx]
        if (!edit) continue
        if (edit.kind === 'chapter') {
          const res = await window.api.chapters.get(edit.targetId)
          if (!res.ok) {
            skipped++
            continue
          }
          const { html, replaced } = replaceInHtml(res.data.content, edit.oldValue, edit.newValue)
          if (replaced === 0) {
            skipped++
            continue
          }
          const plainText = htmlToText(html)
          const save = await window.api.chapters.update(edit.targetId, {
            content: html,
            wordCount: countWords(plainText)
          })
          if (!save.ok) throw new Error(save.error)
          applied++
        } else if (edit.kind === 'memory') {
          const listRes = await window.api.memories.list(bookId())
          const m = (listRes.ok ? listRes.data : []).find((x) => x.id === edit.targetId)
          if (!m || !m.content.includes(edit.quote)) {
            skipped++
            continue
          }
          const save = await window.api.memories.update(edit.targetId, {
            content: m.content.split(edit.quote).join(edit.suggestion)
          })
          if (!save.ok) throw new Error(save.error)
          applied++
        } else if (edit.kind === 'plot') {
          const listRes = await window.api.plot.list(bookId())
          const p = (listRes.ok ? listRes.data : []).find((x) => x.id === edit.targetId)
          if (!p) {
            skipped++
            continue
          }
          const field = edit.hostChapterId === 'title' ? 'title' : 'description'
          if (!p[field].includes(edit.quote)) {
            skipped++
            continue
          }
          const save = await window.api.plot.update(edit.targetId, {
            [field]: p[field].split(edit.quote).join(edit.suggestion)
          })
          if (!save.ok) throw new Error(save.error)
          applied++
        } else {
          const listRes = await window.api.scenes.list(edit.hostChapterId ?? '')
          const sc = (listRes.ok ? listRes.data : []).find((x) => x.id === edit.targetId)
          if (!sc || !sc.summary.includes(edit.quote)) {
            skipped++
            continue
          }
          const save = await window.api.scenes.update(edit.targetId, {
            summary: sc.summary.split(edit.quote).join(edit.suggestion)
          })
          if (!save.ok) throw new Error(save.error)
          applied++
        }
      }
      toast.success(
        `已应用 ${applied} 处修改` + (skipped > 0 ? `，${skipped} 处因原文已变化被跳过` : '')
      )
      candidateDialogVisible.value = false
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '应用失败')
    } finally {
      applying.value = false
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  return {
    scanning,
    applying,
    candidateDialogVisible,
    candidateTitle,
    candidateDescription,
    candidateItems,
    propagate,
    applyEdits,
    stopEverything
  }
}
```
### src/renderer/src/composables/usePlotSync.ts
```ts
/**
 * 剧情提取编排（M10.7 正文中枢）：正文→剧情事件。选章/变更章 → 逐章 AI 回溯事件 →
 * 标题 isWikiNameDup 去重（对已有事件+批内）→ SyncCandidateDialog 勾选 → 落库（按章节序横排+tags 标第N章）
 * → 水位推进。与 useWikiSync 同范式；无独立配置弹窗（工作台 SyncDialog 或剧情页按钮驱动）。
 */
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { PlotEvent } from '../../../shared/plot.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import { buildPlotExtractMessages, parsePlotEventGen } from '../services/plotPrompts'
import {
  buildPlotChainText,
  changedChapters,
  getWatermark,
  isWikiNameDup,
  normText,
  PLOT_WATERMARK_KEY,
  setWatermarkChapter,
  type SyncWatermark
} from '../services/syncService'
import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { useToast } from './useToast'

/** 单轮提取章节上限（手动触发） */
const MAX_CHAPTERS_PER_RUN = 20

export function usePlotSync(deps: {
  bookId: string | MaybeRefOrGetter<string>
  book: Ref<Pick<Book, 'title' | 'genre' | 'description'> | null>
  events: Ref<PlotEvent[]>
  toast: ReturnType<typeof useToast>
}) {
  const { book, events, toast } = deps
  const bookId = () => toValue(deps.bookId)

  // 章节列表由本 composable 自管理（剧情页不加载章节，首次提取时拉取）。
  // 必须按 bookId 失效：Vue Router 跨书导航复用组件实例，陈旧缓存会拿上一本书的章节算水位
  // （表现为「没有待提取的章节」——M10.7 自测实锤）
  const chapters = ref<Chapter[]>([])
  let chaptersLoadedFor = ''
  async function ensureChapters(): Promise<void> {
    if (chaptersLoadedFor === bookId() && chapters.value.length > 0) return
    const res = await window.api.chapters.list(bookId())
    if (res.ok) {
      chapters.value = res.data
      chaptersLoadedFor = bookId()
    }
  }

  const runProgress = ref('')
  const isBusy = ref(false)
  let activeSession: StreamSession | null = null

  const candidateDialogVisible = ref(false)
  const candidateItems = ref<SyncCandidateItem[]>([])
  const candidateDescription = ref('')
  let pendingCreates = new Map<string, { title: string; description: string; tags: string[]; chapterNo: number }>()

  const watermark = ref<SyncWatermark>({})
  async function refreshWatermark(): Promise<void> {
    watermark.value = await getWatermark(PLOT_WATERMARK_KEY)
    await ensureChapters()
  }
  const unextracted = computed(() => changedChapters(chapters.value, watermark.value))

  /** 单章静默提取（无流式面板） */
  async function extractOnce(ch: Chapter): Promise<Array<{ title: string; description: string; tags: string[] }>> {
    const text = ch.content.replace(/<[^>]+>/g, '').trim()
    if (!text) throw new Error(`「${ch.title}」还没有正文`)
    if (!book.value) throw new Error('书籍信息未加载')
    const messages = buildPlotExtractMessages(
      book.value,
      ch.title,
      ch.sortOrder,
      text,
      buildPlotChainText(events.value, 800)
    )
    let acc = ''
    const promise = new Promise<string>((resolve, reject) => {
      void generateWriting(messages, {
        onChunk: (t) => {
          acc += t
        },
        onDone: () => resolve(acc),
        onError: (m) => reject(new Error(m))
      }).then(({ session }) => {
        activeSession = session
      })
    })
    return parsePlotEventGen(await promise)
  }

  /** 开始提取（changed=未提取章节批量 / single=指定章）。完成后打开候选面板 */
  async function startExtract(scope: 'changed' | 'single', singleChapterId?: string): Promise<void> {
    if (isBusy.value) return
    isBusy.value = true
    await ensureChapters()
    try {
      let targets: Chapter[]
      if (scope === 'single') {
        const ch = chapters.value.find((c) => c.id === singleChapterId)
        if (!ch) return
        targets = [ch]
      } else {
        await refreshWatermark()
        const changed = changedChapters(chapters.value, watermark.value)
        if (changed.length === 0) {
          toast.info('没有待提取的章节（全部章节都已提取且未改动）')
          return
        }
        targets = changed.slice(0, MAX_CHAPTERS_PER_RUN)
        if (changed.length > targets.length) {
          toast.info(`本轮最多处理 ${MAX_CHAPTERS_PER_RUN} 章，其余章节请再次执行`)
        }
      }
      const collected: Array<{ title: string; description: string; tags: string[]; chapterNo: number }> = []
      const involved: string[] = []
      for (let i = 0; i < targets.length; i++) {
        const ch = targets[i]
        runProgress.value = `${i + 1}/${targets.length} · 第${ch.sortOrder}章 ${ch.title}`
        try {
          const parsed = await extractOnce(ch)
          for (const p of parsed) collected.push({ ...p, chapterNo: ch.sortOrder })
          involved.push(ch.id)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('已中止')) break
          throw err
        }
      }
      handleParsed(collected, involved)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提取失败'
      if (!msg.includes('已中止')) toast.error(msg)
    } finally {
      isBusy.value = false
      runProgress.value = ''
    }
  }

  /** 候选去重（对已有事件 + 批内，标题级 isWikiNameDup）→ 面板 */
  function handleParsed(
    list: Array<{ title: string; description: string; tags: string[]; chapterNo: number }>,
    chapterIds: string[]
  ): void {
    const dup = (title: string): boolean =>
      events.value.some((e) => isWikiNameDup(title, 'plot', e.title, 'plot')) ||
      list.some((o) => o !== undefined && o.title !== title && normText(o.title) === normText(title))
    const seenTitles: string[] = []
    let dupCount = 0
    const unique = list.filter((p) => {
      if (!p.title.trim() || dup(p.title) || seenTitles.some((t) => normText(t) === normText(p.title))) {
        dupCount++
        return false
      }
      seenTitles.push(p.title)
      return true
    })
    if (unique.length === 0) {
      toast.info(`AI 未提取到新事件（${dupCount} 条与已有事件重复，已自动跳过）`)
      if (chapterIds.length > 0) void advanceWatermark(new Set(chapterIds))
      return
    }
    pendingCreates = new Map(unique.map((p, i) => [`${p.chapterNo}:${i}`, p]))
    candidateItems.value = unique.map((p, i) => ({
      key: `${p.chapterNo}:${i}`,
      title: p.title,
      detail: p.description,
      source: `第${p.chapterNo}章 · ${p.tags.filter((t) => !t.startsWith('第')).join('/') || '事件'}`,
      tag: `第${p.chapterNo}章`,
      checked: true
    }))
    candidateDescription.value =
      `共 ${unique.length} 条事件候选${dupCount > 0 ? `，已自动跳过 ${dupCount} 条重复` : ''}。采纳后按章节顺序横向排布上画布；取消勾选的章节不推进水位。`
    candidateDialogVisible.value = true
  }

  /** 采纳：按章节序落位（每章占一列距，同章事件纵排），复检 + 推水位 */
  async function onCandidatesConfirm(checked: SyncCandidateItem[]): Promise<void> {
    let created = 0
    let dupSkipped = 0
    const acceptedChapters = new Set<string>()
    try {
      // 按章节序分组落位
      const byChapter = new Map<number, Array<{ title: string; description: string; tags: string[] }>>()
      for (const item of checked) {
        const p = pendingCreates.get(item.key)
        if (!p) continue
        const arr = byChapter.get(p.chapterNo) ?? []
        arr.push(p)
        byChapter.set(p.chapterNo, arr)
      }
      const chapterNos = [...byChapter.keys()].sort((a, b) => a - b)
      let col = 0
      for (const no of chapterNos) {
        const arr = byChapter.get(no) ?? []
        for (let row = 0; row < arr.length; row++) {
          const p = arr[row]
          const dup = events.value.some((e) => isWikiNameDup(p.title, 'plot', e.title, 'plot'))
          if (dup) {
            dupSkipped++
            acceptedChapters.add(chapterIdByNo(no))
            continue
          }
          // tags 强制第一项为第N章（不信任 AI 输出的标签）
          const safeTags = [`第${no}章`, ...p.tags.filter((t) => !String(t).startsWith('第'))].slice(0, 3)
          const res = await window.api.plot.create({
            bookId: bookId(),
            title: p.title,
            description: p.description,
            tags: safeTags,
            posX: 160 + col * 340,
            posY: 160 + row * 220
          })
          if (!res.ok) throw new Error(res.error)
          events.value.push(res.data)
          created++
        }
        acceptedChapters.add(chapterIdByNo(no))
        col++
      }
      await advanceWatermark(acceptedChapters)
      toast.success(
        `已提取 ${created} 个剧情事件上画布` + (dupSkipped > 0 ? `，跳过 ${dupSkipped} 条重复` : '')
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入库失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  /** 章节序号 → 章节 id（落水位用） */
  function chapterIdByNo(no: number): string {
    return chapters.value.find((c) => c.sortOrder === no)?.id ?? ''
  }

  async function advanceWatermark(chapterIds: Set<string>): Promise<void> {
    for (const id of chapterIds) {
      if (!id) continue
      const ch = chapters.value.find((c) => c.id === id)
      if (ch) watermark.value = await setWatermarkChapter(PLOT_WATERMARK_KEY, watermark.value, id, ch.wordCount)
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  return {
    runProgress,
    isBusy,
    unextracted,
    refreshWatermark,
    candidateDialogVisible,
    candidateItems,
    candidateDescription,
    startExtract,
    stopEverything,
    onCandidatesConfirm
  }
}
```
### src/renderer/src/composables/useWikiCleanup.ts
```ts
/**
 * 百科词条整理编排（M10.6）：病态名修复（确定性）→ 本地近似分组 → AI 近似合并建议 →
 * SyncCandidateDialog 勾选采纳 → 引用转移（剧情/场景 wiki_refs 换 id）+ 摘要拼接 + 删除被并条。
 * 判定统一走 isWikiNameDup（normText 全等 / 同类型前缀包含），与主进程 DAO 兜底同规则。
 */
import { ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { WikiEntry } from '../../../shared/wiki.types'
import { WIKI_TYPE_LABELS } from '../../../shared/wiki.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildWikiDedupMessages,
  extractEntityName,
  parseWikiDedup,
  type WikiMergeSuggestion
} from '../services/wikiPrompts'
import { isWikiNameDup } from '../services/syncService'
import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { useToast } from './useToast'

/** 病态名判定：创世导入标记 + 超长（历史 firstLine 60 字截断的产物） */
function isBadName(e: WikiEntry): boolean {
  return e.name.length > 20 && e.summary.includes('导入自创世台')
}

/** 实质摘要（排除导入标记占位） */
function realSummary(e: WikiEntry): string {
  const s = e.summary.trim()
  if (!s || s.includes('导入自创世台')) return ''
  return s
}

export function useWikiCleanup(deps: {
  bookId: string | MaybeRefOrGetter<string>
  wikiEntries: Ref<WikiEntry[]>
  toast: ReturnType<typeof useToast>
}) {
  const { wikiEntries, toast } = deps
  const bookId = () => toValue(deps.bookId)

  const cleanupRunning = ref(false)
  const candidateDialogVisible = ref(false)
  const candidateTitle = ref('合并重复词条')
  const candidateDescription = ref('')
  const candidateItems = ref<SyncCandidateItem[]>([])
  let activeSession: StreamSession | null = null
  /** 待执行合并组（面板勾选后回查） */
  let pendingMerges: WikiMergeSuggestion[] = []

  /** 引用转移：剧情事件/场景的 wiki_refs 中 fromIds 换成 toId，返回受影响条数 */
  async function transferRefs(fromIds: string[], toId: string): Promise<number> {
    let touched = 0
    const plotRes = await window.api.plot.list(bookId())
    for (const ev of plotRes.ok ? plotRes.data : []) {
      if (ev.wikiRefs.some((r) => fromIds.includes(r))) {
        const res = await window.api.plot.update(ev.id, {
          wikiRefs: ev.wikiRefs.map((r) => (fromIds.includes(r) ? toId : r))
        })
        if (res.ok) touched++
      }
    }
    const chRes = await window.api.chapters.list(bookId())
    for (const ch of chRes.ok ? chRes.data : []) {
      const sRes = await window.api.scenes.list(ch.id)
      for (const sc of sRes.ok ? sRes.data : []) {
        if (sc.wikiRefs.some((r) => fromIds.includes(r))) {
          const res = await window.api.scenes.update(sc.id, {
            wikiRefs: sc.wikiRefs.map((r) => (fromIds.includes(r) ? toId : r))
          })
          if (res.ok) touched++
        }
      }
    }
    return touched
  }

  /** 本地近似分组（同类型两两 isWikiNameDup 连通分量），返回每组的条目列表 */
  function localGroups(entries: WikiEntry[]): WikiEntry[][] {
    const groups: WikiEntry[][] = []
    for (const e of entries) {
      const hit = groups.find((g) =>
        g.some((m) => isWikiNameDup(e.name, e.type, m.name, m.type))
      )
      if (hit) hit.push(e)
      else groups.push([e])
    }
    return groups.filter((g) => g.length >= 2)
  }

  /** 组内保留条：名称最短（平手取最早创建） */
  function pickKeep(group: WikiEntry[]): WikiEntry {
    return [...group].sort(
      (a, b) => a.name.length - b.name.length || a.createdAt.localeCompare(b.createdAt)
    )[0]
  }

  /** AI 近似合并建议（词条 ≥6 才跑，控制成本；失败静默降级为仅本地组） */
  async function aiGroups(entries: WikiEntry[]): Promise<WikiMergeSuggestion[]> {
    if (entries.length < 6) return []
    try {
      const messages = buildWikiDedupMessages(
        entries.map((e) => ({
          id: e.id,
          type: e.type,
          typeName: WIKI_TYPE_LABELS[e.type],
          name: e.name,
          summary: realSummary(e)
        }))
      )
      let acc = ''
      const promise = new Promise<string>((resolve, reject) => {
        void generateWriting(messages, {
          onChunk: (t) => {
            acc += t
          },
          onDone: () => resolve(acc),
          onError: (m) => reject(new Error(m))
        }).then(({ session }) => {
          activeSession = session
        })
      })
      const validIds = new Set(entries.map((e) => e.id))
      return parseWikiDedup(await promise, validIds)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('已中止')) toast.info(`AI 近似分析不可用（${msg.slice(0, 40)}），仅使用本地规则结果`)
      return []
    }
  }

  /** 整理入口：病态名自动修复 → 本地近似组 + AI 近似组 → 候选面板 */
  async function runCleanup(): Promise<void> {
    if (cleanupRunning.value) return
    cleanupRunning.value = true
    try {
      // a) 病态名确定性修复（60 字整段名 → 实体名；修复后撞名则转入合并组）
      let renamed = 0
      const mergeCandidates = new Map<string, WikiEntry[]>() // keepId -> 组成员
      for (const e of wikiEntries.value.filter(isBadName)) {
        const fallback = e.type === 'character' ? '主角' : '世界规则'
        const newName = extractEntityName(e.name, fallback)
        const clash = wikiEntries.value.find(
          (w) => w.id !== e.id && isWikiNameDup(newName, e.type, w.name, w.type)
        )
        if (newName !== e.name && !clash) {
          const res = await window.api.wiki.update(e.id, { name: newName })
          if (res.ok) {
            e.name = res.data.name
            renamed++
            continue
          }
        }
        if (clash) {
          const arr = mergeCandidates.get(clash.id) ?? []
          arr.push(e)
          mergeCandidates.set(clash.id, arr)
        }
      }
      if (renamed > 0) toast.success(`已修复 ${renamed} 条病态词条名`)
      else if (mergeCandidates.size === 0) toast.info('没有发现需要修复的病态词条名')

      // b) 本地近似组（基于修复后列表；病态撞名组一并纳入）
      const local = localGroups(wikiEntries.value)
      const usedIds = new Set(local.flat().map((e) => e.id))
      for (const [keepId, members] of mergeCandidates) {
        if (usedIds.has(keepId)) continue
        const keep = wikiEntries.value.find((e) => e.id === keepId)
        if (keep) local.push([keep, ...members])
      }

      // c) AI 近似组（与本地组去重：已入本地组的条目不再进 AI 组）
      const rest = wikiEntries.value.filter((e) => !usedIds.has(e.id))
      const ai = (await aiGroups(rest)).filter((g) =>
        [g.keepId, ...g.mergeIds].some((id) => !usedIds.has(id))
      )

      // d) 候选面板
      const items: SyncCandidateItem[] = []
      pendingMerges = []
      for (const g of local) {
        const keep = pickKeep(g)
        const merges = g.filter((m) => m.id !== keep.id)
        pendingMerges.push({ keepId: keep.id, mergeIds: merges.map((m) => m.id) })
        items.push({
          key: `wmerge:${keep.id}`,
          title: keep.name,
          detail: `并入：${merges.map((m) => m.name).join('、')}`,
          source: `${WIKI_TYPE_LABELS[keep.type]} · 保留条摘要不变，被并条如有实质简介将拼接`,
          checked: true
        })
      }
      const restById = new Map(rest.map((e) => [e.id, e]))
      for (const g of ai) {
        const keep = restById.get(g.keepId)
        if (!keep) continue
        const merges = g.mergeIds.map((id) => restById.get(id)).filter((e): e is WikiEntry => !!e)
        if (merges.length === 0) continue
        pendingMerges.push({ keepId: keep.id, mergeIds: merges.map((m) => m.id) })
        items.push({
          key: `wmerge:${keep.id}:${merges[0].id}`,
          title: keep.name,
          detail: `并入：${merges.map((m) => m.name).join('、')}`,
          source: `${WIKI_TYPE_LABELS[keep.type]} · AI 近似判断`,
          checked: true
        })
      }
      if (items.length === 0) {
        toast.info('没有发现可合并的重复词条')
        return
      }
      candidateTitle.value = '合并重复词条'
      candidateDescription.value = `共 ${items.length} 组候选。采纳后：引用（剧情事件/场景挂接）自动转移到保留条，被并条删除。取消勾选的组保持原样。`
      candidateItems.value = items
      candidateDialogVisible.value = true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '整理失败')
    } finally {
      cleanupRunning.value = false
    }
  }

  /** 面板采纳：引用转移 → 摘要拼接 → 删被并条 */
  async function confirmMerges(checked: SyncCandidateItem[]): Promise<void> {
    let merged = 0
    let refs = 0
    try {
      for (const item of checked) {
        const g = pendingMerges.find((p) => item.key === `wmerge:${p.keepId}` || item.key.startsWith(`wmerge:${p.keepId}:`))
        if (!g) continue
        const keep = wikiEntries.value.find((e) => e.id === g.keepId)
        if (!keep) continue
        const merges = g.mergeIds
          .map((id) => wikiEntries.value.find((e) => e.id === id))
          .filter((e): e is WikiEntry => !!e)
        refs += await transferRefs(
          merges.map((m) => m.id),
          keep.id
        )
        if (!realSummary(keep)) {
          const first = merges.map(realSummary).find(Boolean)
          if (first) {
            const res = await window.api.wiki.update(keep.id, { summary: first })
            if (res.ok) keep.summary = res.data.summary
          }
        }
        for (const m of merges) {
          const res = await window.api.wiki.remove(m.id)
          if (!res.ok) throw new Error(res.error)
        }
        wikiEntries.value = wikiEntries.value.filter((e) => !g.mergeIds.includes(e.id))
        merged++
      }
      toast.success(`已合并 ${merged} 组词条` + (refs > 0 ? `，转移 ${refs} 处引用` : ''))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '合并失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  return {
    cleanupRunning,
    candidateDialogVisible,
    candidateTitle,
    candidateDescription,
    candidateItems,
    runCleanup,
    confirmMerges,
    stopEverything
  }
}
```
### src/renderer/src/services/reverseSyncPrompts.ts
```ts
/**
 * 反向同步提示词与文本工具（M10.7 正文中枢：其它模块变更 → 正文受限更新）。
 * AI 只负责「定位旧表述出现处并建议改写」，quote 必须逐字来自原文（应用前双重校验防幻觉）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Chapter } from '../../../shared/chapter.types'
import { lenientParse } from './jsonRepair'

/** HTML → 纯文本（存储正文为 <p>…</p>；实体按存储习惯解码） */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** 本地粗筛：章节纯文本包含旧值（或旧值前 2+ 字任一实质片段）才送 AI，控制上下文体量 */
export function chaptersMentioning(
  chapters: Chapter[],
  oldValue: string,
  perChapterTextLimit = 4000
): Array<{ chapter: Chapter; text: string }> {
  const key = oldValue.trim()
  if (!key) return []
  const hits: Array<{ chapter: Chapter; text: string }> = []
  for (const ch of chapters) {
    const text = htmlToText(ch.content)
    if (text.includes(key)) {
      hits.push({ chapter: ch, text: text.slice(0, perChapterTextLimit) })
    }
  }
  return hits
}

/** 定位候选（AI 输出解析产物） */
export interface LocateHit {
  chapterId: string
  quote: string
  suggestion: string
  reason: string
}

/** AI 定位提示词：给出含旧值的章节文本，要求逐字引用原文片段并给出改写 */
export function buildLocateMessages(params: {
  entityKind: string
  oldValue: string
  newValue: string
  context: string
  hits: Array<{ chapterTitle: string; chapterId: string; text: string }>
}): ChatMessage[] {
  const chapterBlocks = params.hits
    .map((h) => `【${h.chapterTitle}｜id=${h.chapterId}】\n${h.text}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        '你是小说文本一致性校对助手。设定/情节信息变更后，需要找出正文中沿用旧表述的句子并给出原位改写建议。你只定位与改写，绝不虚构原文。'
    },
    {
      role: 'user',
      content: `【变更】${params.entityKind}「${params.oldValue}」已变更为「${params.newValue}」。${params.context ? `补充：${params.context}。` : ''}
【任务】在下列章节文本中找出所有沿用旧表述「${params.oldValue}」的句子，给出原位改写建议。
【硬性要求】
- quote 必须是章节文本中**逐字存在**的连续片段（10-80 字），且必须完整包含旧表述「${params.oldValue}」；
- suggestion 是把 quote 中的旧表述替换后的整句改写，只改与变更相关的部分，其余文字保持原样；
- 正文没有出现旧表述的章节直接跳过；宁缺毋滥。

严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  { "chapterId": "章节 id（原样使用清单中给出的 id）", "quote": "逐字原文片段", "suggestion": "改写后的整句", "reason": "一句话理由" }
]
没有需要修改的出 []。

章节文本：
${chapterBlocks}`
    }
  ]
}

/** 解析定位输出（宽容 JSON + 字段清洗；quote 逐字校验由调用方对原文执行） */
export function parseLocate(text: string): LocateHit[] {
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  const parsed = lenientParse<unknown>(text.slice(first, last + 1))
  if (!Array.isArray(parsed)) return []
  const out: LocateHit[] = []
  for (const h of parsed) {
    const o = h as Record<string, unknown>
    const quote = String(o.quote ?? '').trim()
    const suggestion = String(o.suggestion ?? '').trim()
    const chapterId = String(o.chapterId ?? '').trim()
    if (!quote || !suggestion || !chapterId || quote === suggestion) continue
    out.push({
      chapterId,
      quote: quote.slice(0, 120),
      suggestion: suggestion.slice(0, 200),
      reason: String(o.reason ?? '').trim().slice(0, 60)
    })
  }
  return out.slice(0, 20)
}
```
### wikiPrompts.ts extractEntityName 与 genesisToWorldEntries 段
```ts
/**
 * 创世台造世内容导入为词条（幂等：跳过已导入标记的段落）。
 * 「主角设定」→ 角色词条；「世界法则」→ 背景词条（injection=always 便于 AI 写作携带）。
 */

/** 实体名提取（M10.6 治本）：取首个分隔符前的自然名称段（≤20 字）；
 *  无分隔符或为空时回退默认名——防止整段设定文本被当成词条名（历史病态「林昭：青云宗弃徒…」的根因） */
export function extractEntityName(raw: string, fallback: string, max = 20): string {
  const line = raw.split('\n').find((l) => l.trim()) ?? ''
  const seg = line.split(/[：:，,。；;、！？!?]/).map((s) => s.trim()).find((s) => s.length > 0)
  if (!seg || seg.length > max) return fallback
  return seg
}

export function genesisToWorldEntries(
  world: Step3World
): Array<Pick<WikiEntry, 'type' | 'name' | 'summary' | 'content' | 'systemRole' | 'injection'>> {
  const entries: Array<Pick<WikiEntry, 'type' | 'name' | 'summary' | 'content' | 'systemRole' | 'injection'>> = []
  if (world.protagonist.trim()) {
    entries.push({
      type: 'character',
      name: extractEntityName(world.protagonist, '主角'),
      summary: '（导入自创世台·主角设定）',
      content: world.protagonist,
      systemRole: 'protagonist',
      injection: 'always'
    })
  }
  if (world.worldRules.trim()) {
    entries.push({
      type: 'lore',
      name: extractEntityName(world.worldRules, '世界规则'),
      summary: '（导入自创世台·世界法则）',
      content: world.worldRules,
      systemRole: 'rule',
      injection: 'always'
    })
  }
  return entries
}

// ---- 存量词条近似合并建议（M10.6 整理词条：AI 近似组） ----

/** 合并建议（AI 输出解析产物） */
export interface WikiMergeSuggestion {
  keepId: string
  mergeIds: string[]
}

/** 整理词条的 AI 近似合并提示词：找「同一实体/事物的不同称呼」组 */
export function buildWikiDedupMessages(
  entries: Array<{ id: string; type: string; typeName: string; name: string; summary: string }>
```
### main/db/wiki.ts（findDuplicate/兜底/normNameDup）
```ts
/** 实体名重复判定（M10.6）：与渲染层 syncService.isWikiNameDup 同款实现（跨进程不共享运行时，改动需两处同步） */
function normNameDup(aName: string, aType: string, bName: string, bType: string): boolean {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[。，、！？…；：“”‘’「」『』【】〔〕《》〈〉（）,.!?;:()[\]{}'"\-—~·]/g, '')
  const na = norm(aName)
  const nb = norm(bName)
  if (!na || !nb) return false
  if (na === nb) return true
  if (aType !== bType) return false
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  return short.length >= 2 && long.startsWith(short)
}

/** 查找与 (name,type) 重复的既有词条（M10.6 五入口统一查重的后端实现） */
export function findDuplicate(
  bookId: string,
  name: string,
  type: string,
  excludeId?: string
): { duplicate: boolean; matchedName: string } {
  const d: Database = getDb()
  const rows = d
    .prepare('SELECT id, name, type FROM wiki_entries WHERE book_id = ?')
    .all(bookId) as Array<{ id: string; name: string; type: string }>
  for (const r of rows) {
    if (excludeId && r.id === excludeId) continue
    if (normNameDup(name, type, r.name, r.type)) {
      return { duplicate: true, matchedName: r.name }
    }
  }
  return { duplicate: false, matchedName: '' }
}

export function createWikiEntry(input: CreateWikiInput): WikiEntry {
  const name = input.name.trim()
  if (!name) throw new Error('词条名称不能为空')
  // DAO 终极兜底查重（M10.6：任何渲染层入口漏检都不产生重复词条）
  const dup = findDuplicate(input.bookId, name, input.type)
  if (dup.duplicate) throw new Error(`已存在重复词条「${dup.matchedName}」`)
  const d: Database = getDb()
  const now = new Date().toISOString()
  const row: WikiRow = {
    id: randomUUID(),
    book_id: input.bookId,
    type: input.type,
    name,
    summary: input.summary?.trim() ?? '',
    content: input.content ?? '',
    attributes: JSON.stringify(input.attributes ?? []),
    relations: JSON.stringify(input.relations ?? []),
    system_role: input.systemRole ?? '',
    injection: input.injection ?? 'manual',
    created_at: now,
    updated_at: now
  }
```
