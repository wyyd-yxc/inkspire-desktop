/**
 * 章节画布提示词构造与解析：5 种 AI 场景生成模式 + 按场景顺序生成正文。
 * 提示词不使用内部流程术语；带前文/已挂词条/创世台设定上下文。
 */
import type { ChatMessage } from '../../../shared/ai.types'
import type { Book } from '../../../shared/book.types'
import type { Scene, SceneGenMode } from '../../../shared/canvas.types'
import type { WikiEntry } from '../../../shared/wiki.types'
import { WIKI_TYPE_LABELS } from '../../../shared/wiki.types'

/** 场景生成的 system 提示（复用写作管线的书籍信息+文风逻辑由调用方拼入 ctx） */
function sceneSystemPrompt(book: Pick<Book, 'title' | 'genre' | 'description'>): string {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  if (book.description) meta.push(`简介：${book.description.slice(0, 200)}`)
  return [
    '你是一位资深网文结构师，擅长设计章节内的场景节奏与冲突升级。',
    meta.length ? `作品信息——${meta.join('；')}。` : '',
    '输出要求：设定具体、冲突清晰、节拍明确；中文书写。'
  ]
    .filter(Boolean)
    .join('')
}

/** 场景摘要行（供上下文引用） */
function sceneLine(s: Scene): string {
  const tags = s.tags.length ? `（标签：${s.tags.join('/')}）` : ''
  return `${s.sortOrder}. ${s.title}｜节拍:${s.beat || '无'}｜张力:${s.tension}${tags}｜摘要:${s.summary || '（空）'}`
}

/** 已挂词条的注入文本（生成场景/正文时 AI 参考） */
export function wikiRefText(refs: string[], wikiEntries: WikiEntry[]): string {
  const blocks: string[] = []
  for (const id of refs) {
    const w = wikiEntries.find((x) => x.id === id)
    if (!w) continue
    const attrs = w.attributes.map((a) => `${a.key}:${a.value}`).join('；')
    blocks.push(`【${WIKI_TYPE_LABELS[w.type]}·${w.name}】${w.summary}${attrs ? '｜' + attrs : ''}`)
  }
  return blocks.join('\n')
}

/** 场景生成 prompt 的公共上下文块 */
function sceneContextBlock(
  chapterTitle: string,
  chapterSummary: string,
  scenes: Scene[],
  wikiText: string
): string[] {
  const blocks: string[] = [`当前章节：${chapterTitle}`]
  if (chapterSummary.trim()) blocks.push(`章节概要：${chapterSummary}`)
  if (scenes.length)
    blocks.push(`已有场景（按叙事顺序）：\n${scenes.map(sceneLine).join('\n')}`)
  if (wikiText) blocks.push(`本章关联设定（必须遵守，不得写错）：\n${wikiText}`)
  return blocks
}

/** 生成场景链的严格 JSON 输出格式说明 */
const SCENE_JSON_SPEC = `严格输出如下 JSON 数组（不要任何额外文字、不要 markdown 代码块）：
[
  { "title": "场景名", "summary": "剧情摘要（60-150 字，具体可写）", "beat": "情节节拍", "tension": 3, "tags": ["标签"] }
]
tension 为 1-5 整数（5 最紧张）。`

export interface SceneGenParams {
  book: Pick<Book, 'title' | 'genre' | 'description'>
  chapterTitle: string
  chapterSummary: string
  /** 当前全部场景（按顺序） */
  scenes: Scene[]
  /** 模式所需的锚点场景（bridge=前锚点；rewrite=被改写场景） */
  anchorScene?: Scene
  /** append 模式要追加的场景数 */
  appendCount?: number
  wikiText: string
  /** 用户补充指令 */
  instruction?: string
}

