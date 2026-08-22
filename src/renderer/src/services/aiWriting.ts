/**
 * AI 写作服务：续写/润色/扩写/改写/整章润色的提示词构造与调用封装。
 * 复用 services/ai.ts 的流式管线与「默认档案」机制；提示词面向网文写作，
 * 输出约定为纯正文（不带解释、不带引号包裹）。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import { chatStream, type StreamHandlers, type StreamSession } from './ai'
import { isElectron } from './books'

/** 供提示词使用的上下文（由编辑器层从当前状态提取） */
export interface WritingContext {
  book: Pick<Book, 'title' | 'genre' | 'description'> | null
  chapterTitle: string
  /** 前文尾部纯文本（调用方负责截断） */
  contextTail: string
}

/** 前文注入上限（字符）：过长会挤占生成预算且多数模型难以利用 */
const CONTEXT_TAIL_LIMIT = 3000

/** system 提示：网文写作助手角色与输出纪律 */
function systemPrompt(ctx: WritingContext): string {
  const meta: string[] = []
  if (ctx.book?.title) meta.push(`书名《${ctx.book.title}》`)
  if (ctx.book?.genre) meta.push(`题材：${ctx.book.genre}`)
  if (ctx.book?.description) meta.push(`简介：${ctx.book.description.slice(0, 200)}`)
  return [
    '你是一位资深网文写作助手，正在为一部长篇小说执笔。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    '要求：直接输出小说正文本身；不要任何解释、前言、标题、编号或引号包裹；',
    '保持与前文一致的文风、人称与时态；中文书写，段落自然分段。'
  ]
    .filter(Boolean)
    .join('')
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

/** 划词操作提示词：润色/扩写/改写选中文字 */
export function buildSelectionMessages(
  ctx: WritingContext,
  selectedText: string,
  action: SelectionAction,
  customInstruction?: string
): ChatMessage[] {
  const actionText: Record<SelectionAction, string> = {
    polish: '润色这段文字：提升文笔与画面感，去除赘余，保持情节与信息不变',
    expand: '扩写这段文字：丰富细节描写、人物心理与环境，情节走向不变',
    rewrite: '改写这段文字：换一种写法重新表达，保留核心情节但可调整措辞与节奏'
  }
  return [
    { role: 'system', content: systemPrompt(ctx) },
    {
      role: 'user',
      content: [
        `当前章节：${ctx.chapterTitle}`,
        ctx.contextTail ? `前文结尾（仅供衔接参考）：\n${trimTail(ctx.contextTail)}` : '',
        `请${actionText[action]}。原文如下：\n${selectedText}`,
        customInstruction ? `补充要求：${customInstruction}` : '',
        '只输出处理后的文字本身。'
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
