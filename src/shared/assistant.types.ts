/**
 * 写作助手共享类型：对话消息（按书单会话，持久化）。
 */

/** 消息角色 */
export type AssistantRole = 'user' | 'assistant'

/** 助手消息实体（API 返回形态） */
export interface AssistantMessage {
  id: string
  bookId: string
  role: AssistantRole
  content: string
  createdAt: string
}

export interface CreateAssistantMessageInput {
  bookId: string
  role: AssistantRole
  content: string
}
