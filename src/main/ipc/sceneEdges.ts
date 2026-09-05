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

/** 轻量 UUID 校验（防渲染层传入脏 id 跨章节越权，M7 静态审查建议） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(...ids: string[]): void {
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new Error('参数格式非法')
  }
}

export function registerSceneEdgeIpc(): void {
  ipcMain.handle('scene-edges:list', (_e, chapterId: string) => {
    assertUuid(chapterId)
    return wrap(() => listSceneEdges(chapterId))
  })

  ipcMain.handle('scene-edges:create', (_e, input: CreateSceneEdgeInput) =>
    wrap(() => {
      assertUuid(input.chapterId, input.sourceId, input.targetId)
      return createSceneEdge(input)
    })
  )

  ipcMain.handle('scene-edges:update', (_e, id: string, input: UpdateSceneEdgeInput) =>
    wrap(() => {
      assertUuid(id)
      return updateSceneEdge(id, input)
    })
  )

  ipcMain.handle('scene-edges:remove', (_e, id: string) =>
    wrap(() => {
      assertUuid(id)
      return removeSceneEdge(id)
    })
  )
}
