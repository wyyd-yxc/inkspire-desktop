/**
 * scene-edges 域 IPC：场景连线 CRUD。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createSceneEdge,
  listSceneEdges,
  removeSceneEdge,
  updateSceneEdge
} from '../db/sceneEdges'
import type {
  CreateSceneEdgeInput,
  UpdateSceneEdgeInput
} from '../../shared/canvas.types'

export function registerSceneEdgeIpc(): void {
  ipcMain.handle('scene-edges:list', (_e, chapterId: string) =>
    wrap(() => listSceneEdges(chapterId))
  )

  ipcMain.handle('scene-edges:create', (_e, input: CreateSceneEdgeInput) =>
    wrap(() => createSceneEdge(input))
  )

  ipcMain.handle('scene-edges:update', (_e, id: string, input: UpdateSceneEdgeInput) =>
    wrap(() => updateSceneEdge(id, input))
  )

  ipcMain.handle('scene-edges:remove', (_e, id: string) => wrap(() => removeSceneEdge(id)))
}
