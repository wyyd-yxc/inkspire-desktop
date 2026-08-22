/**
 * 渲染层 AI 服务：封装流式对话的订阅/中止管理。
 * 订阅采用「先注册+队列缓冲，后按 requestId 过滤回放」的方式，消除
 * 「invoke 返回 requestId 之前事件已到达」的时序竞态。
 * 浏览器调试模式（无 window.api）抛出明确错误——AI 功能必须在 Electron 内使用。
 */
import type {
  AiStreamEvent,
  ApiProfile,
  ChatMessage
} from '../../../shared/ai.types'
import { isElectron } from './books'

export interface StreamHandlers {
  onStart?: () => void
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onDone?: (info: { firstTokenMs: number; totalMs: number }) => void
  onError?: (message: string) => void
}

export interface StreamSession {
  requestId: string
  abort: () => void
}

/** 单个事件的分发（按类型回调） */
function dispatch(evt: AiStreamEvent, handlers: StreamHandlers): boolean {
  // 返回是否为终结事件（done/error），终结后调用方应解绑
  switch (evt.type) {
    case 'start':
      handlers.onStart?.()
      return false
    case 'chunk':
      handlers.onChunk?.(evt.text)
      return false
    case 'reasoning':
      handlers.onReasoning?.(evt.text)
      return false
    case 'done':
      handlers.onDone?.({ firstTokenMs: evt.firstTokenMs, totalMs: evt.totalMs })
      return true
    case 'error':
      handlers.onError?.(evt.message)
      return true
  }
}

/**
 * 发起一次流式对话。
 * @param profile 用哪套档案（或临时档案对象，id 为空表示未保存的临时档案）
 * @param messages 消息列表
 * @param handlers 事件回调
 * @returns 会话（含 requestId 与主动中止函数）
 */
export async function chatStream(
  profile: Pick<ApiProfile, 'id' | 'name' | 'providerKind' | 'baseUrl' | 'apiKey' | 'model' | 'params'>,
  messages: ChatMessage[],
  handlers: StreamHandlers
): Promise<StreamSession> {
  if (!isElectron) throw new Error('AI 功能仅支持在应用内使用')

  // 1) 先订阅并缓冲全部事件（此刻 requestId 未知，全部入队）
  const buffer: AiStreamEvent[] = []
  let bindRequestId = ''
  const unsub = window.api.ai.onStreamEvent((evt) => {
    if (!bindRequestId) {
      buffer.push(evt)
      return
    }
    if (evt.requestId === bindRequestId) dispatch(evt, handlers)
  })

  try {
    // 2) 发起请求拿到 requestId
    const res = await window.api.ai.chatStream(
      profile.id ? { profileId: profile.id, messages } : { profile, messages }
    )
    if (!res.ok) throw new Error(res.error)
    bindRequestId = res.data.requestId

    // 3) 回放缓冲期间到达的本请求事件（单线程下不会与后续事件交错）
    for (let i = 0; i < buffer.length; i++) {
      const evt = buffer[i]
      if (evt.requestId !== bindRequestId) continue
      if (dispatch(evt, handlers)) {
        buffer.length = 0
        unsub()
        break
      }
    }
    buffer.length = 0

    return {
      requestId: bindRequestId,
      abort: () => {
        void window.api.ai.abort(bindRequestId)
      }
    }
  } catch (err) {
    unsub()
    throw err
  }
}
