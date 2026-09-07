/**
 * AI 相关共享类型：接口档案、对话消息、流式请求与事件。
 * 依据 architecture.md 第 2 节（Provider 抽象）定义。
 */

/** 协议种类：openai-compatible 首期实现；后续可加 anthropic 原生 / ollama 等 */
export type ProviderKind = 'openai-compatible'

/** API 档案：一套完整的「协议+地址+密钥+模型+参数」组合，可建多套 */
export interface ApiProfile {
  id: string
  name: string
  providerKind: ProviderKind
  /** API 根地址，如 https://open.bigmodel.cn/api/paas/v4 或 https://tokenrhythm.studio/v1 */
  baseUrl: string
  /** 密钥。仅存于本机 SQLite，任何情况下不进 git/日志 */
  apiKey: string
  /** 模型名，如 glm-4.7 / deepseek-v4-flash */
  model: string
  /** 生成参数（JSON 自由字段，当前含 temperature / maxTokens 等） */
  params: AiParams
  createdAt: string
  updatedAt: string
}

/** 生成参数（全部可选，未给走服务端默认） */
export interface AiParams {
  temperature?: number
  maxTokens?: number
  /** 额外的请求体字段（自由 JSON，供高级用户覆写） */
  extra?: Record<string, unknown>
}

export interface CreateApiProfileInput {
  name: string
  providerKind: ProviderKind
  baseUrl: string
  apiKey: string
  model: string
  params?: AiParams
}

export interface UpdateApiProfileInput {
  name?: string
  providerKind?: ProviderKind
  baseUrl?: string
  apiKey?: string
  model?: string
  params?: AiParams
}

/** 对话消息（OpenAI 风格 role） */
export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** 一次流式对话请求 */
export interface ChatStreamRequest {
  /** 直接用某档案发起（应用内常规路径） */
  profileId?: string
  /** 或用临时档案数据发起（设置「测试连接」用，尚未保存也能测） */
  profile?: Omit<ApiProfile, 'id' | 'createdAt' | 'updatedAt'>
  messages: ChatMessage[]
}

/** 主进程 → 渲染进程的流事件（经 ai:stream:event 通道推回） */
export type AiStreamEvent =
  | { requestId: string; type: 'start' } // 已发出请求
  | { requestId: string; type: 'chunk'; text: string } // 正文增量
  | {
      requestId: string
      type: 'reasoning'
      text: string
    } // 思考链增量（deepseek 等推理模型）
  | { requestId: string; type: 'done'; firstTokenMs: number; totalMs: number } // 正常结束（含耗时）
  | { requestId: string; type: 'error'; message: string } // 失败/中断
