/**
 * sync 域 IPC：抽取水位的原子合并（M10.5 静态审查 §1）。
 * 渲染层两步 get→set 之间存在交错丢更新窗口；合并逻辑下沉主进程单线程内即天然原子。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import { mergeWatermarkChapter } from '../db/settings'

/** 轻量 UUID 校验（与 plot 域同款） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerSyncIpc(): void {
  ipcMain.handle('sync:watermark-merge', (_e, key: string, chapterId: string, wordCount: number) =>
    wrap(() => {
      if (typeof key !== 'string' || !UUID_RE.test(chapterId)) throw new Error('参数格式非法')
      mergeWatermarkChapter(key, chapterId, wordCount)
      return true
    })
  )
}
