/**
 * assistant 域 IPC：写作助手对话历史。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  clearAssistantMessages,
  createAssistantMessage,
  listAssistantMessages
} from '../db/assistantMessages'
import type { AssistantRole } from '../../shared/assistant.types'

export function registerAssistantIpc(): void {
  ipcMain.handle('assistant:list', (_e, bookId: string) =>
    wrap(() => listAssistantMessages(bookId))
  )

  ipcMain.handle(
    'assistant:create',
    (_e, bookId: string, role: AssistantRole, content: string) =>
      wrap(() => createAssistantMessage(bookId, role, content))
  )

  ipcMain.handle('assistant:clear', (_e, bookId: string) =>
    wrap(() => clearAssistantMessages(bookId))
  )
}
