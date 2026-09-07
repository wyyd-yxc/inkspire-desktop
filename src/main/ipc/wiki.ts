/**
 * wiki 域 IPC：设定集词条增删改查 + 名称查重（M10.6）。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createWikiEntry,
  findDuplicate,
  listWikiEntries,
  removeWikiEntry,
  updateWikiEntry
} from '../db/wiki'
import type { CreateWikiInput, UpdateWikiInput } from '../../shared/wiki.types'

export function registerWikiIpc(): void {
  ipcMain.handle('wiki:list', (_e, bookId: string) => wrap(() => listWikiEntries(bookId)))

  ipcMain.handle('wiki:check-dup', (_e, bookId: string, name: string, type: string, excludeId?: string) =>
    wrap(() => {
      if (typeof bookId !== 'string' || typeof name !== 'string' || typeof type !== 'string') {
        throw new Error('参数格式非法')
      }
      if (excludeId !== undefined && typeof excludeId !== 'string') throw new Error('参数格式非法')
      return findDuplicate(bookId, name, type, excludeId)
    })
  )

  ipcMain.handle('wiki:create', (_e, input: CreateWikiInput) =>
    wrap(() => createWikiEntry(input))
  )

  ipcMain.handle('wiki:update', (_e, id: string, input: UpdateWikiInput) =>
    wrap(() => updateWikiEntry(id, input))
  )

  ipcMain.handle('wiki:remove', (_e, id: string) => wrap(() => removeWikiEntry(id)))
}
