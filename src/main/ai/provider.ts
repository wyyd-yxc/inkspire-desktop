/**
 * AI Provider 抽象层。
 * 上层（IPC/Agent）只依赖本接口；新增协议 = 新增实现 + 在 REGISTRY 注册，上层零改动
 * （见 architecture.md 第 2 节）。
 */
import type { AiStreamEvent, ChatMessage, ProviderKind } from '../../shared/ai.types'

/** 发起一次流式对话所需的连接信息（由档案解析而来） */
export interface ChatConnection {
  baseUrl: string
  apiKey: string
  model: string
  params: {
    temperature?: number
    maxTokens?: number
    extra?: Record<string, unknown>
  }
}

/** 流事件回调：返回 false 表示消费者要求立即中止（用于上游主动取消） */
export type StreamEventCallback = (event: AiStreamEvent) => void

export interface AiProvider {
  /** 协议标识，与 shared/ai.types.ts 的 ProviderKind 一一对应 */
  readonly kind: ProviderKind
  /**
   * 流式对话。resolve 于流正常结束或被中止（中止不算错误，event 里带 error 消息「已中止」）；
   * 网络层直接失败（DNS/TLS/HTTP 4xx5xx）时 reject。
   */
  chatStream(
    conn: ChatConnection,
    messages: ChatMessage[],
    signal: AbortSignal,
    onEvent: StreamEventCallback,
    requestId: string
  ): Promise<void>
}

/** 协议注册表：kind → 实现 */
const REGISTRY = new Map<ProviderKind, AiProvider>()

export function registerProvider(p: AiProvider): void {
  REGISTRY.set(p.kind, p)
}

export function getProvider(kind: ProviderKind): AiProvider {
  const p = REGISTRY.get(kind)
  if (!p) throw new Error(`未注册的协议类型: ${kind}`)
  return p
}
