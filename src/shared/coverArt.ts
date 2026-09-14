/**
 * 书籍封面美术（M17 纸墨 2.0）：题材驱动的墨系封面配置（纯函数，确定性稳定）。
 * 设计规范见 docs/design/visual-2.0.md §5——九题材各有底纹意象与墨系双色底，
 * hash 仅在题材内做微变化（同一本书恒定，不同书同题材有区分度）。
 * 渲染层按返回的配置绘制 SVG（底纹 pattern + 书名排版 + 笺纸角饰）。
 */

/** 九题材（与 shared/book.types.ts BOOK_GENRES 对齐） */
export type CoverGenre =
  | '长篇'
  | '中短篇'
  | '科幻'
  | '历史'
  | '悬疑'
  | '奇幻'
  | '现实主义'
  | '武侠'
  | '其他'

/** 题材视觉配置：墨系双色底 + 点缀色 + 底纹类型 */
export interface CoverPalette {
  /** 渐变起色（深） */
  from: string
  /** 渐变止色（浅） */
  to: string
  /** 书名文字色 */
  text: string
  /** 点缀色（角饰/印点） */
  accent: string
  /** 底纹 id（渲染层 switch 绘制对应 SVG pattern） */
  pattern:
    | 'rule-lines' // 笺纸横纹（长篇）
    | 'grid' // 细网格（中短篇）
    | 'star-arc' // 星轨同心弧（科幻）
    | 'cloud' // 卷云纹（历史）
    | 'rain' // 雨丝斜线（悬疑）
    | 'mountains' // 远山层叠（奇幻）
    | 'plain' // 素面留白（现实主义）
    | 'blade' // 斜锋笔触（武侠）
    | 'dots' // 墨点（其他）
}

/** 九题材配置（低饱和墨系，延续 M10.8 降饱和纪律） */
const PALETTES: Record<CoverGenre, CoverPalette> = {
  长篇: { from: '#4a4038', to: '#6b5f50', text: '#f5f0e4', accent: '#a8443a', pattern: 'rule-lines' },
  中短篇: { from: '#48505c', to: '#66707d', text: '#f2f3f5', accent: '#a8443a', pattern: 'grid' },
  科幻: { from: '#2f3547', to: '#4a5570', text: '#e8ecf4', accent: '#9fb4d8', pattern: 'star-arc' },
  历史: { from: '#54453a', to: '#7a6553', text: '#f6efe2', accent: '#c9a35c', pattern: 'cloud' },
  悬疑: { from: '#37414a', to: '#556370', text: '#eef1f3', accent: '#9fb0bd', pattern: 'rain' },
  奇幻: { from: '#40384a', to: '#5f5470', text: '#f0ecf5', accent: '#b9a6d4', pattern: 'mountains' },
  现实主义: { from: '#57524a', to: '#787064', text: '#f4f1ea', accent: '#a8443a', pattern: 'plain' },
  武侠: { from: '#3a4640', to: '#586b60', text: '#eef2ee', accent: '#a8443a', pattern: 'blade' },
  其他: { from: '#464239', to: '#665f52', text: '#f3efe6', accent: '#a8443a', pattern: 'dots' }
}

const GENRES = Object.keys(PALETTES) as CoverGenre[]

/** 稳定 hash（同 M10.8 取色思路：确定性、分布均匀） */
function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997
  return h
}

/** 题材归一：未知/空题材落到「其他」 */
export function normalizeGenre(genre: string): CoverGenre {
  return (GENRES as string[]).includes(genre) ? (genre as CoverGenre) : '其他'
}

export interface CoverArt {
  palette: CoverPalette
  /** 同题材内的微变化：底色明度偏移（-6 ~ +6）与底纹相位（0-39），保证同题材不同书可区分 */
  shift: number
  phase: number
  /** 书名排版策略 */
  layout: 'vertical' | 'two-line' | 'three-line'
}

/** 按书名长度选择排版：≤4 竖排大字 / 5-9 横排两行 / ≥10 三行缩字 */
export function coverLayout(title: string): CoverArt['layout'] {
  const n = [...title.trim()].length
  if (n <= 4) return 'vertical'
  if (n <= 9) return 'two-line'
  return 'three-line'
}

/** 书籍封面美术配置（纯函数：同输入恒同输出） */
export function coverArtFor(book: { title: string; genre: string }): CoverArt {
  const genre = normalizeGenre(book.genre)
  const h = hashOf(book.title || '无名')
  return {
    palette: PALETTES[genre],
    shift: (h % 13) - 6,
    phase: h % 40,
    layout: coverLayout(book.title || '无名')
  }
}

/** 明度偏移工具：把 hex 颜色整体提亮/压暗 shift 级（每级约 1.6%，±6 级 ≈ ±10%） */
export function shade(hex: string, shift: number): string {
  const h = hex.replace('#', '')
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(parseInt(h.slice(0, 2), 16) + shift * 4)
  const g = clamp(parseInt(h.slice(2, 4), 16) + shift * 4)
  const b = clamp(parseInt(h.slice(4, 6), 16) + shift * 4)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 封面渲染参数（渲染层直接消费：渐变色已应用明度偏移） */
export function coverStyleFor(book: { title: string; genre: string }): {
  from: string
  to: string
  text: string
  accent: string
  pattern: CoverPalette['pattern']
  phase: number
  layout: CoverArt['layout']
} {
  const art = coverArtFor(book)
  return {
    from: shade(art.palette.from, art.shift),
    to: shade(art.palette.to, art.shift),
    text: art.palette.text,
    accent: art.palette.accent,
    pattern: art.palette.pattern,
    phase: art.phase,
    layout: art.layout
  }
}