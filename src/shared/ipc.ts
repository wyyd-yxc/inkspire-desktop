/**
 * 进程间共享类型（IPC 契约）。
 * 主进程与渲染进程共同引用，防止两侧接口漂移（规范见 docs/standards/coding-standards.md 第 5 节）。
 */

/** 所有 IPC 请求的统一响应结构 */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }
