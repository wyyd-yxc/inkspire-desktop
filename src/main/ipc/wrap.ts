/**
 * IPC handler 的通用包装：把返回值/异常统一包成 IpcResult 结构，
 * 保证渲染层拿到的永远是 { ok: true, data } 或 { ok: false, error }（规范：coding-standards 第 7 节）。
 */
import type { IpcResult } from '../../shared/ipc'

/** 包装同步/异步 handler 逻辑，异常转成可读错误信息 */
export async function wrap<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
