/**
 * plot 域 IPC：剧情事件（plot:*）与剧情连线（plot-edges:*）CRUD。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createPlotEvent,
  listPlotEvents,
  removePlotEvent,
  updatePlotEvent
} from '../db/plot'
import {
  createPlotEdge,
  listPlotEdges,
  removePlotEdge,
  updatePlotEdge
} from '../db/plotEdges'
import type {
  CreatePlotEdgeInput,
  CreatePlotEventInput,
  UpdatePlotEdgeInput,
  UpdatePlotEventInput
} from '../../shared/plot.types'

/** 轻量 UUID 校验（防渲染层传入脏 id 跨书越权，照 sceneEdges M7 静态审查建议） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(...ids: string[]): void {
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new Error('参数格式非法')
  }
}

export function registerPlotIpc(): void {
  ipcMain.handle('plot:list', (_e, bookId: string, parentId?: string) => {
    assertUuid(bookId)
    if (parentId) assertUuid(parentId)
    return wrap(() => listPlotEvents(bookId, parentId))
  })

  ipcMain.handle('plot:create', (_e, input: CreatePlotEventInput) =>
    wrap(() => {
      assertUuid(input.bookId)
      return createPlotEvent(input)
    })
  )

  ipcMain.handle('plot:update', (_e, id: string, input: UpdatePlotEventInput) =>
    wrap(() => {
      assertUuid(id)
      return updatePlotEvent(id, input)
    })
  )

  ipcMain.handle('plot:remove', (_e, id: string) =>
    wrap(() => {
      assertUuid(id)
      return removePlotEvent(id)
    })
  )

  ipcMain.handle('plot-edges:list', (_e, bookId: string) => {
    assertUuid(bookId)
    return wrap(() => listPlotEdges(bookId))
  })

  ipcMain.handle('plot-edges:create', (_e, input: CreatePlotEdgeInput) =>
    wrap(() => {
      assertUuid(input.bookId, input.sourceId, input.targetId)
      return createPlotEdge(input)
    })
  )

  ipcMain.handle('plot-edges:update', (_e, id: string, input: UpdatePlotEdgeInput) =>
    wrap(() => {
      assertUuid(id)
      return updatePlotEdge(id, input)
    })
  )

  ipcMain.handle('plot-edges:remove', (_e, id: string) =>
    wrap(() => {
      assertUuid(id)
      return removePlotEdge(id)
    })
  )
}
