/**
 * 预加载桥接层（preload）。
 * 以白名单方式向渲染进程暴露安全 API：渲染进程只能通过 window.api.* 与主进程通信，
 * 永远拿不到 ipcRenderer 原始对象（安全约定见 docs/standards/coding-standards.md 第 9 节）。
 * 新增 IPC 通道时：先在 src/shared/ 登记类型，再在此处暴露对应方法。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult } from '../shared/ipc'
import type { Book, CreateBookInput, UpdateBookInput } from '../shared/book.types'

const api = {
  /** IPC 通路自检：正常返回 { ok: true, data: 'pong' } */
  ping: (): Promise<IpcResult<string>> => ipcRenderer.invoke('app:ping'),

  /** 书籍管理（书斋） */
  books: {
    list: (): Promise<IpcResult<Book[]>> => ipcRenderer.invoke('books:list'),
    create: (input: CreateBookInput): Promise<IpcResult<Book>> =>
      ipcRenderer.invoke('books:create', input),
    update: (id: string, input: UpdateBookInput): Promise<IpcResult<Book>> =>
      ipcRenderer.invoke('books:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('books:delete', id)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
