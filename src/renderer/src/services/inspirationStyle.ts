/**
 * 灵感墙类别色卡：与记忆/剧情同族的低饱和纸墨色板（M10.8 严肃化口径，去高彩）。
 */
import type { InspirationKind } from '../../../shared/inspiration.types'

export const INSPIRATION_KIND_COLORS: Record<InspirationKind, string> = {
  idea: '#6b5f4a', // 褐墨
  foreshadow: '#8a4a5f', // 暗朱
  fragment: '#3f6a8a', // 黛蓝
  memo: '#5f5a8a', // 紫灰
  todo: '#4a7d5b' // 墨绿
}
