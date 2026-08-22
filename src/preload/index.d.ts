/**
 * window.api 的类型声明（由 preload 导出的 Api 结构，见 src/preload/index.ts）。
 * 渲染进程通过此声明获得 window.api 的类型提示。
 */
import type { Api } from '../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export {}
