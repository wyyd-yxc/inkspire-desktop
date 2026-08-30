/**
 * scenes 域 IPC：章节画布场景节点。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createScene,
  listScenes,
  removeScene,
  reorderScenes,
  updateScene
} from '../db/scenes'
import type { CreateSceneInput, UpdateSceneInput } from '../../shared/canvas.types'

export function registerSceneIpc(): void {
  ipcMain.handle('scenes:list', (_e, chapterId: string) => wrap(() => listScenes(chapterId)))

  ipcMain.handle('scenes:create', (_e, input: CreateSceneInput) =>
    wrap(() => createScene(input))
  )

  ipcMain.handle('scenes:update', (_e, id: string, input: UpdateSceneInput) =>
    wrap(() => updateScene(id, input))
  )

  ipcMain.handle('scenes:remove', (_e, id: string) => wrap(() => removeScene(id)))

  ipcMain.handle(
    'scenes:reorder',
    (_e, chapterId: string, orderedIds: string[]) =>
      wrap(() => reorderScenes(chapterId, orderedIds))
  )
}
