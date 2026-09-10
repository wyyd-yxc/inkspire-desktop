/**
 * 创作统计计算纯函数（M13）：趋势/热力图/里程碑推导。
 * 零副作用，供 StatsView 消费；日期一律本地时区 YYYY-MM-DD（与主进程 localDayString 同口径）。
 */
import type { WordMilestone, WordSnapshot } from '../../../shared/stats.types'

export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 近 n 天日期序列（含今天，升序） */
export function lastNDays(n: number, today = new Date()): string[] {
  const days: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    days.push(localDay(d))
  }
  return days
}

/** 当日净增（无快照=0） */
export function todayDelta(snapshots: WordSnapshot[], today = new Date()): number {
  const key = localDay(today)
  return snapshots.find((s) => s.day === key)?.delta ?? 0
}

/** 近 n 天趋势点（无快照的天 delta=0） */
export function buildTrend(
  snapshots: WordSnapshot[],
  n: number,
  today = new Date()
): Array<{ day: string; delta: number }> {
  const byDay = new Map(snapshots.map((s) => [s.day, s]))
  return lastNDays(n, today).map((day) => ({ day, delta: byDay.get(day)?.delta ?? 0 }))
}

export interface HeatCell {
  day: string
  delta: number
  /** 0 空白/无变化 · 1 ≤99 · 2 100-499 · 3 500-999 · 4 ≥1000 */
  level: 0 | 1 | 2 | 3 | 4
}

export function heatLevel(delta: number): 0 | 1 | 2 | 3 | 4 {
  if (delta <= 0) return 0
  if (delta < 100) return 1
  if (delta < 500) return 2
  if (delta < 1000) return 3
  return 4
}

/** 热力格子：近 months 个月，按周列对齐（首列对齐周一，末格=今天），行=周一..周日 */
export function buildHeatCells(
  snapshots: WordSnapshot[],
  months = 12,
  today = new Date()
): HeatCell[] {
  const byDay = new Map(snapshots.map((s) => [s.day, s]))
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1)
  // 起点回退到所在周的周一
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const cells: HeatCell[] = []
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = localDay(d)
    const snap = byDay.get(day)
    const delta = snap ? snap.delta : 0
    cells.push({ day, delta, level: heatLevel(delta) })
  }
  return cells
}

/** 热力图月标签：每月首个格子在其列顶显示月份（返回 列号→标签） */
export function heatMonthLabels(
  cells: HeatCell[]
): Array<{ col: number; label: string }> {
  const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const labels: Array<{ col: number; label: string }> = []
  let lastMonth = -1
  cells.forEach((cell, i) => {
    const month = Number(cell.day.slice(5, 7))
    if (month !== lastMonth) {
      lastMonth = month
      if (i === 0 || cell.day.slice(8) <= '07') {
        // 列首或月初（避免右缘溢出：当月剩余不足一周的标签省略）
        labels.push({ col: Math.floor(i / 7), label: MONTHS[month - 1] })
      }
    }
  })
  return labels
}

/** 里程碑阶梯（字数） */
export const MILESTONE_STEPS: Array<{ label: string; target: number }> = [
  { label: '1 万字', target: 10_000 },
  { label: '5 万字', target: 50_000 },
  { label: '10 万字', target: 100_000 },
  { label: '20 万字', target: 200_000 },
  { label: '50 万字', target: 500_000 },
  { label: '100 万字', target: 1_000_000 }
]

/**
 * 里程碑推导：字数阶梯取「首个 lastTotal ≥ 阈值」的快照日；
 * 快照未覆盖但当前总量已达标（防御）时用最近快照日或今天。
 * 首次创作 = 首个 delta>0 的快照日；首章完稿由调用方传达成日（取章节 updatedAt 近似）。
 */
export function computeMilestones(
  snapshots: WordSnapshot[],
  opts: { totalWords: number; hasChapter: boolean; firstChapterDay?: string }
): WordMilestone[] {
  const milestones: WordMilestone[] = []
  const firstWrite = snapshots.find((s) => s.delta > 0)
  if (firstWrite) milestones.push({ label: '首次创作', target: 0, achievedDay: firstWrite.day })
  if (opts.hasChapter) {
    milestones.push({ label: '首章完稿', target: 0, achievedDay: opts.firstChapterDay })
  }
  for (const step of MILESTONE_STEPS) {
    const hit = snapshots.find((s) => s.lastTotal >= step.target)
    if (hit) {
      milestones.push({ label: step.label, target: step.target, achievedDay: hit.day })
    } else {
      const lastTotal = snapshots.length ? snapshots[snapshots.length - 1].lastTotal : opts.totalWords
      milestones.push({
        label: step.label,
        target: step.target,
        gap: Math.max(0, step.target - Math.max(lastTotal, opts.totalWords))
      })
    }
  }
  return milestones
}
