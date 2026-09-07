/**
 * 跨模块同步共享类型（M10.5）：候选确认面板条目与抽取中间结构。
 */

/** 候选确认面板条目（SyncCandidateDialog 的 items 契约） */
export interface SyncCandidateItem {
  /** 稳定键（同批内唯一；前缀区分用途，如 `merge:`=近似合并、`rev:`=反向正文修订） */
  key: string
  /** 主文本（词条名/记忆内容/合并结果） */
  title: string
  /** 补充说明（摘要/原条数等） */
  detail?: string
  /** 出处（章节名等） */
  source?: string
  /** 角标文本（如「角色」「剧情」） */
  tag?: string
  tagColor?: string
  checked: boolean
  /** 禁用（不可勾选，如已存在将跳过） */
  disabled?: boolean
  /** 原文对照（M10.7 反向同步：正文修订类候选展示「原文→建议」） */
  oldText?: string
  /** 建议替换文本（与 oldText 成对出现） */
  newText?: string
}