/** 按模式构造场景生成消息 */
export function buildSceneGenMessages(mode: SceneGenMode, p: SceneGenParams): ChatMessage[] {
  const ctx = sceneContextBlock(p.chapterTitle, p.chapterSummary, p.scenes, p.wikiText)
  const tail = `${p.instruction ? `补充要求：${p.instruction}` : ''}\n${SCENE_JSON_SPEC}`
  let task: string
  switch (mode) {
    case 'init':
      task = `本章还没有场景。请根据章节信息设计 3-5 个场景，形成完整的起承转合节奏。`
      break
    case 'bridge': {
      const idx = p.scenes.findIndex((s) => s.id === p.anchorScene?.id)
      const prev = idx > 0 ? p.scenes[idx - 1] : null
      const next = idx >= 0 && idx < p.scenes.length - 1 ? p.scenes[idx + 1] : null
      task = `请在「${prev?.title ?? '（开头）'}」与「${next?.title ?? '（结尾）'}」之间设计 1 个过渡场景，承接前者、引出后者，补齐叙事断层。只输出这 1 个场景的对象（作为数组唯一元素）。`
      break
    }
    case 'rewrite':
      task = `请改写场景「${p.anchorScene?.title}」：融入关联设定与伏笔充实其摘要，保持与其他场景的衔接与整体节奏，只输出改写后的这 1 个场景对象（保留原 id 语义不需要，输出数组唯一元素）。`
      break
    case 'ending':
      task = `请为本章设计 1 个收尾场景：收束本章主线冲突，留下引向下一章的钩子。只输出这 1 个场景对象。`
      break
    case 'append':
      task = `请在现有场景之后续写 ${p.appendCount ?? 2} 个场景，自然推进剧情。`
      break
  }
  return [
    { role: 'system', content: sceneSystemPrompt(p.book) },
    { role: 'user', content: [...ctx, task, tail].filter(Boolean).join('\n\n') }
  ]
}

/** 解析场景生成输出（宽容 JSON：数组或单对象均可） */
export function parseSceneGen(
  text: string
): Array<{ title: string; summary: string; beat: string; tension: number; tags: string[] }> {
  const first = Math.min(
    ...[text.indexOf('['), text.indexOf('{')].filter((n) => n >= 0)
  )
  const last = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  if (!Number.isFinite(first) || last <= first) return []
  let raw = text.slice(first, last + 1)
  // 宽容修复：值内未转义引号
  let out = ''
  let inStr = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (!inStr) {
      if (ch === '"') inStr = true
      out += ch
      continue
    }
    if (ch === '\\') {
      out += ch + (raw[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '"') {
      let j = i + 1
      while (j < raw.length && /\s/.test(raw[j])) j++
      const next = raw[j]
      if (next === ',' || next === '}' || next === ']' || next === ':') {
        inStr = false
        out += ch
      } else out += '\\"'
      continue
    }
    out += ch
  }
  try {
    const parsed = JSON.parse(out)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((s) => s && (s.title || s.summary))
      .map((s) => ({
        title: String(s.title ?? '未命名场景').slice(0, 40),
        summary: String(s.summary ?? ''),
        beat: String(s.beat ?? ''),
        tension: Math.min(5, Math.max(1, Number(s.tension) || 3)),
        tags: Array.isArray(s.tags) ? s.tags.map(String).slice(0, 4) : []
      }))
  } catch {
    return []
  }
}

/** 按场景顺序生成正文的单场景提示词（逐场景调用，带上文衔接与场景关系） */
export function buildSceneProseMessages(
  book: Pick<Book, 'title' | 'genre' | 'description'>,
  chapterTitle: string,
  scene: Scene,
  precedingText: string,
  isLast: boolean,
  wikiText: string,
  targetWords: number,
  relationText?: string
): ChatMessage[] {
  const meta: string[] = []
  if (book.title) meta.push(`书名《${book.title}》`)
  if (book.genre) meta.push(`题材：${book.genre}`)
  return [
    {
      role: 'system',
      content: [
        '你是一位资深网文写作助手，正在为一部长篇小说执笔。',
        meta.length ? `作品信息——${meta.join('；')}。` : '',
        wikiText ? `本章关联设定（必须严格遵守）：\n${wikiText}` : '',
        relationText ? `场景关系（叙事走向必须遵守，不得写反因果）：${relationText}` : '',
        '要求：直接输出小说正文本身；不要任何解释、前言、标题或引号包裹；保持文风、人称与时态一致；中文书写，段落自然分段。'
      ]
        .filter(Boolean)
        .join('')
    },
    {
      role: 'user',
      content: [
        `当前章节：${chapterTitle}`,
        precedingText
          ? `本章已有正文结尾（你的输出要自然衔接）：\n…${precedingText.slice(-800)}`
          : '（本章正文由此开始）',
        `请撰写场景「${scene.title}」的正文：\n剧情摘要：${scene.summary}\n节拍：${scene.beat || '无'}\n张力等级：${scene.tension}/5${scene.tags.length ? `\n标签：${scene.tags.join('/')}` : ''}`,
        `篇幅约 ${targetWords} 字。${isLast ? '这是本章最后一个场景，在语义完整处收束，可留轻微钩子。' : '写完本场景即停，不要开启下一场景的内容。'}`
      ]
        .filter(Boolean)
        .join('\n')
    }
  ]
}
