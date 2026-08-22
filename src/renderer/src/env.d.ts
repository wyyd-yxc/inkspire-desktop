/**
 * 渲染层环境类型补充声明：
 * - *.vue 单文件组件模块（tsc 不认识 .vue，需手动声明）
 * - Vite 客户端类型（import.meta.env 等）
 */
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>
  export default component
}
