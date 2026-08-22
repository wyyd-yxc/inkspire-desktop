/**
 * 渲染层书籍服务：封装 window.api.books 调用与 IpcResult 解包。
 * 兼容两种运行环境：
 * - Electron 内：走真实 IPC（唯一生产路径）
 * - 普通浏览器（vite dev 直开）：使用内存 mock，仅用于开发期 UI 视觉调试
 */
import type { Book, CreateBookInput, UpdateBookInput } from '../../../shared/book.types'
import type { IpcResult } from '../../../shared/ipc'

/** 是否运行在 Electron 内（preload 已注入） */
export const isElectron = typeof window !== 'undefined' && !!window.api

/** 解包 IpcResult：失败时抛出可读错误（由调用方 toast 呈现） */
function unwrap<T>(res: IpcResult<T>): T {
  if (!res.ok) throw new Error(res.error)
  return res.data
}

/** 浏览器调试用的内存实现（刷新即失，勿用于真实数据） */
const mock = (() => {
  let seq = 0
  const books: Book[] = [
    {
      id: 'mock-1',
      title: '示例小说（浏览器调试数据）',
      genre: '玄幻',
      description: '这是一条仅在普通浏览器中显示的示例数据，用于调 UI。',
      cover: '',
      status: 'writing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]
  return {
    list: async (): Promise<Book[]> => [...books],
    create: async (input: CreateBookInput): Promise<Book> => {
      const now = new Date().toISOString()
      const b: Book = {
        id: `mock-${++seq}`,
        title: input.title,
        genre: input.genre,
        description: input.description,
        cover: input.cover ?? '',
        status: 'writing',
        createdAt: now,
        updatedAt: now
      }
      books.unshift(b)
      return b
    },
    update: async (id: string, input: UpdateBookInput): Promise<Book> => {
      const i = books.findIndex((b) => b.id === id)
      if (i < 0) throw new Error('书籍不存在')
      books[i] = { ...books[i], ...input, updatedAt: new Date().toISOString() }
      return books[i]
    },
    remove: async (id: string): Promise<boolean> => {
      const i = books.findIndex((b) => b.id === id)
      if (i < 0) return false
      books.splice(i, 1)
      return true
    }
  }
})()

export const bookService = {
  list: (): Promise<Book[]> =>
    isElectron ? window.api.books.list().then(unwrap) : mock.list(),
  create: (input: CreateBookInput): Promise<Book> =>
    isElectron ? window.api.books.create(input).then(unwrap) : mock.create(input),
  update: (id: string, input: UpdateBookInput): Promise<Book> =>
    isElectron ? window.api.books.update(id, input).then(unwrap) : mock.update(id, input),
  remove: (id: string): Promise<boolean> =>
    isElectron ? window.api.books.remove(id).then(unwrap) : mock.remove(id)
}
