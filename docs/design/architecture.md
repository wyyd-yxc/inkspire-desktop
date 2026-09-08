# 技术架构（Architecture）

> 版本：v1.0 · 日期：2026-08-22 · 本文件描述系统如何构建：进程模型、数据模型、AI 接口、IPC 契约。架构变更必须先改本文件再改代码。

## 1. 进程模型（Electron）

```
┌─────────────────────────── 渲染进程（Vue 3） ───────────────────────────┐
│ views/ components/ stores(Pinia) services/                              │
│         │ 只通过 window.api.* 调用                                       │
└─────────┼───────────────────────────────────────────────────────────────┘
          │ contextBridge（src/preload，白名单通道）
┌─────────▼─────────────────────────── 主进程（Node） ─────────────────────┐
│ ipc/   IPC handler：settings / books / chapters / wiki / ai / ...        │
│ db/    better-sqlite3：打开 userData/inkspire.sqlite，各表 DAO           │
│ ai/    Provider 抽象 + OpenAI 兼容实现（SSE 流式，AbortController 中断）  │
└──────────────────────────────────────────────────────────────────────────┘
```

- 渲染进程**永不**直接接触 fs/网络/SQLite；密钥只存在主进程侧数据库。
- IPC 一律请求-响应风格：`{ ok: true, data } | { ok: false, error: string }`；流式 AI 用事件回推（`ai:chunk` / `ai:done` / `ai:error`，携带 requestId 关联）。
- 所有通道名与负载类型定义在 `src/shared/`，两侧共享。

## 2. AI Provider 抽象（扩展点核心）

```ts
interface AiProvider {
  id: string;                 // 'openai-compatible' | 未来 'anthropic' | 'ollama' ...
  listModels(profile): Promise<string[]>;
  chatStream(req, signal, onChunk): Promise<ChatResult>;
}
```

- **API 档案（ApiProfile）**：`{ id, name, providerId, baseUrl, apiKey, model, params{temperature, max_tokens,...} }`，存 SQLite `api_profiles` 表，可建多套（如「OpenRouter-便宜速写」「官方-精修」）。
- **绑定（ModelBinding）**：每个功能槽位（如 `book.genesis`、`chapter.draft`、`text.polish`、`assistant.chat`）可绑定一个档案 id，未绑定则回落默认档案。
- 首个实现 `openai-compatible`：`POST {baseUrl}/chat/completions`，SSE 解析，兼容 OpenAI / OpenRouter / DeepSeek / 本地 Ollama 的 OpenAI 网关等。
- 未来新增协议 = 新增一个 Provider 实现 + 注册，UI 与上层零改动。

## 3. 数据模型（SQLite，初版）

| 表 | 关键字段 | 说明 |
|---|---|---|
| `settings` | key, value(json) | 应用设置（默认档案 id、主题等） |
| `api_profiles` | id, name, provider_id, base_url, api_key, model, params, created_at | AI 接口档案 |
| `books` | id, title, genre, description, cover, status, created_at, updated_at | 书籍 |
| `genesis_steps` | book_id, step(1-5), data(json), is_done | 创世台五步状态 |
| `chapters` | id, book_id, title, summary, sort_order, content, word_count, status, updated_at | 章节 |
| `scenes` | id, chapter_id, node_id, title, mode, data(json), sort_order | 章节画布场景 |
| `wiki_entries` | id, book_id, type(character/location/faction/item/rule), name, content, linked_ids(json) | 万物百科 |
| `memories` | id, book_id, kind(state/progress/foreshadow), content, chapter_no, is_resolved | 作品记忆 |
| `inspirations` | id, book_id, kind, content, ref_type, ref_id, is_recycled | 灵感墙 |
| `style_profiles` | id, book_id?, name, prompt_data(json), source_type | 风格包 |
| `agent_bindings` | slot, profile_id | 功能槽位→档案绑定 |

约定：主键用 TEXT（randomUUID）；时间戳 ISO 字符串；JSON 字段统一 `data`/`value` 命名。表结构演进用版本号迁移（`schema_migrations` 表，只增不改）。

## 4. 前端结构与路由（初版）

```
/                 → 书斋（书籍列表）
/settings         → 设置中心（API 档案/模型偏好/通用）
/book/:id/genesis → 创世台（五步向导）
/book/:id/write   → 正文工作台（左章节树 + 中编辑器 + 右侧栏）
/book/:id/wiki    → 万物百科
/book/:bookId/canvas/:chapterId → 章节画布
/book/:bookId/plot              → 剧情画布
/book/:bookId/inspirations      → 灵感墙（M11 追加；模块现名：书房/构思台/设定集/叙事档案/情节大纲/场景规划——M10.8 重命名，上表保留初版名）
```

主题：`styles/theme.css` 定义 CSS 变量（浅紫罗兰风：淡紫背景 #f5f3fa、罗兰紫主色 #6c5ce7、白色圆角卡片、柔和阴影，依据 refs/ 官网截图校准）；预留 `[data-theme=dark]`。

## 5. 构建与发布

- 开发：`npm run dev`（electron-vite）；构建：`npm run build`；打包：`npm run dist`（electron-builder → NSIS `.exe`）。
- 原生模块 better-sqlite3 需与 Electron ABI 匹配：脚手架阶段配 `electron-rebuild`。
- 数据目录：`app.getPath('userData')`，与安装目录解耦，升级不丢数据。

## 6. 已知设计取舍

- 选 JSON 字段而非更多关系表：设定类数据形态多变，灵活优先；检索需求高的（百科/记忆）后续可加 FTS5 全文索引。
- 流式回推而非 webContents.send 轮询：低延迟且天然支持取消。
- 单 SQLite 文件而非分文件：备份=复制一个文件，对小白最友好。
