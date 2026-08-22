/**
 * 渲染层 AI 服务：封装流式对话的订阅/中止管理。
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

/**
 * 发起一次流式对话。
 * @param profile 用哪套档案（或临时档案对象）
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

  const res = await window.api.ai.chatStream(
    profile.id ? { profileId: profile.id, messages } : { profile, messages }
  )
  if (!res.ok) throw new Error(res.error)

  const { requestId } = res.data
  const unsub = window.api.ai.onStreamEvent((evt: AiStreamEvent) => {
    if (evt.requestId !== requestId) return
    switch (evt.type) {
      case 'start':
        handlers.onStart?.()
        break
      case 'chunk':
        handlers.onChunk?.(evt.text)
        break
      case 'reasoning':
        handlers.onReasoning?.(evt.text)
        break
      case 'done':
        handlers.onDone?.({ firstTokenMs: evt.firstTokenMs, totalMs: evt.totalMs })
        unsub()
        break
      case 'error':
        handlers.onError?.(evt.message)
        unsub()
        break
    }
  })

  return {
    requestId,
    abort: () => {
      void window.api.ai.abort(requestId)
    }
  }
}
