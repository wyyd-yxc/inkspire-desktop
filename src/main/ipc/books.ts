/**
 * books 域 IPC handler 注册（通道命名规范：domain:action）。
 * 全部经 wrap() 包装，渲染层拿到的永远是 IpcResult。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import { createBook, deleteBook, listBooks, updateBook } from '../db/books'
import type { CreateBookInput, UpdateBookInput } from '../../shared/book.types'

/** 注册 books 域全部通道（在 app ready 后调用一次） */
export function registerBookIpc(): void {
  ipcMain.handle('books:list', () => wrap(() => listBooks()))

  ipcMain.handle('books:create', (_e, input: CreateBookInput) =>
    wrap(() => createBook(input))
  )

  ipcMain.handle('books:update', (_e, id: string, input: UpdateBookInput) =>
    wrap(() => updateBook(id, input))
  )

  ipcMain.handle('books:delete', (_e, id: string) => wrap(() => deleteBook(id)))
}
