/**
 * scenes 域 IPC：场景规划场景节点。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createScene,
  getScene,
  listScenes,
  removeScene,
  reorderScenes,
  updateScene
} from '../db/scenes'
import type { CreateSceneInput, UpdateSceneInput } from '../../shared/canvas.types'

export function registerSceneIpc(): void {
  ipcMain.handle('scenes:list', (_e, chapterId: string) => wrap(() => listScenes(chapterId)))

  // 单查：灵感墙「查看」按场景 id 反查所在章节后跳画布（M11）；未命中回 null（IPC 不跨 undefined）
  ipcMain.handle('scenes:get', (_e, id: string) => wrap(() => getScene(id) ?? null))

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
