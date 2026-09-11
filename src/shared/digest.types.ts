/**
 * 拆书（M14）共享类型：参考文本选取结果与 AI 拆解产出。
 * 参考文本仅内存传递（隐私：不落库不持久，弹窗关闭即弃）；
 * 拆解产出经渲染层清洗后走 styles:create（sourceType='digest'）落 M12 的 style_profiles 表。
 */

/** digest:pick-text 返回：参考文本（已截取）与截断信息；用户取消时通道返回 null */
export interface DigestPickResult {
  /** 所选文件名（仅展示用） */
  fileName: string
  /** 参考文本（UTF-8 解码，超长已截取开头 DIGEST_TEXT_LIMIT 字） */
  text: string
  /** 文件总字符数（截取前） */
  totalChars: number
  /** 是否发生了截取 */
  truncated: boolean
}

/** AI 拆解产出（清洗后的规范形态） */
export interface DigestResult {
  /** 风格包名（非空 ≤30 字） */
  name: string
  /** 文笔调性总括（≤100 字，可为空） */
  tone: string
  /** 叙事规则条目（≤20 条，每条 ≤100 字，可为空） */
  rules: string[]
  /** 样例句段（≤200 字，可为空） */
  sample: string
}
