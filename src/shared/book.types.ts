/**
 * 书籍实体与输入类型（跨进程共享契约）。
 * 命名用 camelCase；与数据库 snake_case 行的映射在 DAO 层完成。
 */

/** 题材分类（M10.8 严肃写作命名；旧值经 migration v11 映射） */
export const BOOK_GENRES = [
  '长篇',
  '中短篇',
  '科幻',
  '历史',
  '悬疑',
  '奇幻',
  '现实主义',
  '武侠',
  '其他'
] as const

export type BookGenre = (typeof BOOK_GENRES)[number]

/** 书籍状态：创作中 / 完结 / 封存（archived 在书房中隐藏） */
export type BookStatus = 'writing' | 'finished' | 'archived'

/** 书籍实体（API 返回形态） */
export interface Book {
  id: string
  title: string
  genre: BookGenre | ''
  description: string
  /** 封面图片文件名（存于 userData/covers/）；空串表示使用默认渐变封面 */
  cover: string
  status: BookStatus
  /** 绑定的用户风格包 id；null=未绑定（注入回落到构思台基调步预设） */
  styleProfileId: string | null
  /** 全书字数目标（整数）；null=未设目标（统计页不显示进度条） */
  wordTarget: number | null
  createdAt: string
  updatedAt: string
}

/** 新建书籍输入 */
export interface CreateBookInput {
  title: string
  genre: BookGenre | ''
  description: string
  cover?: string
  styleProfileId?: string | null
  wordTarget?: number | null
}

/** 更新书籍输入（全部可选，仅更新给定字段） */
export interface UpdateBookInput {
  title?: string
  genre?: BookGenre | ''
  description?: string
  cover?: string
  status?: BookStatus
  /** 绑定风格包；传 null=解绑 */
  styleProfileId?: string | null
  /** 全书字数目标；传 null=清除目标 */
  wordTarget?: number | null
}
