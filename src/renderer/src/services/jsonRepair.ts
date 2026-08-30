/**
 * 宽容 JSON 修复器：LLM 输出的 JSON 常在字符串值内含未转义的英文双引号
 * （如 "content":"剑名"寂鸣"…"），严格 parse 必败。
 * 状态机遍历：在字符串内遇到 `"` 时，看其后第一个非空白字符——
 * 是 `,` `}` `]` `:` 视为真实终结符，否则视为值内引号并转义。
 */
export function lenientJsonRepair(s: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (!inStr) {
      if (ch === '"') inStr = true
      out += ch
      continue
    }
    if (ch === '\\') {
      out += ch + (s[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '"') {
      let j = i + 1
      while (j < s.length && /\s/.test(s[j])) j++
      const next = s[j]
      if (next === ',' || next === '}' || next === ']' || next === ':') {
        inStr = false
        out += ch
      } else {
        out += '\\"'
      }
      continue
    }
    out += ch
  }
  return out
}

/** 宽容解析：先严格 parse，失败后走修复器重试 */
export function lenientParse<T>(jsonStr: string): T | null {
  try {
    return JSON.parse(jsonStr) as T
  } catch {}
  try {
    return JSON.parse(lenientJsonRepair(jsonStr)) as T
  } catch {
    return null
  }
}
