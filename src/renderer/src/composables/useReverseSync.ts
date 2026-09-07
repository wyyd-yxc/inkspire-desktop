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
