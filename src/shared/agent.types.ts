/**
 * Agent 模型偏好共享类型（M15）：功能槽位绑定 API 档案。
 * 槽位=功能域（8 个），一槽位至多绑定一档案；表内无行=「跟随默认」
 * （渲染层回落 ai.default_profile_id → 第一个档案）。槽位不做温度/参数覆盖（跟档案走）。
 */

/** 功能槽位（8 个功能域，非 Agent 实体） */
export type AgentSlot =
  | 'writing' // 正文写作（续写/整章润色/按场景生成正文）
  | 'selection' // 划词改写（润色/扩写/改写）
  | 'genesis' // 构思台（内核辅助/世界冷启动）
  | 'plot' // 情节大纲 AI
  | 'scene' // 场景规划 AI
  | 'extract' // 提取同步（设定集/叙事档案/剧情提取+词条生成+近似合并）
  | 'assistant' // 助手聊天
  | 'digest' // 拆书

/** 全部槽位常量（DAO 白名单与设置分区渲染共用） */
export const AGENT_SLOTS: readonly AgentSlot[] = [
  'writing',
  'selection',
  'genesis',
  'plot',
  'scene',
  'extract',
  'assistant',
  'digest'
]

/** 槽位中文标签（设置分区展示用） */
export const AGENT_SLOT_LABELS: Record<AgentSlot, string> = {
  writing: '正文写作',
  selection: '划词改写',
  genesis: '构思台',
  plot: '情节大纲 AI',
  scene: '场景规划 AI',
  extract: '提取同步',
  assistant: '助手聊天',
  digest: '拆书'
}

/** 槽位说明（设置分区展示用：该槽覆盖哪些功能） */
export const AGENT_SLOT_HINTS: Record<AgentSlot, string> = {
  writing: 'AI 续写、整章润色、按场景生成正文',
  selection: '划词润色、扩写、改写',
  genesis: '构思台内核辅助、世界构建冷启动',
  plot: '情节画布事件生成（起始/续写/分歧）',
  scene: '场景规划节点生成',
  extract: '设定集/叙事档案/剧情提取、词条生成、近似合并、自动同步',
  assistant: '墨灵助手对话',
  digest: '从参考文本拆解风格包'
}

/** 槽位绑定实体（bindings:list 返回形态；仅含有绑定行的槽位） */
export interface AgentBinding {
  slot: AgentSlot
  /** 绑定的档案 id；删档案经 FK CASCADE 自动清行 */
  profileId: string
}
