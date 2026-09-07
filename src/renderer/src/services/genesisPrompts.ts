/**
 * 构思台提示词构造：内核 AI 辅助 + 世界构建起草。
 * 复用 services/ai.ts 的 chatStream 管线。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import type { Step2Soul } from '../../../shared/genesis.types'
import { getPresetStyle } from '../../../shared/presetStyles'
import { lenientParse } from './jsonRepair'

/** 组装构思台的 system 提示：长篇策划专家角色 + 书籍元信息 + 已绑定的文风 */
function genesisSystemPrompt(book: Pick<Book, 'title' | 'genre' | 'description'>, styleId?: string): string {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  if (book.description) meta.push(`简介：${book.description.slice(0, 200)}`)
  const style = styleId ? getPresetStyle(styleId) : undefined
  return [
    '你是一位资深长篇小说策划与世界观架构师，擅长帮作者把模糊灵感打磨成可执行的长篇设定。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    style ? `目标文风：${style.name}。${style.promptHint}` : '',
    '输出要求：内容具体可落地、避免空话套话；中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/** 内核 AI 辅助：根据书名/分类/简介起草 logline + 三大支柱，输出严格 JSON 便于解析 */
export function buildSoulAssistMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  styleId?: string
): ChatMessage[] {
  return [
    { role: 'system', content: genesisSystemPrompt(book, styleId) },
    {
      role: 'user',
      content: `请为这本书起草故事核心设定，包含核心一句话与三大支柱。严格输出如下 JSON（不要任何额外文字、不要 markdown 代码块）：
{
  "logline": "一句话：主角是谁、想做什么、面对什么阻碍",
  "genre": { "mainType": "", "subType": "", "targetReader": "", "mood": "" },
  "cheat": { "coreAbility": "", "powerSystem": "", "limitation": "" },
  "conflict": { "opening": "开局矛盾", "mainline": "主线冲突", "ultimate": "终极阻碍", "villain": "反派层级" }
}
各字段填具体内容（非字段名说明），中文。`
    }
  ]
}

/** 世界构建起草：基于内核内容生成全套初始设定，分段输出 */
export function buildWorldColdStartMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  soul: Step2Soul,
  styleId?: string
): ChatMessage[] {
  const soulText = [
    `核心一句话：${soul.logline}`,
    `题材定位：主类型${soul.genre.mainType} / 副类型${soul.genre.subType} / 目标读者${soul.genre.targetReader} / 情绪基调${soul.genre.mood}`,
    `核心能力：核心能力${soul.cheat.coreAbility} / 力量体系${soul.cheat.powerSystem} / 限制代价${soul.cheat.limitation}`,
    `冲突梯队：开局${soul.conflict.opening} / 主线${soul.conflict.mainline} / 终极${soul.conflict.ultimate} / 反派${soul.conflict.villain}`
  ].join('\n')
  return [
    { role: 'system', content: genesisSystemPrompt(book, styleId) },
    {
      role: 'user',
      content: `基于以下故事核心设定，为这部长篇小说生成一套完整初始设定。严格按以下四段输出，每段以「【段名】」开头，段内可自由分段：

【全书大纲】
（卷级结构、字数分配、节奏规划、伏笔布局，200-400 字）

【第一卷大纲】
（情绪弧线、章节分段建议、情绪高点节奏，200-400 字）

【世界法则】
（世界规则、力量体系、核心设定，200-400 字）

【主角设定】
（人设骨架、目标冲突、可写细节，200-400 字）

故事核心设定：
${soulText}`
    }
  ]
}

/** 解析起草输出：按【段名】分割为四块 */
export function parseWorldColdStart(text: string): {
  bookOutline: string
  volumeOutline: string
  worldRules: string
  protagonist: string
} {
  const pick = (name: string): string => {
    const re = new RegExp(`【${name}】([\\s\\S]*?)(?=【|$)`)
    const m = text.match(re)
    return m ? m[1].trim() : ''
  }
  return {
    bookOutline: pick('全书大纲'),
    volumeOutline: pick('第一卷大纲'),
    worldRules: pick('世界法则'),
    protagonist: pick('主角设定')
  }
}

/** 解析故事核心 AI 辅助的 JSON 输出（容错：提取首个 { 到末个 } 子串，兼容散文包裹/围栏/前后说明） */
export function parseSoulAssist(text: string): Step2Soul | null {
  // 提取第一个 { 到最后一个 } 之间的子串，兼容 AI 在 JSON 前后加散文说明的情况
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) return null
  const jsonStr = text.slice(firstBrace, lastBrace + 1)
  // 宽容解析：字段值内未转义的英文双引号由修复器转义后重试（与 parseWikiGenerate 同类风险）
  const obj = lenientParse<{
    logline?: string
    genre?: { mainType?: string; subType?: string; targetReader?: string; mood?: string }
    cheat?: { coreAbility?: string; powerSystem?: string; limitation?: string }
    conflict?: { opening?: string; mainline?: string; ultimate?: string; villain?: string }
  }>(jsonStr)
  if (!obj) return null
  const result: Step2Soul = {
    logline: String(obj.logline ?? ''),
    genre: {
      mainType: String(obj.genre?.mainType ?? ''),
      subType: String(obj.genre?.subType ?? ''),
      targetReader: String(obj.genre?.targetReader ?? ''),
      mood: String(obj.genre?.mood ?? '')
    },
    cheat: {
      coreAbility: String(obj.cheat?.coreAbility ?? ''),
      powerSystem: String(obj.cheat?.powerSystem ?? ''),
      limitation: String(obj.cheat?.limitation ?? '')
    },
    conflict: {
      opening: String(obj.conflict?.opening ?? ''),
      mainline: String(obj.conflict?.mainline ?? ''),
      ultimate: String(obj.conflict?.ultimate ?? ''),
      villain: String(obj.conflict?.villain ?? '')
    }
  }
  // 逐字段降级：有任意一个非空字段即返回（不再因 logline 空就整表作废）
  const hasAny = result.logline ||
    Object.values(result.genre).some(Boolean) ||
    Object.values(result.cheat).some(Boolean) ||
    Object.values(result.conflict).some(Boolean)
  return hasAny ? result : null
}
