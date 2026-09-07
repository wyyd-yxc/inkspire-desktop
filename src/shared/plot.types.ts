/**
 * 情节大纲共享类型：跨章节剧情事件节点（plot_events）与连线（plot_edges）。
 * 事件是全书维度的剧情点（区别于单章内部的场景），parent_id 为子画布预留字段（M10 不使用）。
 */

/** 剧情事件实体（API 返回形态） */
export interface PlotEvent {
  id: string
  bookId: string
  /** 事件标题（如「主角下山」「宗门大比」） */
  title: string
  /** 事件描述：起因/经过/结果要点 */
  description: string
  /** 标签（如「高潮」「转折」「伏笔」），首个标签决定节点色条颜色 */
  tags: string[]
  posX: number
  posY: number
  /** 子画布父事件 id（预留，M10 恒为 null） */
  parentId: string | null
  /** 镶嵌的设定集词条 id（详情面板挂接，AI 生成时参考） */
  wikiRefs: string[]
  createdAt: string
  updatedAt: string
}

export interface CreatePlotEventInput {
  bookId: string
  title?: string
  description?: string
  tags?: string[]
  posX?: number
  posY?: number
  wikiRefs?: string[]
}

export interface UpdatePlotEventInput {
  title?: string
  description?: string
  tags?: string[]
  posX?: number
  posY?: number
  wikiRefs?: string[]
}

/** 剧情连线类型：main 主线顺序 / logic 因果 / relation 关联 / reference 引用 */
export type PlotEdgeType = 'main' | 'logic' | 'relation' | 'reference'

/** 剧情连线实体 */
export interface PlotEdge {
  id: string
  bookId: string
  sourceId: string
  targetId: string
  type: PlotEdgeType
  label: string
  createdAt: string
}

export interface CreatePlotEdgeInput {
  bookId: string
  sourceId: string
  targetId: string
  type?: PlotEdgeType
  label?: string
}

export interface UpdatePlotEdgeInput {
  type?: PlotEdgeType
  label?: string
}

/** AI 剧情生成模式（M10 三种；原站另有插入/素材组合，依赖灵感墙 M11 后续再做） */
export type PlotGenMode = 'init' | 'extend' | 'diverge'
