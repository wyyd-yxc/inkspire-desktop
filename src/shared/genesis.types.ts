/**
 * 创世台共享类型：五步设定数据结构。
 * 每步 data 为 JSON，结构因步而异（见各接口定义）。
 */

/** 创世台五步序号 */
export type GenesisStep = 1 | 2 | 3 | 4 | 5

/** 第 1 步·定风：绑定的风格包 */
export interface Step1Style {
  /** 预设风格包 id（内置常量）；空串表示未绑定 */
  styleId: string
  /** 风格名（冗余存储，换风格包版本时仍可见） */
  styleName: string
}

/** 第 2 步·定魂：一句话 + 三大支柱 */
export interface Step2Soul {
  /** 核心一句话：主角是谁、想做什么、面对什么阻碍 */
  logline: string
  /** 题材定位 */
  genre: {
    mainType: string
    subType: string
    targetReader: string
    mood: string
  }
  /** 金手指设定 */
  cheat: {
    coreAbility: string
    powerSystem: string
    limitation: string
  }
  /** 冲突梯队 */
  conflict: {
    opening: string
    mainline: string
    ultimate: string
    villain: string
  }
}

/** 第 3 步·造世：冷启动生成的设定（M6 迁移至百科前的暂存） */
export interface Step3World {
  /** 全书大纲 */
  bookOutline: string
  /** 第一卷大纲 */
  volumeOutline: string
  /** 世界底层法则 */
  worldRules: string
  /** 主角设定 */
  protagonist: string
  /** 冷启动时间戳 */
  generatedAt: string
}

/** 第 4 步·布局：分卷章节结构 + 写作规则 */
export interface ChapterPlanItem {
  title: string
  outline: string
}
export interface VolumePlan {
  name: string
  chapters: ChapterPlanItem[]
}
export interface Step4Layout {
  volumes: VolumePlan[]
  /** 写作规则（全局约束 AI 生成） */
  rules: {
    targetWords: string
    forbidden: string
    styleNotes: string
  }
}

/** 第 5 步·执笔：仅标记是否已开始 */
export interface Step5Write {
  started: boolean
}

/** 各步 data 的联合类型 */
export type GenesisStepData = Step1Style | Step2Soul | Step3World | Step4Layout | Step5Write

/** 单步记录（API 返回形态） */
export interface GenesisStepRecord {
  bookId: string
  step: GenesisStep
  data: GenesisStepData | null
  isDone: boolean
  updatedAt: string
}

/** 保存某步的输入 */
export interface SaveGenesisInput {
  step: GenesisStep
  data: GenesisStepData
  isDone?: boolean
}
