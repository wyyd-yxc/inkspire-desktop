/**
 * stats 域 IPC：创作统计只读查询（快照记录内嵌 chapters:update，本域无写入通道）。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import { listWordSnapshots } from '../db/stats'

/** 轻量 UUID 校验（照 plot.ts/inspirations.ts 惯例） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerStatsIpc(): void {
  ipcMain.handle('stats:list', (_e, bookId: string) =>
    wrap(() => {
      if (!UUID_RE.test(bookId)) throw new Error('参数格式非法')
      return listWordSnapshots(bookId)
    })
  )
}
