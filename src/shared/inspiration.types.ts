/**
 * 灵感墙共享类型：五类便签（inspirations）。
 * 灵感墙是作者主动记录的素材暂存区（零 AI）；ref_type/ref_id 记录「入画布」回链
 * （便签创建情节大纲事件/场景规划场景后指向该节点），wiki_refs 为关联的设定集词条。
 */

/** 便签类别：idea 灵感 / foreshadow 伏笔 / fragment 片段 / memo 备忘 / todo 待办 */
export type InspirationKind = 'idea' | 'foreshadow' | 'fragment' | 'memo' | 'todo'

/** 类别中文标签（用户可见，勿改） */
export const INSPIRATION_KIND_LABELS: Record<InspirationKind, string> = {
  idea: '灵感',
  foreshadow: '伏笔',
  fragment: '片段',
  memo: '备忘',
  todo: '待办'
}

/** 便签「入画布」回链目标类型：空串=未入画布 */
export type InspirationRefType = '' | 'plot' | 'scene'

/** 便签实体（API 返回形态） */
export interface Inspiration {
  id: string
  bookId: string
  kind: InspirationKind
  title: string
  content: string
  /** 出处说明（如「划自·第三章」），手动创建为空 */
  source: string
  refType: InspirationRefType
  /** 回链目标 id（refType 为空时恒为空串） */
  refId: string
  /** 关联的设定集词条 id */
  wikiRefs: string[]
  /** 回收站状态：1=已软删 */
  isRecycled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateInspirationInput {
  bookId: string
  kind?: InspirationKind
  title?: string
  content?: string
  source?: string
  wikiRefs?: string[]
}

export interface UpdateInspirationInput {
  kind?: InspirationKind
  title?: string
  content?: string
  wikiRefs?: string[]
  /** 回收站切换（软删/恢复） */
  isRecycled?: boolean
  /** 入画布回链写入与解绑（传 '' 清空 refType/refId） */
  refType?: InspirationRefType
  refId?: string
}
