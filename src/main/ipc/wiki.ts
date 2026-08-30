/**
 * wiki 域 IPC：万物百科词条增删改查。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createWikiEntry,
  listWikiEntries,
  removeWikiEntry,
  updateWikiEntry
} from '../db/wiki'
import type { CreateWikiInput, UpdateWikiInput } from '../../shared/wiki.types'

export function registerWikiIpc(): void {
  ipcMain.handle('wiki:list', (_e, bookId: string) => wrap(() => listWikiEntries(bookId)))

  ipcMain.handle('wiki:create', (_e, input: CreateWikiInput) =>
    wrap(() => createWikiEntry(input))
  )

  ipcMain.handle('wiki:update', (_e, id: string, input: UpdateWikiInput) =>
    wrap(() => updateWikiEntry(id, input))
  )

  ipcMain.handle('wiki:remove', (_e, id: string) => wrap(() => removeWikiEntry(id)))
}
