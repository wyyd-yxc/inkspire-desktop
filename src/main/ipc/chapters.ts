/**
 * chapters 域 IPC：章节 CRUD 与移动。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createChapter,
  deleteChapter,
  listChapterMetas,
  listChapters,
  moveChapter,
  updateChapter
} from '../db/chapters'
import type { CreateChapterInput, UpdateChapterInput } from '../../shared/chapter.types'

export function registerChapterIpc(): void {
  ipcMain.handle('chapters:list', (_e, bookId: string) => wrap(() => listChapters(bookId)))

  ipcMain.handle('chapters:list-meta', (_e, bookId: string) => wrap(() => listChapterMetas(bookId)))

  ipcMain.handle('chapters:create', (_e, input: CreateChapterInput) =>
    wrap(() => createChapter(input))
  )

  ipcMain.handle('chapters:update', (_e, id: string, input: UpdateChapterInput) =>
    wrap(() => updateChapter(id, input))
  )

  ipcMain.handle('chapters:delete', (_e, id: string) => wrap(() => deleteChapter(id)))

  ipcMain.handle('chapters:move', (_e, id: string, dir: -1 | 1) =>
    wrap(() => moveChapter(id, dir))
  )
}
