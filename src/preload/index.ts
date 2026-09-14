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
  ChapterMeta,
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
import type {
  CreateSceneInput,
  Scene,
  UpdateSceneInput
} from '../shared/canvas.types'
import type {
  CreateSceneEdgeInput,
  SceneEdge,
  UpdateSceneEdgeInput
} from '../shared/canvas.types'
import type {
  CreatePlotEdgeInput,
  CreatePlotEventInput,
  PlotEdge,
  PlotEvent,
  UpdatePlotEdgeInput,
  UpdatePlotEventInput
} from '../shared/plot.types'
import type {
  CreateMemoryInput,
  Memory,
  UpdateMemoryInput
} from '../shared/memory.types'
import type { AssistantMessage, AssistantRole } from '../shared/assistant.types'
import type {
  CreateStyleProfileInput,
  StyleProfile,
  UpdateStyleProfileInput
} from '../shared/style.types'
import type { WordSnapshot } from '../shared/stats.types'
import type { DigestPickResult } from '../shared/digest.types'
import type { AgentBinding, AgentSlot } from '../shared/agent.types'
import type {
  CreateInspirationInput,
  Inspiration,
  UpdateInspirationInput
} from '../shared/inspiration.types'

const api = {
  /** IPC 通路自检：正常返回 { ok: true, data: 'pong' } */
  ping: (): Promise<IpcResult<string>> => ipcRenderer.invoke('app:ping'),

  /** 书籍管理（书房） */
  books: {
    list: (): Promise<IpcResult<Book[]>> => ipcRenderer.invoke('books:list'),
    create: (input: CreateBookInput): Promise<IpcResult<Book>> =>
      ipcRenderer.invoke('books:create', input),
    update: (id: string, input: UpdateBookInput): Promise<IpcResult<Book>> =>
      ipcRenderer.invoke('books:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('books:delete', id),
    /** 选择并上传封面（主进程弹文件对话框，落盘 userData/covers/），返回更新后的书 */
    setCover: (id: string): Promise<IpcResult<Book>> =>
      ipcRenderer.invoke('books:set-cover', id),
    /** 移除自定义封面（回落渐变占位；物理文件保留） */
    removeCover: (id: string): Promise<IpcResult<Book>> =>
      ipcRenderer.invoke('books:remove-cover', id),
    /** 读封面文件为 data URL（合 CSP img-src data:） */
    readCover: (filename: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('books:read-cover', filename)
  },

  /** 章节管理（写作台） */
  chapters: {
    list: (bookId: string): Promise<IpcResult<Chapter[]>> =>
      ipcRenderer.invoke('chapters:list', bookId),
    listMeta: (bookId: string): Promise<IpcResult<ChapterMeta[]>> =>
      ipcRenderer.invoke('chapters:list-meta', bookId),
    get: (id: string): Promise<IpcResult<Chapter>> => ipcRenderer.invoke('chapters:get', id),
    create: (input: CreateChapterInput): Promise<IpcResult<Chapter>> =>
      ipcRenderer.invoke('chapters:create', input),
    update: (id: string, input: UpdateChapterInput): Promise<IpcResult<Chapter>> =>
      ipcRenderer.invoke('chapters:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('chapters:delete', id),
    move: (id: string, dir: -1 | 1): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('chapters:move', id, dir)
  },

  /** 联动同步（M10.5）：抽取水位原子合并（主进程内读改写，防并发丢更新） */
  sync: {
    mergeWatermark: (key: string, chapterId: string, wordCount: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('sync:watermark-merge', key, chapterId, wordCount)
  },

  /** 构思台五步设定 */
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

  /** 设定集词条 */
  wiki: {
    list: (bookId: string): Promise<IpcResult<WikiEntry[]>> =>
      ipcRenderer.invoke('wiki:list', bookId),
    checkDup: (
      bookId: string,
      name: string,
      type: string,
      excludeId?: string
    ): Promise<IpcResult<{ duplicate: boolean; matchedName: string }>> =>
      ipcRenderer.invoke('wiki:check-dup', bookId, name, type, excludeId),
    create: (input: CreateWikiInput): Promise<IpcResult<WikiEntry>> =>
      ipcRenderer.invoke('wiki:create', input),
    update: (id: string, input: UpdateWikiInput): Promise<IpcResult<WikiEntry>> =>
      ipcRenderer.invoke('wiki:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('wiki:remove', id)
  },

  /** 场景规划场景 */
  scenes: {
    list: (chapterId: string): Promise<IpcResult<Scene[]>> =>
      ipcRenderer.invoke('scenes:list', chapterId),
    get: (id: string): Promise<IpcResult<Scene | null>> =>
      ipcRenderer.invoke('scenes:get', id),
    create: (input: CreateSceneInput): Promise<IpcResult<Scene>> =>
      ipcRenderer.invoke('scenes:create', input),
    update: (id: string, input: UpdateSceneInput): Promise<IpcResult<Scene>> =>
      ipcRenderer.invoke('scenes:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('scenes:remove', id),
    reorder: (chapterId: string, orderedIds: string[]): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('scenes:reorder', chapterId, orderedIds)
  },

  /** 场景规划场景连线 */
  sceneEdges: {
    list: (chapterId: string): Promise<IpcResult<SceneEdge[]>> =>
      ipcRenderer.invoke('scene-edges:list', chapterId),
    create: (input: CreateSceneEdgeInput): Promise<IpcResult<SceneEdge>> =>
      ipcRenderer.invoke('scene-edges:create', input),
    update: (id: string, input: UpdateSceneEdgeInput): Promise<IpcResult<SceneEdge>> =>
      ipcRenderer.invoke('scene-edges:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('scene-edges:remove', id)
  },

  /** 情节大纲事件连线 */
  plotEdges: {
    list: (bookId: string): Promise<IpcResult<PlotEdge[]>> =>
      ipcRenderer.invoke('plot-edges:list', bookId),
    create: (input: CreatePlotEdgeInput): Promise<IpcResult<PlotEdge>> =>
      ipcRenderer.invoke('plot-edges:create', input),
    update: (id: string, input: UpdatePlotEdgeInput): Promise<IpcResult<PlotEdge>> =>
      ipcRenderer.invoke('plot-edges:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('plot-edges:remove', id)
  },

  /** 情节大纲事件 */
  plot: {
    list: (bookId: string, parentId?: string): Promise<IpcResult<PlotEvent[]>> =>
      ipcRenderer.invoke('plot:list', bookId, parentId),
    create: (input: CreatePlotEventInput): Promise<IpcResult<PlotEvent>> =>
      ipcRenderer.invoke('plot:create', input),
    update: (id: string, input: UpdatePlotEventInput): Promise<IpcResult<PlotEvent>> =>
      ipcRenderer.invoke('plot:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('plot:remove', id)
  },

  /** 灵感墙便签（五类，含回收站） */
  inspirations: {
    list: (bookId: string): Promise<IpcResult<Inspiration[]>> =>
      ipcRenderer.invoke('inspirations:list', bookId),
    create: (input: CreateInspirationInput): Promise<IpcResult<Inspiration>> =>
      ipcRenderer.invoke('inspirations:create', input),
    update: (id: string, input: UpdateInspirationInput): Promise<IpcResult<Inspiration>> =>
      ipcRenderer.invoke('inspirations:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('inspirations:remove', id),
    /** 清空回收站（主进程单条 SQL 原子删除），返回删除数 */
    clearRecycled: (bookId: string): Promise<IpcResult<number>> =>
      ipcRenderer.invoke('inspirations:clear-recycled', bookId)
  },

  /** 叙事档案（事实层） */
  memories: {
    list: (bookId: string): Promise<IpcResult<Memory[]>> =>
      ipcRenderer.invoke('memories:list', bookId),
    create: (input: CreateMemoryInput): Promise<IpcResult<Memory>> =>
      ipcRenderer.invoke('memories:create', input),
    update: (id: string, input: UpdateMemoryInput): Promise<IpcResult<Memory>> =>
      ipcRenderer.invoke('memories:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('memories:remove', id)
  },

  /** 写作助手对话历史 */
  assistant: {
    list: (bookId: string): Promise<IpcResult<AssistantMessage[]>> =>
      ipcRenderer.invoke('assistant:list', bookId),
    create: (
      bookId: string,
      role: AssistantRole,
      content: string
    ): Promise<IpcResult<AssistantMessage>> =>
      ipcRenderer.invoke('assistant:create', bookId, role, content),
    clear: (bookId: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('assistant:clear', bookId)
  },

  /** AI 接口档案（设置） */
  apiProfiles: {
    list: (): Promise<IpcResult<ApiProfile[]>> => ipcRenderer.invoke('api-profiles:list'),
    create: (input: CreateApiProfileInput): Promise<IpcResult<ApiProfile>> =>
      ipcRenderer.invoke('api-profiles:create', input),
    update: (id: string, input: UpdateApiProfileInput): Promise<IpcResult<ApiProfile>> =>
      ipcRenderer.invoke('api-profiles:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('api-profiles:delete', id)
  },

  /** 作品风格包（全局用户库；预设 5 包不在此列） */
  styles: {
    list: (): Promise<IpcResult<StyleProfile[]>> => ipcRenderer.invoke('styles:list'),
    create: (input: CreateStyleProfileInput): Promise<IpcResult<StyleProfile>> =>
      ipcRenderer.invoke('styles:create', input),
    update: (id: string, input: UpdateStyleProfileInput): Promise<IpcResult<StyleProfile>> =>
      ipcRenderer.invoke('styles:update', id, input),
    remove: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('styles:remove', id)
  },

  /** 创作统计（快照由主进程内嵌记录，本组只读） */
  stats: {
    list: (bookId: string): Promise<IpcResult<WordSnapshot[]>> =>
      ipcRenderer.invoke('stats:list', bookId)
  },

  /** 拆书（M14）：选参考 txt 并读取（只读；文本仅内存传递，不落库不持久）。取消返回 null */
  digest: {
    pickText: (): Promise<IpcResult<DigestPickResult | null>> =>
      ipcRenderer.invoke('digest:pick-text')
  },

  /** Agent 槽位绑定（M15）：功能槽位→API 档案；未列槽位=跟随默认 */
  bindings: {
    list: (): Promise<IpcResult<AgentBinding[]>> => ipcRenderer.invoke('bindings:list'),
    /** profileId 传空串=解除绑定（回落默认档案） */
    set: (slot: AgentSlot, profileId: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('bindings:set', slot, profileId)
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

// 主题注入（M17 灭 FOUC）：主进程经 additionalArguments 传入（启动时已读库），
// 渲染层 main.ts 在挂载前同步读取并挂 data-theme，避免「用户设深色但系统浅色」的首帧闪白。
const themeArg = process.argv.find((a) => a.startsWith('--inkspire-theme='))
if (themeArg) {
  contextBridge.exposeInMainWorld('__inkspire_theme__', themeArg.split('=')[1] ?? 'light')
}
