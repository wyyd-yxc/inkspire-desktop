/**
 * 作品记忆 AI 抽取与去重编排（M10.5）：单章/未抽取批量抽取 → 候选确认面板勾选采纳 → 入库 + 水位推进。
 * 去重双保险：prompt 注入已有记忆（AI 级防同义）+ 入库前规范化比对（本地级）。
 */
import { computed, ref, type Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type { Memory, MemoryKind } from '../../../shared/memory.types'
import { MEMORY_KIND_LABELS } from '../../../shared/memory.types'
import type { StreamSession } from '../services/ai'
import { generateWriting } from '../services/aiWriting'
import {
  buildMemoryDedupMessages,
  buildMemoryExtractMessages,
  parseMemoryDedup,
  parseMemoryExtract,
  type MemoryCandidate,
  type MemoryMergeSuggestion
} from '../services/memoryPrompts'
import {
  buildExistingMemoryText,
  changedChapters,
  getWatermark,
  MEMORY_WATERMARK_KEY,
  normText,
  setWatermarkChapter,
  type MemCandidateWithSource,
  type SyncWatermark
} from '../services/syncService'

import type { SyncCandidateItem } from '../../../shared/sync.types'
import type { useToast } from './useToast'

/** 记忆类型角标色（与 MemoryView 列表色点一致，单一来源） */
export const MEMORY_KIND_TAG_COLORS: Record<MemoryKind, string> = {
  plot: '#6c5ce7', stage: '#2e7d74', character: '#b06f2a', relationship: '#9d3f63', clue: '#3a6fa8'
}

export function useMemorySync(deps: {
  bookId: string
  book: Ref<Pick<Book, 'title' | 'genre' | 'description'> | null>
  chapters: Ref<Chapter[]>
  memories: Ref<Memory[]>
  toast: ReturnType<typeof useToast>
}) {
  const { bookId, book, chapters, memories, toast } = deps

  // ---- 抽取状态 ----
  const extractDialogVisible = ref(false)
  const extractChapterId = ref('')
  const extractScope = ref<'single' | 'unextracted'>('single')
  const aiPanel = ref<{ append: (t: string) => void; reset: () => void; finish: () => void; fail: () => void } | null>(null)
  const aiPanelVisible = ref(false)
  const isBusy = ref(false)
  let activeSession: StreamSession | null = null
  let lastRun: { scope: 'single' | 'unextracted'; chapterId: string } | null = null

  // ---- 候选确认状态 ----
  const candidateDialogVisible = ref(false)
  const candidateTitle = ref('采纳新记忆候选')
  const candidateDescription = ref('')
  const candidateItems = ref<SyncCandidateItem[]>([])
  /** 候选回查表：key → 待入库数据 */
  let pendingCreates = new Map<string, MemCandidateWithSource>()

  // ---- 水位 ----
  const watermark = ref<SyncWatermark>({})
  async function refreshWatermark(): Promise<void> {
    watermark.value = await getWatermark(MEMORY_WATERMARK_KEY)
  }
  /** 「未抽取/已变更」章节（有内容且水位不符） */
  const unextracted = computed(() => changedChapters(chapters.value, watermark.value))

  async function openExtractDialog(): Promise<void> {
    if (chapters.value.length === 0) {
      toast.error('请先在正文中撰写章节内容')
      return
    }
    await refreshWatermark()
    extractScope.value = 'single'
    extractChapterId.value = chapters.value[chapters.value.length - 1].id
    extractDialogVisible.value = true
  }

  /** 单章流式抽取，返回解析后候选；中止抛错 */
  async function extractOnce(ch: Chapter): Promise<MemoryCandidate[]> {
    const text = ch.content.replace(/<[^>]+>/g, '').trim()
    if (!text) throw new Error(`「${ch.title}」还没有正文`)
    if (!book.value) throw new Error('书籍信息未加载')
    const messages = buildMemoryExtractMessages(
      book.value,
      ch.title,
      ch.sortOrder,
      text,
      buildExistingMemoryText(memories.value)
    )
    let acc = ''
    const promise = new Promise<string>((resolve, reject) => {
      void generateWriting(messages, {
        onChunk: (t) => {
          acc += t
          aiPanel.value?.append(t)
        },
        onDone: () => resolve(acc),
        onError: (m) => reject(new Error(m))
      }).then(({ session }) => {
        activeSession = session
      })
    })
    return parseMemoryExtract(await promise)
  }

  /** 开始抽取（单章流式；批量静默收集，面板仅显示进度行） */
  async function startExtract(): Promise<void> {
    if (isBusy.value) return
    const scope = extractScope.value
    lastRun = { scope, chapterId: extractChapterId.value }
    extractDialogVisible.value = false
    isBusy.value = true
    aiPanelVisible.value = true
    aiPanel.value?.reset()
    try {
      if (scope === 'single') {
        const ch = chapters.value.find((c) => c.id === extractChapterId.value)
        if (!ch) return
        const parsed = await extractOnce(ch)
        aiPanel.value?.finish()
        handleParsed(
          parsed.map((c) => ({ ...c, chapterId: ch.id, chapterNo: ch.sortOrder })),
          [ch.id]
        )
      } else {
        const targets = unextracted.value
        if (targets.length === 0) {
          toast.info('没有待抽取的章节（全部章节都已抽取且未改动）')
          aiPanelVisible.value = false
          return
        }
        const collected: MemCandidateWithSource[] = []
        const involved: string[] = []
        for (const ch of targets) {
          aiPanel.value?.append(`\n【第${ch.sortOrder}章 ${ch.title}】抽取中…\n`)
          try {
            const parsed = await extractOnce(ch)
            aiPanel.value?.append(`得到 ${parsed.length} 条候选\n`)
            for (const c of parsed) {
              collected.push({ ...c, chapterId: ch.id, chapterNo: ch.sortOrder })
            }
            involved.push(ch.id)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('已中止')) {
              aiPanel.value?.append('\n（已中止）')
              break
            }
            aiPanel.value?.append(`失败：${msg}\n`)
          }
        }
        aiPanelVisible.value = false
        handleParsed(collected, involved)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '抽取失败'
      if (msg.includes('已中止')) aiPanelVisible.value = false
      else toast.error(msg)
    } finally {
      isBusy.value = false
    }
  }

  /** 候选去重（本地规范化，AI 级之外的第二道保险）→ 打开确认面板 */
  function handleParsed(
    list: MemCandidateWithSource[],
    chapterIds: string[]
  ): void {
    const existingNorm = new Set(memories.value.map((m) => normText(m.content)))
    const batchSeen = new Set<string>()
    let dupCount = 0
    const unique: MemCandidateWithSource[] = []
    for (const c of list) {
      const n = normText(c.content)
      if (!n || existingNorm.has(n) || batchSeen.has(n)) {
        dupCount++
        continue
      }
      batchSeen.add(n)
      unique.push(c)
    }
    if (unique.length === 0) {
      toast.info(`AI 未提取到新事实（${dupCount} 条与已有记忆重复，已自动跳过）`)
      aiPanelVisible.value = false
      if (chapterIds.length > 0) void advanceWatermark(new Set(chapterIds))
      return
    }
    candidateTitle.value = '采纳新记忆候选'
    pendingCreates = new Map(
      unique.map((c, i) => [`${c.chapterNo}:${i}`, c] as const)
    )
    candidateItems.value = unique.map((c, i) => ({
      key: `${c.chapterNo}:${i}`,
      title: c.content,
      source: `第${c.chapterNo}章 ${chapters.value.find((x) => x.id === c.chapterId)?.title ?? ''}`,
      tag: MEMORY_KIND_LABELS[c.kind as MemoryKind] ?? c.kind,
      tagColor: MEMORY_KIND_TAG_COLORS[c.kind as MemoryKind],
      checked: true
    }))
    candidateDescription.value =
      `共 ${unique.length} 条新候选${dupCount > 0 ? `，已自动跳过 ${dupCount} 条重复候选` : ''}；取消勾选的章节不推进「已抽取」水位。`
    candidateDialogVisible.value = true
  }

  /** 确认面板采纳：逐条入库；仅采纳了候选的章节推进水位 */
  async function confirmCandidates(checked: SyncCandidateItem[]): Promise<void> {
    let created = 0
    const acceptedChapters = new Set<string>()
    try {
      for (const item of checked) {
        const c = pendingCreates.get(item.key)
        if (!c) continue
        const res = await window.api.memories.create({
          bookId,
          kind: c.kind as MemoryKind,
          content: c.content,
          chapterNo: c.chapterNo,
          source: 'ai'
        })
        if (!res.ok) throw new Error(res.error)
        memories.value.push(res.data)
        acceptedChapters.add(c.chapterId)
        created++
      }
      await advanceWatermark(acceptedChapters)
      toast.success(`已入库 ${created} 条记忆`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '入库失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  async function advanceWatermark(chapterIds: Set<string>): Promise<void> {
    for (const id of chapterIds) {
      const ch = chapters.value.find((c) => c.id === id)
      if (ch) watermark.value = await setWatermarkChapter(MEMORY_WATERMARK_KEY, watermark.value, id, ch.wordCount)
    }
  }

  function stopEverything(): void {
    activeSession?.abort()
  }

  function retryLast(): void {
    if (!lastRun || isBusy.value) return
    extractScope.value = lastRun.scope
    extractChapterId.value = lastRun.chapterId
    void startExtract()
  }

  // ---- 存量清理重复 ----
  const dedupRunning = ref(false)
  async function runCleanup(): Promise<void> {
    if (dedupRunning.value || memories.value.length < 2) {
      if (memories.value.length < 2) toast.info('记忆不足 2 条，无需清理')
      return
    }
    dedupRunning.value = true
    try {
      // 第一步：本地精确去重（免费，直接删，保留每组最早一条）
      const groups = new Map<string, Memory[]>()
      for (const m of memories.value) {
        const key = `${m.kind}:${normText(m.content)}`
        const arr = groups.get(key) ?? []
        arr.push(m)
        groups.set(key, arr)
      }
      const exactDupIds: string[] = []
      for (const arr of groups.values()) {
        if (arr.length < 2) continue
        const sorted = [...arr].sort((a, b) => a.chapterNo - b.chapterNo || a.createdAt.localeCompare(b.createdAt))
        for (const dup of sorted.slice(1)) exactDupIds.push(dup.id)
      }
      if (exactDupIds.length > 0) {
        for (const id of exactDupIds) {
          const res = await window.api.memories.remove(id)
          if (!res.ok) throw new Error(res.error)
        }
        memories.value = memories.value.filter((m) => !exactDupIds.includes(m.id))
        toast.success(`已清理 ${exactDupIds.length} 条完全重复的记忆`)
      }
      // 第二步：AI 近似合并（有足够条目才跑）
      if (memories.value.length >= 4) {
        const validIds = new Set(memories.value.map((m) => m.id))
        const messages = buildMemoryDedupMessages(
          memories.value.map((m) => ({ id: m.id, kind: m.kind, chapterNo: m.chapterNo, content: m.content }))
        )
        let acc = ''
        await new Promise<string>((resolve, reject) => {
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
        const suggestions = parseMemoryDedup(acc, validIds)
        if (suggestions.length === 0) {
          if (exactDupIds.length === 0) toast.info('没有发现重复的记忆')
          return
        }
        openMergeDialog(suggestions)
      } else if (exactDupIds.length === 0) {
        toast.info('没有发现重复的记忆')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '清理失败'
      if (!msg.includes('已中止')) toast.error(msg)
    } finally {
      dedupRunning.value = false
    }
  }

  let pendingMerges: MemoryMergeSuggestion[] = []
  function openMergeDialog(suggestions: MemoryMergeSuggestion[]): void {
    pendingMerges = suggestions
    candidateTitle.value = '合并近似重复记忆'
    candidateItems.value = suggestions.map((s, i) => ({
      key: `merge:${i}`,
      title: s.content,
      detail: `合并 ${s.sourceIds.length} 条近似记忆`,
      source: `第${s.chapterNo}章起`,
      tag: MEMORY_KIND_LABELS[s.kind],
      tagColor: MEMORY_KIND_TAG_COLORS[s.kind],
      checked: true
    }))
    candidateDescription.value = `AI 发现 ${suggestions.length} 组近似重复记忆，勾选采纳合并（删原条、入合并条）；取消勾选的组保持原样。`
    candidateDialogVisible.value = true
  }

  /** 合并建议采纳：删原条 + 入合并条 */
  async function confirmMerges(checked: SyncCandidateItem[]): Promise<void> {
    let merged = 0
    try {
      for (const item of checked) {
        const s = pendingMerges[Number(item.key.split(':')[1])]
        if (!s) continue
        const createRes = await window.api.memories.create({
          bookId,
          kind: s.kind,
          content: s.content,
          chapterNo: s.chapterNo,
          source: 'ai'
        })
        if (!createRes.ok) throw new Error(createRes.error)
        for (const id of s.sourceIds) {
          const res = await window.api.memories.remove(id)
          if (!res.ok) throw new Error(res.error)
        }
        memories.value = memories.value.filter((m) => !s.sourceIds.includes(m.id))
        memories.value.push(createRes.data)
        merged++
      }
      toast.success(`已合并 ${merged} 组近似重复记忆`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '合并失败')
    } finally {
      candidateDialogVisible.value = false
    }
  }

  /** 候选面板确认分流：key 前缀区分「新候选入库」与「近似合并」 */
  function onCandidatesConfirm(items: SyncCandidateItem[]): void {
    if (items.length === 0) return
    if (items[0].key.startsWith('merge:')) void confirmMerges(items)
    else void confirmCandidates(items)
  }

  return {
    extractDialogVisible,
    extractChapterId,
    extractScope,
    unextracted,
    aiPanel,
    aiPanelVisible,
    isBusy,
    dedupRunning,
    candidateDialogVisible,
    candidateTitle,
    candidateItems,
    candidateDescription,
    openExtractDialog,
    startExtract,
    retryLast,
    stopEverything,
    runCleanup,
    onCandidatesConfirm
  }
}
