/**
 * 万物百科共享类型：世界观知识库词条（架构文档第 3 节 wiki_entries 表）。
 * 词条让 AI 写作时能查到正确设定，避免长篇写错名字、忘记设定、前后矛盾。
 */

/** 词条类型（对照原站 6 分类） */
export const WIKI_TYPES = [
  'character', // 角色
  'location', // 地点
  'item', // 物品
  'faction', // 势力
  'skill', // 功法
  'lore' // 背景
] as const

export type WikiType = (typeof WIKI_TYPES)[number]

/** 类型中文名（UI 展示用） */
export const WIKI_TYPE_LABELS: Record<WikiType, string> = {
  character: '角色',
  location: '地点',
  item: '物品',
  faction: '势力',
  skill: '功法',
  lore: '背景'
}

/** 系统角色：标注设定重要程度（对照原站 5 档，空串=未标注） */
export const WIKI_SYSTEM_ROLES = [
  'protagonist', // 主角
  'important', // 重要角色
  'villain', // 主要反派
  'rule', // 世界规则
  'foundation' // 世界底层设定
] as const

export type WikiSystemRole = (typeof WIKI_SYSTEM_ROLES)[number] | ''

export const WIKI_SYSTEM_ROLE_LABELS: Record<string, string> = {
  protagonist: '主角',
  important: '重要角色',
  villain: '主要反派',
  rule: '世界规则',
  foundation: '世界底层设定'
}

/** 注入模式：always=全书长期生效（AI 写作自动携带）；manual=仅手动引用（助手 @ 召唤时） */
export type WikiInjection = 'always' | 'manual'

/** 属性键值对 */
export interface WikiAttribute {
  key: string
  value: string
}

/** 词条关系：指向其他词条的连接 */
export interface WikiRelation {
  targetId: string
  label: string // 如「师徒」「敌对」「位于」
}

/** 词条实体（API 返回形态） */
export interface WikiEntry {
  id: string
  bookId: string
  type: WikiType
  name: string
  summary: string
  content: string
  attributes: WikiAttribute[]
  relations: WikiRelation[]
  systemRole: WikiSystemRole
  injection: WikiInjection
  createdAt: string
  updatedAt: string
}

export interface CreateWikiInput {
  bookId: string
  type: WikiType
  name: string
  summary?: string
  content?: string
  attributes?: WikiAttribute[]
  relations?: WikiRelation[]
  systemRole?: WikiSystemRole
  injection?: WikiInjection
}

export interface UpdateWikiInput {
  type?: WikiType
  name?: string
  summary?: string
  content?: string
  attributes?: WikiAttribute[]
  relations?: WikiRelation[]
  systemRole?: WikiSystemRole
  injection?: WikiInjection
}
