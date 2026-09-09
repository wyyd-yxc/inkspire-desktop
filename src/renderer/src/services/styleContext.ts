/**
 * 风格注入解析（M12）：书绑定风格包 > 构思台基调步预设 > 无。
 * 纯函数（无副作用），供写作管线（ChapterEditor）与场景正文（CanvasView）共用，
 * 保证两处注入的优先级与格式一致。
 */
import type { StyleProfile } from '../../../shared/style.types'

/** 书绑定包 → 风格块内容（不含「目标文风：」前缀，由调用方统一拼接；调性+规则逐条+单章字数软目标） */
export function buildStyleProfileHint(p: StyleProfile): string {
  const lines: string[] = []
  if (p.tone) lines.push(p.tone)
  if (p.rules.length) lines.push(p.rules.map((r) => `- ${r}`).join('\n'))
  if (p.wordTargetMin && p.wordTargetMax) {
    lines.push(`单章篇幅约 ${p.wordTargetMin}-${p.wordTargetMax} 字（软目标，内容完整优先）`)
  } else if (p.wordTargetMin) {
    lines.push(`单章篇幅不少于 ${p.wordTargetMin} 字（软目标）`)
  } else if (p.wordTargetMax) {
    lines.push(`单章篇幅不超过 ${p.wordTargetMax} 字（软目标）`)
  }
  return lines.join('\n')
}

/**
 * 解析生效风格块：书绑定包优先；否则回落预设 promptHint（已解析字符串）；皆无返回 undefined。
 */
export function resolveEffectiveStyle(
  bound: StyleProfile | null | undefined,
  presetHint: string | undefined
): string | undefined {
  if (bound) return buildStyleProfileHint(bound)
  return presetHint || undefined
}
