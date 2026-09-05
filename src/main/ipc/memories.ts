/**
 * memories 域 IPC：作品记忆 CRUD。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createMemory,
  listMemories,
  removeMemory,
  updateMemory
} from '../db/memories'
import type { CreateMemoryInput, UpdateMemoryInput } from '../../shared/memory.types'

export function registerMemoryIpc(): void {
  ipcMain.handle('memories:list', (_e, bookId: string) => wrap(() => listMemories(bookId)))

  ipcMain.handle('memories:create', (_e, input: CreateMemoryInput) =>
    wrap(() => createMemory(input))
  )

  ipcMain.handle('memories:update', (_e, id: string, input: UpdateMemoryInput) =>
    wrap(() => updateMemory(id, input))
  )

  ipcMain.handle('memories:remove', (_e, id: string) => wrap(() => removeMemory(id)))
}
