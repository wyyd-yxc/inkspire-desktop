/**
 * AI 流式对话 IPC。
 * 设计：invoke 'ai:chat-stream' 立即返回 requestId；后续流事件经 'ai:stream:event'
 * 通道推回渲染进程（携带 requestId 关联）；'ai:abort' 可随时中止。
 * 硬超时（5 分钟）由本层 AbortController 控制，防止半开连接永久挂起。
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { getProvider, registerProvider, type ChatConnection } from '../ai/provider'
import { openAiCompatibleProvider } from '../ai/openaiCompatible'
import { getProfile } from '../db/apiProfiles'
import { wrap } from './wrap'
import type { ChatStreamRequest, ProviderKind } from '../../shared/ai.types'

registerProvider(openAiCompatibleProvider)

/** 进行中的请求：requestId → AbortController */
const active = new Map<string, AbortController>()

const HARD_TIMEOUT_MS = 5 * 60 * 1000

/** 解析结果：连接信息 + 协议类型（分离返回，避免类型断言） */
interface ResolvedChat {
  conn: ChatConnection
  kind: ProviderKind
}

/** 从请求里解析出连接信息（profileId 优先，其次临时 profile） */
function resolveConnection(req: ChatStreamRequest): ResolvedChat {
  let base
  if (req.profileId) {
    const p = getProfile(req.profileId)
    if (!p) throw new Error('指定的档案不存在')
    base = p
  } else if (req.profile) {
    base = req.profile
  } else {
    throw new Error('缺少 AI 档案（profileId 或 profile 至少提供一个）')
  }
  if (!base.baseUrl?.trim()) throw new Error('API 地址为空')
  if (!base.model?.trim()) throw new Error('模型名称为空')
  return {
    conn: {
      baseUrl: base.baseUrl.replace(/\/+$/, ''),
      apiKey: base.apiKey ?? '',
      model: base.model,
      params: base.params ?? {}
    },
    kind: base.providerKind
  }
}

export function registerAiIpc(): void {
  ipcMain.handle(
    'ai:chat-stream',
    (e: IpcMainInvokeEvent, req: ChatStreamRequest) =>
      wrap(async () => {
        const resolved = resolveConnection(req)
        const requestId = randomUUID()
        const controller = new AbortController()
        active.set(requestId, controller)
        const timer = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS)

        // 异步启动流；事件推回发起方
        void (async () => {
          try {
            const provider = getProvider(resolved.kind)
            await provider.chatStream(resolved.conn, req.messages ?? [], controller.signal, (evt) => {
              if (!e.sender.isDestroyed()) e.sender.send('ai:stream:event', evt)
            }, requestId)
          } finally {
            clearTimeout(timer)
            active.delete(requestId)
          }
        })()

        return { requestId }
      })
  )

  ipcMain.handle('ai:abort', (_e, requestId: string) =>
    wrap(() => {
      const controller = active.get(requestId)
      if (!controller) return false
      controller.abort()
      return true
    })
  )
}
