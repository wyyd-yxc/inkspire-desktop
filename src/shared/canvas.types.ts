/**
 * 场景规划共享类型：场景节点（架构文档第 3 节 scenes 表）。
 * 场景是单章内部的叙事单元，按 sort_order（≈画布 x 坐标）顺序生成正文。
 */

/** 场景状态：draft 草稿 / main 主线（金）/ side 支线（紫）/ locked 已锁定（绿，不参与重生成） */
export type SceneStatus = 'draft' | 'main' | 'side' | 'locked'

/** 场景实体（API 返回形态） */
export interface Scene {
  id: string
  chapterId: string
  title: string
  /** 剧情摘要：越具体 AI 生成越准 */
  summary: string
  /** 情节节拍（如「冲突升级」「情感转折」） */
  beat: string
  /** 张力 1-5 */
  tension: number
  /** 标签（如「高潮」「伏笔」「打斗」） */
  tags: string[]
  status: SceneStatus
  sortOrder: number
  posX: number
  posY: number
  /** 镶嵌的百科词条 id（生成时 AI 参考） */
  wikiRefs: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateSceneInput {
  chapterId: string
  title?: string
  summary?: string
  beat?: string
  tension?: number
  tags?: string[]
  status?: SceneStatus
  posX?: number
  posY?: number
  wikiRefs?: string[]
  sortOrder?: number
}

export interface UpdateSceneInput {
  title?: string
  summary?: string
  beat?: string
  tension?: number
  tags?: string[]
  status?: SceneStatus
  posX?: number
  posY?: number
  wikiRefs?: string[]
  sortOrder?: number
}

/** 场景连线类型：main 主线顺序 / logic 因果 / relation 关联（多线叙事表达） */
export type SceneEdgeType = 'main' | 'logic' | 'relation'

/** 场景连线实体 */
export interface SceneEdge {
  id: string
  chapterId: string
  sourceId: string
  targetId: string
  type: SceneEdgeType
  label: string
  createdAt: string
}

export interface CreateSceneEdgeInput {
  chapterId: string
  sourceId: string
  targetId: string
  type?: SceneEdgeType
  label?: string
}

export interface UpdateSceneEdgeInput {
  type?: SceneEdgeType
  label?: string
}

/** AI 场景生成模式（v1 五种；平行推演/素材组依赖灵感墙 M11 后续） */
export type SceneGenMode =
  | 'init' // 初始化场景：空画布按章节背景生成初始场景链
  | 'bridge' // 搭桥填缝：在两个场景之间生成过渡场景
  | 'rewrite' // 改写场景：融入设定充实选中场景
  | 'ending' // 收尾场景：为章节生成收束场景
  | 'append' // 末尾续写：在章节末尾续写 N 个场景
