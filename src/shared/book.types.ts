/**
 * 书籍实体与输入类型（跨进程共享契约）。
 * 命名用 camelCase；与数据库 snake_case 行的映射在 DAO 层完成。
 */

/** 网文题材分类（影响后续 AI 生成的题材偏好，对照原站书斋分类） */
export const BOOK_GENRES = [
  '玄幻',
  '仙侠',
  '都市',
  '科幻',
  '历史',
  '言情',
  '悬疑',
  '武侠',
  '游戏',
  '轻小说'
] as const

export type BookGenre = (typeof BOOK_GENRES)[number]

/** 书籍状态：创作中 / 完结 / 封存（archived 在书斋中隐藏） */
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
  createdAt: string
  updatedAt: string
}

/** 新建书籍输入 */
export interface CreateBookInput {
  title: string
  genre: BookGenre | ''
  description: string
  cover?: string
}

/** 更新书籍输入（全部可选，仅更新给定字段） */
export interface UpdateBookInput {
  title?: string
  genre?: BookGenre | ''
  description?: string
  cover?: string
  status?: BookStatus
}
