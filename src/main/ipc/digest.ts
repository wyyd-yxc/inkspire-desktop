/**
 * 拆书 IPC（M14）：digest:pick-text 单只读通道。
 * 主进程弹文件对话框选 txt→UTF-8 读取→截取前 2 万字返回。
 * 参考文本仅内存传递给渲染层（隐私决策：不落库不落盘，拆完即弃）。
 * 用户取消不算错误，返回 null 由渲染层停留导入态。
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { wrap } from './wrap'

/** 参考文本截取上限（字符）：超长样本挤占生成预算且收益递减 */
export const DIGEST_TEXT_LIMIT = 20000
/** 文件体积护栏：正常文本片段远小于此，超限多半选错文件 */
const MAX_TXT_BYTES = 10 * 1024 * 1024

export function registerDigestIpc(): void {
  ipcMain.handle('digest:pick-text', (e) =>
    wrap(async () => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const opts = {
        title: '选择参考文本（txt）',
        properties: ['openFile'] as Array<'openFile'>,
        filters: [{ name: '文本文件', extensions: ['txt'] }]
      }
      const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (picked.canceled || picked.filePaths.length === 0) return null
      const src = picked.filePaths[0]
      if (path.extname(src).slice(1).toLowerCase() !== 'txt') throw new Error('仅支持 txt 文本文件')
      const info = await stat(src)
      if (info.size > MAX_TXT_BYTES) throw new Error('文件超过 10MB，请确认选择的是文本片段')
      const raw = (await readFile(src)).toString('utf8').replace(/^\uFEFF/, '')
      const truncated = raw.length > DIGEST_TEXT_LIMIT
      return {
        fileName: path.basename(src),
        text: raw.slice(0, DIGEST_TEXT_LIMIT),
        totalChars: raw.length,
        truncated
      }
    })
  )
}
