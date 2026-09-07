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

  // 章节列表由本 composable 自管理（剧情页不加载章节，首次提取时拉取）
  const chapters = ref<Chapter[]>([])
  async function ensureChapters(): Promise<void> {
    if (chapters.value.length > 0) return
    const res = await window.api.chapters.list(bookId())
    if (res.ok) chapters.value = res.data
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
