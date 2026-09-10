/**
 * 创作统计共享类型（M13）：按日字数快照与统计查询结果。
 * 快照由主进程在 chapters:update（wordCount 传入时）内嵌记录，渲染层只读。
 * 当日净增 delta = last_total - base_total（可为负=净删，如实呈现）。
 */

/** 字数快照实体（API 返回形态） */
export interface WordSnapshot {
  /** 本地时区日期 YYYY-MM-DD */
  day: string
  /** 当日首次上报的全书总字数（基线） */
  baseTotal: number
  /** 当日末次上报的全书总字数 */
  lastTotal: number
  /** 当日净增 = lastTotal - baseTotal（可负） */
  delta: number
}

/** 里程碑（从快照序列推导，不落库） */
export interface WordMilestone {
  /** 展示名（如「1 万字」） */
  label: string
  /** 目标总字数 */
  target: number
  /** 达成日（首个 lastTotal ≥ target 的快照日）；未达成无此字段 */
  achievedDay?: string
  /** 未达成时距目标的剩余字数 */
  gap?: number
}
