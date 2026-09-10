/**
 * chapters 域 IPC：章节 CRUD 与移动。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapterMetas,
  listChapters,
  moveChapter,
  updateChapter
} from '../db/chapters'
import type { CreateChapterInput, UpdateChapterInput } from '../../shared/chapter.types'
import { recordWordSnapshot } from '../db/stats'

export function registerChapterIpc(): void {
  ipcMain.handle('chapters:list', (_e, bookId: string) => wrap(() => listChapters(bookId)))

  ipcMain.handle('chapters:list-meta', (_e, bookId: string) => wrap(() => listChapterMetas(bookId)))

  ipcMain.handle('chapters:get', (_e, id: string) => wrap(() => getChapter(id)))

  ipcMain.handle('chapters:create', (_e, input: CreateChapterInput) =>
    wrap(() => createChapter(input))
  )

  ipcMain.handle('chapters:update', (_e, id: string, input: UpdateChapterInput) =>
    wrap(() => {
      const updated = updateChapter(id, input)
      // M13 字数快照：一切改字数的写入（保存/AI 采纳/反向替换）都经此通道且传 wordCount——
      // 内嵌于此防漏报；快照失败不回滚保存（保存已成功，失败仅记日志）
      if (input.wordCount !== undefined) {
        try {
          recordWordSnapshot(updated.bookId)
        } catch (err) {
          console.warn('[stats] 字数快照记录失败:', err)
        }
      }
      return updated
    })
  )

  ipcMain.handle('chapters:delete', (_e, id: string) =>
    wrap(() => {
      const target = getChapter(id)
      const ok = deleteChapter(id)
      // M13：删章改变全书字数总量，同样入账快照（r1 静态审查严重项）；失败不阻断删除
      if (ok && target) {
        try {
          recordWordSnapshot(target.bookId)
        } catch (err) {
          console.warn('[stats] 字数快照记录失败:', err)
        }
      }
      return ok
    })
  )

  ipcMain.handle('chapters:move', (_e, id: string, dir: -1 | 1) =>
    wrap(() => moveChapter(id, dir))
  )
}
