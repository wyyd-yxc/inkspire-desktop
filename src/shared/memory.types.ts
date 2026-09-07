/**
 * 叙事档案共享类型：长篇创作的「事实层」（架构文档第 3 节 memories 表）。
 * 与设定集分工：百科存静态设定（角色是谁），记忆存动态事实（发生了什么、谁伤了、伏笔在哪）。
 */

/** 记忆类型（对照原站 5 类） */
export const MEMORY_KINDS = [
  'plot', // 剧情状态：故事进展阶段
  'stage', // 场景时空：当前场景时间地点
  'character', // 角色状态：受伤/失力/身处敌营
  'relationship', // 关系状态：两人关系变化
  'clue' // 开放线索：已埋未回收的伏笔
] as const

export type MemoryKind = (typeof MEMORY_KINDS)[number]

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  plot: '剧情状态',
  stage: '场景时空',
  character: '角色状态',
  relationship: '关系状态',
  clue: '开放线索'
}

/** 记录来源：manual 手动 / ai 抽取 */
export type MemorySource = 'manual' | 'ai'

/** 记忆实体（API 返回形态） */
export interface Memory {
  id: string
  bookId: string
  kind: MemoryKind
  content: string
  /** 事实自该章序号起成立；AI 生成第 N 章时只注入 chapterNo < N 的记忆（单向可见防剧透） */
  chapterNo: number
  source: MemorySource
  /** 仅 clue 使用：伏笔是否已回收 */
  isResolved: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateMemoryInput {
  bookId: string
  kind: MemoryKind
  content: string
  chapterNo: number
  source?: MemorySource
  isResolved?: boolean
}

export interface UpdateMemoryInput {
  kind?: MemoryKind
  content?: string
  chapterNo?: number
  isResolved?: boolean
}
