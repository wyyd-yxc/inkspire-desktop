/**
 * 书籍封面 IPC（books:set-cover / books:remove-cover / books:read-cover）。
 * 文件落盘 userData/covers/<uuid>.<ext>，DB books.cover 只存文件名（v1 既有约定）；
 * 读取回 data URL（渲染层 <img> 直接可用，CSP img-src data: 合规）。
 * 移除封面/删书不清理物理文件（小文件无害——M12 任务卡已知边界）。
 */
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, type BrowserWindow as BrowserWindowType } from 'electron'
import { wrap } from './wrap'
import { getBook, updateBook } from '../db/books'

/** 封面目录（惰性取，app ready 后才有 userData） */
const coverDir = (): string => path.join(app.getPath('userData'), 'covers')

const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
/** 封面体积上限：超大会拖慢书房渲染与 IPC 传输 */
const MAX_COVER_BYTES = 5 * 1024 * 1024

export function registerCoverIpc(): void {
  ipcMain.handle('books:set-cover', (e, bookId: string) =>
    wrap(async () => {
      const win: BrowserWindowType | null = BrowserWindow.fromWebContents(e.sender)
      const opts = {
        title: '选择封面图片',
        properties: ['openFile'] as Array<'openFile'>,
        filters: [{ name: '图片', extensions: [...ALLOWED_EXT] }]
      }
      const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      // 用户取消：不算错误，原样返回当前书
      if (picked.canceled || picked.filePaths.length === 0) {
        const current = getBook(bookId)
        if (!current) throw new Error('书籍不存在')
        return current
      }
      const src = picked.filePaths[0]
      const ext = path.extname(src).slice(1).toLowerCase()
      if (!ALLOWED_EXT.has(ext)) throw new Error('仅支持 png / jpg / webp / gif 图片')
      const info = await stat(src)
      if (info.size > MAX_COVER_BYTES) throw new Error('封面图片不能超过 5MB')
      const filename = `${randomUUID()}.${ext}`
      await mkdir(coverDir(), { recursive: true })
      await copyFile(src, path.join(coverDir(), filename))
      return updateBook(bookId, { cover: filename })
    })
  )

  ipcMain.handle('books:remove-cover', (_e, bookId: string) =>
    wrap(() => updateBook(bookId, { cover: '' }))
  )

  ipcMain.handle('books:read-cover', (_e, filename: string) =>
    wrap(async () => {
      // 只接受本进程生成的纯文件名（uuid.ext），防路径穿越
      const base = path.basename(filename)
      if (base !== filename || base.includes('..')) throw new Error('非法的封面文件名')
      const ext = path.extname(base).slice(1).toLowerCase()
      if (!ALLOWED_EXT.has(ext)) throw new Error('非法的封面文件名')
      const buf = await readFile(path.join(coverDir(), base))
      const mime = ext === 'jpg' ? 'jpeg' : ext
      return `data:image/${mime};base64,${buf.toString('base64')}`
    })
  )
}
