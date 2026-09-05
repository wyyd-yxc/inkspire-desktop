/**
 * AI 写作服务：续写/润色/扩写/改写/整章润色的提示词构造与调用封装。
 * 复用 services/ai.ts 的流式管线与「默认档案」机制；提示词面向网文写作，
 * 输出约定为纯正文（不带解释、不带引号包裹）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import type { Step2Soul, Step4Layout } from '../../../shared/genesis.types'
import { chatStream, type StreamHandlers, type StreamSession } from './ai'
import { isElectron } from './books'

/** 供提示词使用的上下文（由编辑器层从当前状态提取） */
export interface WritingContext {
  book: Pick<Book, 'title' | 'genre' | 'description'> | null
  chapterTitle: string
  /** 前文尾部纯文本（调用方负责截断） */
  contextTail: string
  /** 创世台设定（定魂+布局写作规则+文风），注入 AI 提示词；无则 undefined */
  genesis?: {
    styleHint?: string
    soul?: Step2Soul
    rules?: Step4Layout['rules']
  }
  /** 百科词条（injection=always 的设定，M6）：拼接好的注入文本 */
  wiki?: {
    entries: string
  }
  /** 作品记忆（当前章之前的事实，M8）：防穿帮注入文本 */
  memory?: {
    facts: string
  }
}

/** 前文注入上限（字符）：过长会挤占生成预算且多数模型难以利用 */
const CONTEXT_TAIL_LIMIT = 3000

/** system 提示：网文写作助手角色与输出纪律；注入创世台设定（文风/定魂/写作规则） */
function systemPrompt(ctx: WritingContext): string {
  const meta: string[] = []
  if (ctx.book?.title) meta.push(`书名《${ctx.book.title}》`)
  if (ctx.book?.genre) meta.push(`题材：${ctx.book.genre}`)
  if (ctx.book?.description) meta.push(`简介：${ctx.book.description.slice(0, 200)}`)
  const parts: string[] = [
    '你是一位资深网文写作助手，正在为一部长篇小说执笔。',
    meta.length ? `作品信息——${meta.join('；')}。` : ''
  ]
  // 创世台设定注入（定魂是最高指令，文风约束调性，写作规则全局约束）
  if (ctx.genesis?.styleHint) parts.push(`目标文风：${ctx.genesis.styleHint}`)
  if (ctx.genesis?.soul) {
    const s = ctx.genesis.soul
    if (s.logline) parts.push(`故事核心（最高指令）：${s.logline}`)
    const pillars: string[] = []
    const cheatAbility = s.cheat?.coreAbility
    const cheatSystem = s.cheat?.powerSystem
    if (cheatAbility || cheatSystem)
      pillars.push(`金手指：${[cheatAbility, cheatSystem].filter(Boolean).join(' / ')}`)
    if (s.conflict?.mainline) pillars.push(`主线冲突：${s.conflict.mainline}`)
    if (pillars.length) parts.push(pillars.join('；'))
  }
  if (ctx.genesis?.rules) {
    const r = ctx.genesis.rules
    const rules: string[] = []
    if (r.targetWords) rules.push(`目标字数${r.targetWords}`)
    if (r.forbidden) rules.push(`禁止：${r.forbidden}`)
    if (r.styleNotes) rules.push(`写法要求：${r.styleNotes}`)
    if (rules.length) parts.push(`写作规则——${rules.join('；')}。`)
  }
  // 百科词条注入（M6）：injection=always 的设定，AI 必须遵守不得写错
  if (ctx.wiki?.entries) {
    parts.push(`本书设定（必须严格遵守，不得写错名称与属性）：\n${ctx.wiki.entries}`)
  }
  // 作品记忆注入（M8）：当前章之前的事实（单向可见防剧透），AI 不得违背
  if (ctx.memory?.facts) {
    parts.push(`当前故事状态（此前章节已确立的事实，必须遵守不得矛盾）：\n${ctx.memory.facts}`)
  }
  parts.push('要求：直接输出小说正文本身；不要任何解释、前言、标题、编号或引号包裹；保持与前文一致的文风、人称与时态；中文书写，段落自然分段。')
  return parts.filter(Boolean).join('')
}

function trimTail(tail: string): string {
  return tail.length > CONTEXT_TAIL_LIMIT ? '…' + tail.slice(-CONTEXT_TAIL_LIMIT) : tail
}

/** 续写提示词：从前文末尾自然向后写 */
export function buildContinueMessages(
  ctx: WritingContext,
  extraInstruction?: string
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(ctx) },
    {
      role: 'user',
      content: [
        `当前章节：${ctx.chapterTitle}`,
        ctx.contextTail
          ? `以下是正文已有内容的结尾部分：\n${trimTail(ctx.contextTail)}`
          : '（本章还没有内容，请写出开篇）',
        extraInstruction ? `补充要求：${extraInstruction}` : '',
        '请自然地续写下去，写 300~600 字，在语义完整处收笔。'
      ]
        .filter(Boolean)
        .join('\n')
    }
  ]
}

export type SelectionAction = 'polish' | 'expand' | 'rewrite'

/** 提取一段文字的最后一个句子（上文接缝锚点：输出的第一句要紧接它之后） */
function lastSentence(text: string): string {
  const re = /[。！？…][”』」’]?/g
  const ends: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) ends.push(m.index + m[0].length)
  if (ends.length >= 2) return text.slice(ends[ends.length - 2]).trim()
  return text.trim().slice(-80)
}

