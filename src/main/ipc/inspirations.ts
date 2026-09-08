/**
 * inspirations 域 IPC：灵感墙五类便签（inspirations:*）CRUD。
 * 删除为物理删且仅限回收站内便签（DAO 兜底校验）；软删/恢复走 update 的 isRecycled。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createInspiration,
  listInspirations,
  removeInspiration,
  updateInspiration
} from '../db/inspirations'
import type {
  CreateInspirationInput,
  UpdateInspirationInput
} from '../../shared/inspiration.types'

/** 轻量 UUID 校验（防渲染层传入脏 id，照 plot.ts 惯例） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(...ids: string[]): void {
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new Error('参数格式非法')
  }
}

/** 校验输入里的词条引用数组格式（只验格式不验归属，信任边界同 plot.ts M10 登记） */
function assertWikiRefs(input: { wikiRefs?: string[] }): void {
  for (const rid of input.wikiRefs ?? []) {
    if (!UUID_RE.test(rid)) throw new Error('词条引用格式非法')
  }
}

export function registerInspirationIpc(): void {
  ipcMain.handle('inspirations:list', (_e, bookId: string) => {
    assertUuid(bookId)
    return wrap(() => listInspirations(bookId))
  })

  ipcMain.handle('inspirations:create', (_e, input: CreateInspirationInput) =>
    wrap(() => {
      assertUuid(input.bookId)
      assertWikiRefs(input)
      return createInspiration(input)
    })
  )

  ipcMain.handle('inspirations:update', (_e, id: string, input: UpdateInspirationInput) =>
    wrap(() => {
      assertUuid(id)
      assertWikiRefs(input)
      // 回链目标 id 同样做格式校验（防污染 id 落库）
      if (input.refId) assertUuid(input.refId)
      return updateInspiration(id, input)
    })
  )

  ipcMain.handle('inspirations:remove', (_e, id: string) =>
    wrap(() => {
      assertUuid(id)
      return removeInspiration(id)
    })
  )
}
