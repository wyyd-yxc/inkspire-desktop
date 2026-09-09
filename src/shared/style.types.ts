/**
 * 作品风格包共享类型（M12）：全局风格包库（style_profiles）。
 * 预设 5 包保持 presetStyles.ts 常量不入库；本表只存用户自建包，
 * source_type 'digest' 为 M14 拆书产出预留。
 */

/** 风格包来源：manual 用户自建 / digest 拆书产出（M14 写入） */
export type StyleSourceType = 'manual' | 'digest'

/** 风格包实体（API 返回形态） */
export interface StyleProfile {
  id: string
  /** 包名（如「冷峻暗调」） */
  name: string
  /** 文笔调性（一句话总约束，注入为「目标文风」行） */
  tone: string
  /** 叙事规则条目（人称/时态/视角等，逐条注入提示词） */
  rules: string[]
  /** 单章字数软目标区间（提示词软约束，不做硬切分）；null=不约束 */
  wordTargetMin: number | null
  wordTargetMax: number | null
  /** 文风样例片段（展示用，不注入） */
  sample: string
  sourceType: StyleSourceType
  createdAt: string
  updatedAt: string
}

export interface CreateStyleProfileInput {
  name: string
  tone?: string
  rules?: string[]
  wordTargetMin?: number | null
  wordTargetMax?: number | null
  sample?: string
}

export interface UpdateStyleProfileInput {
  name?: string
  tone?: string
  rules?: string[]
  wordTargetMin?: number | null
  wordTargetMax?: number | null
  sample?: string
}
