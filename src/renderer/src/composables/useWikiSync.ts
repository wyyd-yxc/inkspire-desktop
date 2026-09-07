/**
 * 设定集 AI 抽取编排（M10.5 正文→设定集）：扫描章节正文提取词条候选 →
 * SyncCandidateDialog 勾选采纳 → 入库（默认 injection='manual'，不自动进正文上下文）+ 水位推进。
 * 按 name 规范化幂等（不覆盖已有词条）；单轮上限 20 章防误触长任务。
 */
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { WikiEntry, WikiType } from '../../../shared/wiki.types'
import { WIKI_TYPE_LABELS } from '../../../shared/wiki.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildWikiExtractMessages,
  extractEntityName,
  parseWikiExtract,
  type WikiExtractCandidate
} from '../services/wikiPrompts'
import {
  changedChapters,
  getWatermark,
  isWikiNameDup,
  setWatermarkChapter,
  WIKI_WATERMARK_KEY,
  type SyncWatermark
} from '../services/syncService'
import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { useToast } from './useToast'

/** 单轮提取章节上限（手动触发；自动同步另有 3 章上限） */
const MAX_CHAPTERS_PER_RUN = 20

/** 已有词条清单文本（注入提取 prompt 防同名/同义；useAutoSync 静默档复用）。
 *  name 先经实体名规范化（M10.6：病态长名「林昭：青云宗弃徒…」会让 AI 无法识别与「林昭」重复） */
export function buildExistingWikiText(entries: WikiEntry[], limit = 1200): string {
  const lines = entries.map((w) => `- ${WIKI_TYPE_LABELS[w.type]}｜${extractEntityName(w.name, w.name.slice(0, 20))}`)
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > limit) break
    out.push(line)
    used += line.length
  }
  return out.join('\n')
}

export function useWikiSync(deps: {
  /** 支持 ComputedRef（WikiView 的 bookId 为响应式路由参数，防跨书导航拿旧 id） */
  bookId: string | MaybeRefOrGetter<string>
  book: Ref<Pick<Book, 'title' | 'genre' | 'description'> | null>
  chapters: Ref<Chapter[]>
  wikiEntries: Ref<WikiEntry[]>
  toast: ReturnType<typeof useToast>
}) {
  const { book, chapters, wikiEntries, toast } = deps
  const bookId = () => toValue(deps.bookId)

  const extractDialogVisible = ref(false)
  const extractScope = ref<'changed' | 'single'>('changed')
  const extractChapterId = ref('')
  const runProgress = ref('')
  const isBusy = ref(false)
  let activeSession: StreamSession | null = null

  const candidateDialogVisible = ref(false)
  const candidateTitle = ref('采纳新词条候选')
  const candidateDescription = ref('')
  const candidateItems = ref<SyncCandidateItem[]>([])
  let pendingCreates = new Map<string, WikiExtractCandidate & { chapterId: string; chapterNo: number }>()

  const watermark = ref<SyncWatermark>({})
  async function refreshWatermark(): Promise<void> {
    watermark.value = await getWatermark(WIKI_WATERMARK_KEY)
  }
  const unextracted = computed(() => changedChapters(chapters.value, watermark.value))

  async function openExtractDialog(): Promise<void> {
    if (chapters.value.length === 0) {
      toast.error('请先在正文中撰写章节内容')
      return
    }
    await refreshWatermark()
    extractScope.value = 'changed'
    extractChapterId.value = chapters.value[chapters.value.length - 1].id
    runProgress.value = ''
    extractDialogVisible.value = true
  }

  /** 单章静默抽取（无流式面板，弹窗内进度） */
  async function extractOnce(ch: Chapter): Promise<WikiExtractCandidate[]> {
    const text = ch.content.replace(/<[^>]+>/g, '').trim()
    if (!text) throw new Error(`「${ch.title}」还没有正文`)
    if (!book.value) throw new Error('书籍信息未加载')
    const messages = buildWikiExtractMessages(
      book.value,
      ch.title,
      ch.sortOrder,
      text,
      buildExistingWikiText(wikiEntries.value)
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
    return parseWikiExtract(await promise)
  }

  async function startWikiExtract(): Promise<void> {
    if (isBusy.value) return
    const scope = extractScope.value
    isBusy.value = true
    try {
      let targets: Chapter[]
      if (scope === 'single') {
        const ch = chapters.value.find((c) => c.id === extractChapterId.value)
        if (!ch) return
        targets = [ch]
      } else {
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
      const collected: Array<WikiExtractCandidate & { chapterId: string; chapterNo: number }> = []
      const involved: string[] = []
      for (let i = 0; i < targets.length; i++) {
        const ch = targets[i]
        runProgress.value = `${i + 1}/${targets.length} · 第${ch.sortOrder}章 ${ch.title}`
        try {
          const parsed = await extractOnce(ch)
          for (const c of parsed) collected.push({ ...c, chapterId: ch.id, chapterNo: ch.sortOrder })
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

  /** 候选按名称去重（M10.6：isWikiNameDup 全等+同类型前缀包含）→ 打开确认面板 */
  function handleParsed(
    list: Array<WikiExtractCandidate & { chapterId: string; chapterNo: number }>,
    chapterIds: string[]
  ): void {
    const dupAgainst = (name: string, type: string): boolean =>
      wikiEntries.value.some((w) => isWikiNameDup(name, type, w.name, w.type))
    const batchSeen: Array<{ name: string; type: string }> = []
    let dupCount = 0
    const unique: Array<WikiExtractCandidate & { chapterId: string; chapterNo: number }> = []
    for (const c of list) {
      if (
        !c.name.trim() ||
        dupAgainst(c.name, c.type) ||
        batchSeen.some((b) => isWikiNameDup(c.name, c.type, b.name, b.type))
      ) {
        dupCount++
        continue
      }
      batchSeen.push({ name: c.name, type: c.type })
      unique.push(c)
    }
    if (unique.length === 0) {
      toast.info(`AI 未提取到新词条（${dupCount} 条与已有词条重复，已自动跳过）`)
      if (chapterIds.length > 0) void advanceWatermark(new Set(chapterIds))
      return
    }
    // 混合场景：全部候选都是重复的章节视为已提取完成，立即推水位（防下轮重抽白耗额度）
    const chapterWithUnique = new Set(unique.map((c) => c.chapterId))
    const allDupChapters = [...new Set(list.map((c) => c.chapterId))].filter((id) => !chapterWithUnique.has(id))
    if (allDupChapters.length > 0) void advanceWatermark(new Set(allDupChapters))
    pendingCreates = new Map(unique.map((c, i) => [`${c.chapterNo}:${i}`, c] as const))
    candidateTitle.value = '采纳新词条候选'
    candidateItems.value = unique.map((c, i) => ({
      key: `${c.chapterNo}:${i}`,
      title: c.name,
      detail: c.summary,
      source: `第${c.chapterNo}章 ${chapters.value.find((x) => x.id === c.chapterId)?.title ?? ''}`,
      tag: WIKI_TYPE_LABELS[c.type as WikiType] ?? c.type,
      checked: true
    }))
    candidateDescription.value =
      `共 ${unique.length} 条新候选${dupCount > 0 ? `，已自动跳过 ${dupCount} 条与已有词条重复的候选` : ''}。` +
      '入库后默认「仅手动引用」，可在词条详情改为「全书长期生效」。取消勾选的章节不推进水位。'
    candidateDialogVisible.value = true
  }

  /** 确认采纳：逐条入库（默认 manual），入库前主进程 checkDup 复检（M10.6：防确认期间其它入口抢先入库），
   *  仅采纳了候选的章节推进水位 */
  async function onCandidatesConfirm(checked: SyncCandidateItem[]): Promise<void> {
    let created = 0
    let dupSkipped = 0
    const acceptedChapters = new Set<string>()
    try {
      for (const item of checked) {
        const c = pendingCreates.get(item.key)
        if (!c) continue
        const dup = await window.api.wiki.checkDup(bookId(), c.name, c.type as WikiType)
        if (res_ok(dup) && dup.data.duplicate) {
          dupSkipped++
          acceptedChapters.add(c.chapterId)
          continue
        }
        const res = await window.api.wiki.create({
          bookId: bookId(),
          type: c.type as WikiType,
          name: c.name,
          summary: c.summary,
          injection: 'manual'
        })
        if (!res.ok) throw new Error(res.error)
        wikiEntries.value.push(res.data)
        acceptedChapters.add(c.chapterId)
        created++
      }
      await advanceWatermark(acceptedChapters)
      toast.success(
        `已入库 ${created} 个词条（默认仅手动引用）` + (dupSkipped > 0 ? `，跳过 ${dupSkipped} 条重复` : '')
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入库失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  /** IpcResult 收窄小工具（checkDup 的 data 可选） */
  function res_ok<T>(r: { ok: boolean; data?: T }): r is { ok: true; data: T } {
    return r.ok && r.data !== undefined
  }

  async function advanceWatermark(chapterIds: Set<string>): Promise<void> {
    for (const id of chapterIds) {
      const ch = chapters.value.find((c) => c.id === id)
      if (ch) watermark.value = await setWatermarkChapter(WIKI_WATERMARK_KEY, watermark.value, id, ch.wordCount)
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  return {
    extractDialogVisible,
    extractScope,
    extractChapterId,
    unextracted,
    refreshWatermark,
    runProgress,
    isBusy,
    candidateDialogVisible,
    candidateTitle,
    candidateItems,
    candidateDescription,
    openExtractDialog,
    startWikiExtract,
    stopEverything,
    onCandidatesConfirm
  }
}