/** 提取一段文字的第一个句子（下文接缝锚点：输出的最后一句要能自然接到它之前） */
function firstSentence(text: string): string {
  const m = text.trim().match(/[\s\S]*?[。！？…][”』」’]?/)
  if (m) return m[0].trim()
  return text.trim().slice(0, 80)
}

/** 划词上下文快照：选区文本 + 选区前后紧邻的文字（供 AI 做无缝衔接，截断由编辑器层完成） */
export interface SelectionContext {
  text: string
  /** 选区之前紧邻的文字（末尾 N 字，截断加…） */
  before: string
  /** 选区之后紧邻的文字（开头 N 字，截断加…） */
  after: string
}

/** 划词操作提示词：润色/扩写/改写选中文字（三段式上下文 + 接缝锚点，强调无缝衔接） */
export function buildSelectionMessages(
  ctx: WritingContext,
  sel: SelectionContext,
  action: SelectionAction,
  customInstruction?: string
): ChatMessage[] {
  const actionText: Record<SelectionAction, string> = {
    polish: '润色这段文字：提升文笔与画面感，去除赘余，保持情节与信息不变，长度与原文相当',
    expand: `扩写这段文字：丰富细节描写、人物心理与环境，情节走向不变，长度扩到原文的 2~3 倍（原文 ${sel.text.replace(/\s/g, '').length} 字）`,
    rewrite: '改写这段文字：换一种写法重新表达，保留核心情节但可调整措辞与节奏，长度与原文相当'
  }
  const contextBlocks: string[] = []
  if (sel.before.trim()) contextBlocks.push(`【选区前文】（衔接参考，不要重复其中的句子）\n${sel.before}`)
  contextBlocks.push(`【待处理原文】\n${sel.text}`)
  if (sel.after.trim()) contextBlocks.push(`【选区后文】（衔接参考，不要提前展开其中的情节）\n${sel.after}`)
  // 接缝锚点：把真正决定衔接质量的紧邻两句单独拎出来高亮，避免被长窗口稀释注意力
  const anchors: string[] = []
  if (sel.before.trim()) anchors.push(`▲ 你输出的第一句要紧接这句之后：「${lastSentence(sel.before)}」`)
  if (sel.after.trim()) anchors.push(`▼ 你输出的最后一句要能自然接到这句之前：「${firstSentence(sel.after)}」`)
  return [
    { role: 'system', content: systemPrompt(ctx) },
    {
      role: 'user',
      content: [
        `当前章节：${ctx.chapterTitle}`,
        ...contextBlocks,
        anchors.length ? `【衔接锚点】\n${anchors.join('\n')}` : '',
        `任务：请${actionText[action]}。`,
        '衔接要求（重要）：',
        '- 你输出的文字将原位替换【待处理原文】，因此开头必须能自然接上【选区前文】的末句，结尾必须能自然接上【选区后文】的首句；',
        '- 不得重复选区前后文已有的句子或短语；',
        '- 保持文风、人称、时态与前后文一致；',
        '- 不得引入与前后文矛盾的新人物、新设定、新事件；不得提前揭示或消耗【选区后文】将要展开的情节与信息；',
        '- 保留原文中的关键名词（人名、地名、物品名等专有名词），不得改写为代称或泛称——前后文对这些词的指代必须仍然成立；',
        '- 不得切换叙事视角、时间线或场景地点；若原文含对话，保持对话的引号等格式形态；',
        '- 若【待处理原文】是句子的一部分（片段），输出也保持片段形态，不要补全成完整句子、不要自行分段；若是完整段落（可多段），输出保持相应的段落结构。',
        customInstruction ? `补充要求：${customInstruction}` : '',
        '只输出处理后的文字本身，不要任何解释。'
      ]
        .filter(Boolean)
        .join('\n')
    }
  ]
}

/** 整章润色提示词 */
export function buildChapterPolishMessages(ctx: WritingContext, fullText: string): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(ctx) },
    {
      role: 'user',
      content: [
        `请整章润色以下正文（章节：${ctx.chapterTitle}）：逐段打磨文笔、消除重复句式与AI味，`,
        '严格保持情节、人物、设定与段落结构不变，不增删情节。',
        '只输出润色后的完整正文。',
        `正文：\n${fullText}`
      ].join('\n')
    }
  ]
}

/** 解析当前应使用的档案：默认档案 → 第一个档案 → 报错 */
async function resolveProfile() {
  if (!isElectron) throw new Error('AI 功能仅支持在应用内使用')
  const [listRes, defRes] = await Promise.all([
    window.api.apiProfiles.list(),
    window.api.settings.get<string>('ai.default_profile_id', '')
  ])
  if (!listRes.ok) throw new Error(listRes.error)
  if (!defRes.ok) throw new Error(defRes.error)
  const profiles = listRes.data
  if (profiles.length === 0) {
    throw new Error('还没有可用的 AI 档案，请先到「设置中心」配置 API')
  }
  return profiles.find((p) => p.id === defRes.data) ?? profiles[0]
}

/** 发起一次写作生成（流式）；返回会话与档案显示名 */
export async function generateWriting(
  messages: ChatMessage[],
  handlers: StreamHandlers
): Promise<{ session: StreamSession; profileName: string }> {
  const profile = await resolveProfile()
  const session = await chatStream(profile, messages, handlers)
  return { session, profileName: profile.name }
}
