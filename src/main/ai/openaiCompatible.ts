/**
 * OpenAI 兼容协议实现（chat/completions + SSE 流式）。
 * 适用于：OpenAI / OpenRouter / DeepSeek / 智谱 / 各类中转站 / Ollama 的 OpenAI 网关。
 * 兼容 deepseek 系推理模型的 reasoning_content 增量（作为 reasoning 事件透传）。
 * 内置 429/502/503/504 自动重试（指数退避 + Retry-After），上层零感知。
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

/** 可重试的 HTTP 状态码（限流与服务过载） */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 2000

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
    const bodyStr = JSON.stringify(body)

    // 重试循环：仅对 429/502/503/504 在首包前重试，指数退避（2s→4s→8s），尊重 Retry-After
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res: Response
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${conn.apiKey}`
          },
          body: bodyStr,
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

      if (res.ok && res.body) {
        emit({ requestId, type: 'start' })
        await this.consumeSse(res, emit, requestId, startedAt, () => {
          if (!firstTokenAt) firstTokenAt = Date.now()
        })
        emit({
          requestId,
          type: 'done',
          firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : 0,
          totalMs: Date.now() - startedAt
        })
        return
      }

      // 可重试状态码且还有重试机会且未被中止 → 退避后重试
      const isRetryable = RETRYABLE_STATUS.has(res.status)
      const hasRetriesLeft = attempt < MAX_RETRIES
      if (isRetryable && hasRetriesLeft && !signal.aborted) {
        // 优先服务端 Retry-After 头（秒），否则指数退避
        const retryAfter = res.headers.get('retry-after')
        const waitMs = retryAfter
          ? (parseInt(retryAfter, 10) || 1) * 1000
          : BASE_BACKOFF_MS * 2 ** attempt
        const waitSec = Math.round(waitMs / 1000)
        emit({
          requestId,
          type: 'reasoning',
          text: `\n⏳ 上游限流（HTTP ${res.status}），${waitSec} 秒后自动重试（第 ${attempt + 1}/${MAX_RETRIES} 次）…\n`
        })
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, waitMs)
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(new DOMException('Aborted', 'AbortError'))
            },
            { once: true }
          )
        })
        continue
      }

      // 不可重试（4xx 客户端错误等）或重试耗尽或已中止 → 报错终结
      emit({ requestId, type: 'error', message: await readHttpError(res) })
      return
    }
  }

  /** 解析 SSE 流并分发事件（提取为方法便于重试循环复用） */
  private async consumeSse(
    res: Response,
    emit: (e: AiStreamEvent) => void,
    requestId: string,
    startedAt: number,
    onFirstToken: () => void
  ): Promise<void> {
    if (!res.body) {
      emit({ requestId, type: 'error', message: '服务端未返回数据流' })
      return
    }

    emit({ requestId, type: 'start' })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') return
          let chunk: OpenAiSseChunk
          try {
            chunk = JSON.parse(payload) as OpenAiSseChunk
          } catch {
            continue
          }
          if (chunk.error?.message) {
            emit({ requestId, type: 'error', message: chunk.error.message })
            return
          }
          const delta = chunk.choices?.[0]?.delta
          if (delta?.reasoning_content) {
            onFirstToken()
            emit({ requestId, type: 'reasoning', text: delta.reasoning_content })
          }
          if (delta?.content) {
            onFirstToken()
            emit({ requestId, type: 'chunk', text: delta.content })
          }
        }
      }
      // 流自然关闭但没有 [DONE]：视为正常结束
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '已中止'
          : `数据流中断（${err instanceof Error ? err.message : String(err)}）`
      emit({ requestId, type: 'error', message: msg })
    }
  }
}

export const openAiCompatibleProvider = new OpenAiCompatibleProvider()
