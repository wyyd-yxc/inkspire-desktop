/**
 * 预加载桥接层（preload）。
 * 以白名单方式向渲染进程暴露安全 API：渲染进程只能通过 window.api.* 与主进程通信，
 * 永远拿不到 ipcRenderer 原始对象（安全约定见 docs/standards/coding-standards.md 第 9 节）。
 * 新增 IPC 通道时：先在 src/shared/ipc.ts 登记类型，再在此处暴露对应方法。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult } from '../shared/ipc'

const api = {
  /** IPC 通路自检：正常返回 { ok: true, data: 'pong' } */
  ping: (): Promise<IpcResult<string>> => ipcRenderer.invoke('app:ping')
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
