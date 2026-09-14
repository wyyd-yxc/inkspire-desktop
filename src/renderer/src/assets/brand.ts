/**
 * 墨笺品牌资产源（M17 定稿：稿 A・朱砂印）。
 * 意象：印章方框（圆角方）+ 墨滴主体 + 右下朱砂印点。
 * 用途：应用图标（全尺寸导出）、启动画面、书房顶栏标识。
 * 颜色：炭墨 #3a352e + 朱砂 #a8443a；深色主题用暖白 #e3dbc9 + 提亮朱砂 #da8577。
 */

/** 图标主体（正方形 96 viewBox），返回内联 SVG 元素串（不含 <svg> 包裹） */
export function logoSvgBody(ink = '#3a352e', seal = '#a8443a'): string {
  return [
    `<rect x="10" y="10" width="76" height="76" rx="18" fill="none" stroke="${ink}" stroke-width="6"/>`,
    `<path d="M48 26 C40 40 34 48 34 57 a14 14 0 0 0 28 0 C62 48 56 40 48 26 Z" fill="${ink}"/>`,
    `<circle cx="70" cy="70" r="9" fill="${seal}"/>`
  ].join('')
}

/** 独立图标 SVG 字符串（应用图标导出/文件用；size 为 px 尺寸） */
export function logoSvg(size = 512, ink = '#3a352e', seal = '#a8443a', bg = ''): string {
  const bgRect = bg
    ? `<rect x="0" y="0" width="96" height="96" fill="${bg}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">${bgRect}${logoSvgBody(ink, seal)}</svg>`
}
