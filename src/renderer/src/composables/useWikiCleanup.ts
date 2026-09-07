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
  return e.name.length > 20 && e.summary.includes('导入自构思台')
}

/** 实质摘要（排除导入标记占位） */
function realSummary(e: WikiEntry): string {
  const s = e.summary.trim()
  if (!s || s.includes('导入自构思台')) return ''
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
