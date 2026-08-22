/**
 * 章节实体与输入类型（跨进程共享契约）。
 * content 存 TipTap 的 HTML 文档；正文字数以纯文本（去标签与空白）计。
 */

/** 章节状态：草稿 / 已完成 / 已发布（M3 仅用 draft/finished，published 预留） */
export type ChapterStatus = 'draft' | 'finished' | 'published'

export interface Chapter {
  id: string
  bookId: string
  title: string
  /** 章节概要（供后续 AI 上下文与大纲视图使用） */
  summary: string
  sortOrder: number
  /** 正文（TipTap HTML 文档） */
  content: string
  wordCount: number
  status: ChapterStatus
  createdAt: string
  updatedAt: string
}

export interface CreateChapterInput {
  bookId: string
  title?: string
  summary?: string
}

export interface UpdateChapterInput {
  title?: string
  summary?: string
  content?: string
  /** 仅由调用方显式传值时更新（保存正文时顺带重算，避免每次读都写） */
  wordCount?: number
  status?: ChapterStatus
}
