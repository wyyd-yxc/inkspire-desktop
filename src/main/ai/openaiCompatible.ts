/**
 * OpenAI 兼容协议实现（chat/completions + SSE 流式）。
 * 适用于：OpenAI / OpenRouter / DeepSeek / 智谱 / 各类中转站 / Ollama 的 OpenAI 网关。
 * 兼容 deepseek 系推理模型的 reasoning_content 增量（作为 reasoning 事件透传）。
 */
import type { AiStreamEvent, ChatMessage } from '../../shared/ai.types'
import type { AiProvider, ChatConnection, StreamEventCallback } from './provider'

interface OpenAiSseChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

/** 从 HTTP 错误响应提取可读信息（绝不回显 Authorization 头/密钥） */
async function readHttpError(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = (await res.text()).slice(0, 400)
    try {
      const j = JSON.parse(body) as { error?: { message?: string }; message?: string }
      detail = j.error?.message ?? j.message ?? body
    } catch {
      detail = body
    }
  } catch {
    detail = ''
  }
  return `HTTP ${res.status}${detail ? `：${detail}` : ''}`
}

class OpenAiCompatibleProvider implements AiProvider {
  readonly kind = 'openai-compatible' as const

  async chatStream(
    conn: ChatConnection,
    messages: ChatMessage[],
    signal: AbortSignal,
    onEvent: StreamEventCallback,
    requestId: string
  ): Promise<void> {
    const url = `${conn.baseUrl}/chat/completions`
    const startedAt = Date.now()
    let firstTokenAt = 0

    const emit = (e: AiStreamEvent): void => onEvent(e)

    // 组装请求体：params.extra 允许高级用户覆写任意顶层字段
    const body: Record<string, unknown> = {
      model: conn.model,
      messages,
      stream: true,
      ...(conn.params.temperature !== undefined
        ? { temperature: conn.params.temperature }
        : {}),
      ...(conn.params.maxTokens !== undefined ? { max_tokens: conn.params.maxTokens } : {}),
      ...(conn.params.extra ?? {})
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${conn.apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '已中止'
          : `无法连接 ${conn.baseUrl}（${err instanceof Error ? err.message : String(err)}）`
      emit({ requestId, type: 'error', message: msg })
      return
    }

    if (!res.ok) {
      emit({ requestId, type: 'error', message: await readHttpError(res) })
      return
    }
    if (!res.body) {
      emit({ requestId, type: 'error', message: '服务端未返回数据流' })
      return
    }

    emit({ requestId, type: 'start' })

    // 逐行解析 SSE
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE 事件以空行分隔；每行形如 "data: {...}"
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') {
            emit({
              requestId,
              type: 'done',
              firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : 0,
              totalMs: Date.now() - startedAt
            })
            return
          }
          let chunk: OpenAiSseChunk
          try {
            chunk = JSON.parse(payload) as OpenAiSseChunk
          } catch {
            continue // 忽略无法解析的行（部分服务会夹注释行）
          }
          if (chunk.error?.message) {
            emit({ requestId, type: 'error', message: chunk.error.message })
            return
          }
          const delta = chunk.choices?.[0]?.delta
          if (delta?.reasoning_content) {
            if (!firstTokenAt) firstTokenAt = Date.now()
            emit({ requestId, type: 'reasoning', text: delta.reasoning_content })
          }
          if (delta?.content) {
            if (!firstTokenAt) firstTokenAt = Date.now()
            emit({ requestId, type: 'chunk', text: delta.content })
          }
        }
      }
      // 流自然关闭但没有 [DONE]：视为正常结束
      emit({
        requestId,
        type: 'done',
        firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : 0,
        totalMs: Date.now() - startedAt
      })
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '已中止'
          : `数据流中断（${err instanceof Error ? err.message : String(err)}）`
      emit({ requestId, type: 'error', message: msg })
    }
  }
}

/** 单例注册（import 本模块即完成注册） */
export const openAiCompatibleProvider = new OpenAiCompatibleProvider()
