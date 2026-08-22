# 代码与注释规范（Coding Standards）

> 本规范约束本项目全部源代码。目标：任何模型/任何人接手时，能靠代码本身+注释理解意图。
> 版本：v1.0 · 制定日期：2026-08-22

## 1. 技术栈约定（非必要不更换）

- 框架：Electron + Vue 3（`<script setup lang="ts">` 组合式 API）+ TypeScript
- 状态：Pinia；路由：Vue Router 4
- 样式：Tailwind CSS + `src/renderer/src/styles/theme.css` 中的 CSS 变量主题
- 编辑器：TipTap；节点画布：Vue Flow；数据库：better-sqlite3（仅主进程）
- 严禁在渲染进程直接 `require` Node 模块或访问 SQLite——一切经由 preload 暴露的 IPC 通道。

## 2. 目录职责

| 目录 | 职责 | 禁止事项 |
|---|---|---|
| `src/main/` | 主进程：数据库 DAO、AI Provider、文件操作、IPC handler | 不写 UI 逻辑 |
| `src/preload/` | contextBridge 白名单桥接 | 不暴露 `ipcRenderer` 原始对象 |
| `src/renderer/src/` | Vue 界面与前端状态 | 不发未在 shared 声明的 IPC 通道 |
| `src/shared/` | 进程共享类型（IPC 请求/响应契约、数据实体） | 不含任何运行时逻辑 |

## 3. 命名规范

- 文件：组件 `PascalCase.vue`；TS 模块 `camelCase.ts`；类型定义文件 `*.types.ts`
- 变量/函数：`camelCase`；类型/接口/组件：`PascalCase`；常量：`SCREAMING_SNAKE_CASE`
- 数据库表/字段：`snake_case`（如 `wiki_entries.created_at`）
- IPC 通道名：`domain:action` 格式，如 `books:list`、`ai:generate-stream`、`settings:get`
- 布尔变量/字段以 `is/has/can` 开头，如 `is_streaming`、`has_cover`

## 4. 注释规范（核心）

注释写给「下一个接手的模型/人」看，解释**为什么**，而不是复述代码在做什么。

1. **每个文件顶部**：块注释说明该文件职责（一两句）。
   ```ts
   /**
    * 书籍表的增删改查 DAO。
    * 数据落盘于应用 userData 目录下的 inkspire.sqlite。
    */
   ```
2. **每个导出函数/组件**：JSDoc 风格，写清用途、参数、返回值、副作用（如有）。
3. **行内注释**：只在逻辑不直观、踩过坑、有业务约束处写。禁止"i++ // i 加一"这类噪音注释。
4. **坑位注释**：修复 bug 时，在修复处用 `// FIXME(bug简述): 已于 YYYY-MM-DD 修复，原因是...` 登记，验收通过两个里程碑后可清理。
5. **TODO 约定**：`// TODO(M<里程碑>): 描述`，必须挂到某个里程碑，禁止无主 TODO。
6. **中文注释**：注释一律中文（用户为中文使用者，便于其阅读）；标识符英文。

## 5. TypeScript 规则

- 严格模式 `strict: true`；禁止 `any`（确需绕过用 `unknown` + 收窄，或注明原因的 `as`）
- 跨进程数据结构一律先在 `src/shared/` 定义类型，两侧共用，防契约漂移
- 数据库行类型与 API 返回类型分开定义，DAO 层做映射

## 6. Vue 组件规则

- 单文件组件顺序：`<script setup>` → `<template>` → `<style scoped>`
- 组件拆分粒度：一个文件不超过 400 行；超过就拆子组件/composable
- 逻辑复用优先 composable（`use*.ts`），不用 mixin
- 用户可见文案全部中文，与原站（墨灵）用语保持一致（如「书斋」「创世台」）

## 7. 错误处理

- 主进程所有 IPC handler 必须 try/catch，错误以 `{ ok: false, error: message }` 结构返回渲染层，禁止静默吞错
- 渲染层统一用 toast/对话框呈现错误，不允许只 console.log
- AI 流式请求必须支持中断（AbortController），中断不算错误

## 8. 依赖管理

- 新增依赖前在 worklog 登记：包名、用途、备选方案；生产依赖从严，开发依赖从宽
- 锁定 `package-lock.json` 入库；禁止使用已弃用/无维护的包

## 9. 禁止清单

- 禁止提交 API Key、密码、`.env` 到 git
- 禁止绕过 preload 直接开 `nodeIntegration` / `contextIsolation: false`
- 禁止在渲染进程发网络请求到用户配置的 API（统一走主进程，避免 CORS 与密钥泄露到页面）
- 禁止删除或改写 `docs/` 下历史文档内容（只追加）
