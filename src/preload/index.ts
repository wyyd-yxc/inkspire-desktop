/**
 * 预加载桥接层（preload）。
 * 以白名单方式向渲染进程暴露安全 API：渲染进程只能通过 window.api.* 与主进程通信，
 * 永远拿不到 ipcRenderer 原始对象（安全约定见 docs/standards/coding-standards.md 第 9 节）。
 * 新增 IPC 通道时：先在 src/shared/ 登记类型，再在此处暴露对应方法。
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { IpcResult } from '../shared/ipc'
import type { Book, CreateBookInput, UpdateBookInput } from '../shared/book.types'
import type {
  AiStreamEvent,
  ApiProfile,
  ChatStreamRequest,
  CreateApiProfileInput,
  UpdateApiProfileInput
} from '../shared/ai.types'
import type {
  Chapter,
  CreateChapterInput,
  UpdateChapterInput
} from '../shared/chapter.types'
import type {
  GenesisStep,
  GenesisStepRecord,
  SaveGenesisInput
} from '../shared/genesis.types'
import type {
  CreateWikiInput,
  UpdateWikiInput,
  WikiEntry
} from '../shared/wiki.types'

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
  },

  /** 章节管理（正文工作台） */
  chapters: {
    list: (bookId: string): Promise<IpcResult<Chapter[]>> =>
      ipcRenderer.invoke('chapters:list', bookId),
    create: (input: CreateChapterInput): Promise<IpcResult<Chapter>> =>
      ipcRenderer.invoke('chapters:create', input),
    update: (id: string, input: UpdateChapterInput): Promise<IpcResult<Chapter>> =>
      ipcRenderer.invoke('chapters:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('chapters:delete', id),
    move: (id: string, dir: -1 | 1): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('chapters:move', id, dir)
  },

  /** 创世台五步设定 */
  genesis: {
    get: (bookId: string): Promise<IpcResult<GenesisStepRecord[]>> =>
      ipcRenderer.invoke('genesis:get', bookId),
    save: (bookId: string, input: SaveGenesisInput): Promise<IpcResult<GenesisStepRecord>> =>
      ipcRenderer.invoke('genesis:save', bookId, input),
    saveStep: (
      bookId: string,
      step: GenesisStep,
      data: unknown,
      isDone: boolean
    ): Promise<IpcResult<GenesisStepRecord>> =>
      ipcRenderer.invoke('genesis:save-step', bookId, step, data, isDone)
  },

  /** 万物百科词条 */
  wiki: {
    list: (bookId: string): Promise<IpcResult<WikiEntry[]>> =>
      ipcRenderer.invoke('wiki:list', bookId),
    create: (input: CreateWikiInput): Promise<IpcResult<WikiEntry>> =>
      ipcRenderer.invoke('wiki:create', input),
    update: (id: string, input: UpdateWikiInput): Promise<IpcResult<WikiEntry>> =>
      ipcRenderer.invoke('wiki:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('wiki:remove', id)
  },

  /** AI 接口档案（设置中心） */
  apiProfiles: {
    list: (): Promise<IpcResult<ApiProfile[]>> => ipcRenderer.invoke('api-profiles:list'),
    create: (input: CreateApiProfileInput): Promise<IpcResult<ApiProfile>> =>
      ipcRenderer.invoke('api-profiles:create', input),
    update: (id: string, input: UpdateApiProfileInput): Promise<IpcResult<ApiProfile>> =>
      ipcRenderer.invoke('api-profiles:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('api-profiles:delete', id)
  },

  /** 应用设置（键受主进程白名单约束） */
  settings: {
    get: <T>(key: string, fallback: T): Promise<IpcResult<T>> =>
      ipcRenderer.invoke('settings:get', key, fallback),
    set: (key: string, value: unknown): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('settings:set', key, value)
  },

  /** AI 流式对话：返回 requestId，流事件经 onAiStreamEvent 订阅 */
  ai: {
    chatStream: (req: ChatStreamRequest): Promise<IpcResult<{ requestId: string }>> =>
      ipcRenderer.invoke('ai:chat-stream', req),
    abort: (requestId: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('ai:abort', requestId),
    /** 订阅流事件；返回解绑函数 */
    onStreamEvent: (cb: (evt: AiStreamEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, evt: AiStreamEvent): void => cb(evt)
      ipcRenderer.on('ai:stream:event', listener)
      return () => ipcRenderer.removeListener('ai:stream:event', listener)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
