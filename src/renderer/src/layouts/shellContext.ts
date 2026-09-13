/**
 * 书内导航壳（BookShellLayout）与子页面的共享上下文契约（M15.5）。
 * 壳拥有 book/chapters 数据与章节重命名；子页面 inject 后与壳共享同一响应式数组，
 * 章节树的字数/标题随写作台保存实时更新。
 */
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'

/** 编辑器实时上下文（写作台页回写；助手浮球在书内任意页面读取，离开写作台清空） */
export interface EditorCtx {
  title: string
  content: string
  selection: string
}

export interface BookShellCtx {
  bookId: ComputedRef<string>
  book: Ref<Book | null>
  chapters: Ref<Chapter[]>
  /** 当前编辑章节 id（仅写作台路由有值，由 ?ch= 驱动；其他功能页为空串） */
  activeChapterId: ComputedRef<string>
  editorCtx: EditorCtx
  /** 章节重命名（壳统一实现：API+共享数组更新，写作台标题行内编辑复用） */
  renameChapter: (id: string, title: string) => Promise<void>
}

export const BOOK_SHELL_KEY: InjectionKey<BookShellCtx> = Symbol('bookShell')
