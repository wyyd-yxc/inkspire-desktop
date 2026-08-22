# 验收报告：正文工作台（M3）

- 日期：2026-08-22 / 验收人：GLM-5.3（ZCode 独立黑盒验收子代理）
- 结论：**有条件通过**——核心链路（章节 CRUD、万字编辑、自动保存、持久化、级联删除）全部实测通过，无阻断级问题；存在 1 个一般级缺陷（重命名自动聚焦抛未捕获异常）需修复后再交用户确认。

## 验收方法

黑盒实测为主：`npm run dev -- --remote-debugging-port=9222` 启动真实 Electron，经 CDP（原生 WebSocket）以**真实输入事件**（Input.dispatchMouseEvent 点击、Input.insertText 输入、键盘事件 Ctrl+S/Enter/End）驱动应用走用户路径，配合 SQLite 只读直查核对落库；辅以 M3 涉及代码的规范抽查与 typecheck 双跑。测试数据自建自清（书名「复验-M3工作台」）。

## 验收点逐项核对

| # | 验收点 | 结果 | 备注 |
|---|---|---|---|
| 1 | 新建章节自动命名「第 N 章」 | 通过 | 连续 4 章序号正确；删空全部章节后再建回到「第 1 章」 |
| 2 | 章节选中切换 | 通过 | 切换后编辑器标题/正文/状态栏同步 |
| 3 | 行内重命名（侧栏） | 通过 | Enter/失焦提交、列表与编辑器标题同步、改名即时落库 |
| 4 | 标题栏行内编辑（编辑器内） | 通过 | 真实 focus→Ctrl+A→输入→blur 路径验证 |
| 5 | 上移/下移 | 通过 | 相邻交换序号正确；首行上移/末行下移按钮禁用 |
| 6 | 删除章节确认弹窗 | 通过 | 确认删除生效且顺序不变；「取消」保留章节 |
| 7 | 每章字数与全书总字数显示 | 通过 | 11,226/11/0 字逐章准确；侧栏「全书共 3 章 · 11,237 字」；输入时侧栏字数即时刷新 |
| 8 | 万字级流畅编辑 | 通过 | 10 段共 11,000 字 insertText 总耗时 45ms（最慢单段 11ms）；连续 20 次输入总 18ms 无卡顿 |
| 9 | 网文排版 | 通过 | 实测计算样式 text-indent 30px（=2em@15px）、段间距 13.5px（=0.9em） |
| 10 | 停笔 1.5s 自动落盘 | 通过 | 状态 未保存→已保存；DB word_count 与纯文本字数精确一致（120→11,120→11,226 三级核对） |
| 11 | Ctrl+S 立即保存 | 通过 | 哨兵文本 400ms 内入库（未等防抖），状态栏转「已保存」 |
| 12 | 切换章节前强制保存 | 通过 | 第 3 章输入 11 字未满防抖即切走，内容已保留并落库 |
| 13 | 离开页面前保存 | 通过 | 离开工作台后 DB 完整（11,226 字含哨兵） |
| 14 | 状态栏三态显示 | 通过 | 「未保存…」「已保存」实测捕获；「保存中…」为瞬态未捕获（登记，非缺陷） |
| 15 | 完全重启持久化 | 通过 | taskkill 全部 electron 进程后重新 dev：书/3 章顺序/每章字数/总字数/万字正文（11 段 11,226 字含哨兵）全部恢复，状态「已保存」 |
| 16 | 删书级联删除章节 | 通过 | 删书后 chapters 表 0 行（FK CASCADE 生效） |
| 17 | 空标题重命名拦截（三层） | 通过 | 侧栏空白输入不提交且保留原标题；编辑器标题清空失焦回退；直调 IPC 传空白标题返回明确错误且不落库 |
| 18 | 删除全部章节空状态 | 通过 | 侧栏「还没有章节，点上方「+ 新章节」开始」+ 编辑器「选择或新建一个章节开始写作」+ 统计归零 |
| 19 | typecheck 双跑 | 通过 | tsconfig.node / tsconfig.web 两轮均 0 错误 |

字数口径抽查：保存的 word_count 与「纯文本去所有空白」逐字符一致（含 HTML 标签剥离、中文长段），符合口径声明。

## 发现的问题

### P1（一般）重命名自动聚焦抛未捕获异常 `editInputRef.value?.focus is not a function`

- 位置：`src/renderer/src/components/ChapterSidebar.vue` 第 26-27 行（`startRename` 内 `editInputRef.value?.focus()` / `.select()`）
- 原因：模板字符串 ref（`ref="editInputRef"`）写在 `v-for` 内，Vue 3 会把同名 ref 收集为**数组**，`editInputRef.value` 不是 DOM 元素而是元素数组，调用 `.focus()` 必然 TypeError
- 实测证据：每次点击侧栏「重命名」按钮，控制台抛 `Uncaught (in promise) TypeError` + Vue warn（本次会话复现 3 次）；实测 `document.activeElement` 不落在重命名输入框上
- 影响：重命名仍可用（用户需再手动点一次输入框），但自动聚焦/全选失效、每次触发产生 console 报错——违反自测清单「无 console 报错」项，开发自测声明未覆盖此路径
- 修复建议：`editInputRef` 改为 `ref<HTMLInputElement | null>` + 函数式 ref（`:ref="(el) => (renameInputEl = el)"`）只记录当前编辑行，或保留数组类型取 `[0]`；一行级改动
- 严重级别判定依据：核心数据链路无损、无阻断，属交互退化 + 规范违反，判「一般」；按验收纪律一般问题可挂技术债，但本项修复成本极低，建议 M3 交付前当场修复

### P2（轻微）布尔变量命名不符合 is/has/can 前缀约定

- `WorkspaceView.vue` 的 `switching`（M3 新增）；`loading`/`submitting` 为 M1/M2 既有模式。coding-standards 第 3 节约定瑕疵，不影响功能，可随下次触碰这些文件时顺手更名

### P3（观察登记，未归因为缺陷）一次未复现的页面跳转

- 万字编辑测试完成后约 1 分钟内，应用在无外部脚本输入的情况下从工作台回到书斋（#/）。当时全部内容已完整落库（无数据丢失，第 13 项因此顺带验证了离开页面保存）。其后 30+ 分钟全部测试未再复现，dev 日志无异常。不排除人工触碰真机窗口或 HMR 所致，登记备查；若后续复现需排查

## 代码规范抽查（coding-standards）

| 文件 | 结果 |
|---|---|
| `src/main/db/chapters.ts` | 合规：顶注释、JSDoc、snake_case 行类型 + camelCase 映射、move/delete 事务、无 any |
| `src/main/db/database.ts` | 合规：migration v3 只增、`foreign_keys = ON`、WAL、schema_migrations 记录 |
| `src/main/ipc/chapters.ts` | 合规：五通道 `chapters:list/create/update/delete/move` 命名规范，统一 wrap() 包 IpcResult |
| `src/renderer/src/views/WorkspaceView.vue` | 合规：206 行 <400、编排职责清晰、flushSave 幂等、卸载保存、中文注释 |
| `src/renderer/src/components/ChapterEditor.vue` | 合规：147 行、防抖归父层、Ctrl+S 拦截、defineExpose 边界清晰 |
| `src/renderer/src/components/ChapterSidebar.vue` | 除 P1 外合规：142 行、事件 emit 契约清晰 |
| `src/shared/chapter.types.ts` | 合规：跨进程契约先行、无运行时逻辑 |

## 纪律核查（验收人自查）

- 测试书籍「复验-M3工作台」及其章节已全部删除；终态 DB：books 0 本、chapters 0 行、api_profiles 仅剩用户原有「基元律动（ZCode 同款）」且 settings 默认档案指向未变
- 未改动任何项目源码/文档；git 工作区中 `scripts/accept-via-llm.mjs` 的未提交改动系验收开始前已存在，与本次验收无关
- 测试脚本置于系统临时目录，未写入项目
- 结束时已 `taskkill //IM electron.exe //F`

## 遗留与建议

1. **转交开发**：修复 P1（ChapterSidebar 重命名 ref 数组问题），修复后走「①自测→②复验」小循环，再进入 ③ 用户确认
2. **技术债登记**：P2 命名前缀（同一问题按规范最多存活两个里程碑）
3. 「保存中…」瞬态建议开发自测补一条捕获证据（大文档 + 快轮询）随修复一并附上
4. 用户确认指引：启动 `npm run dev` → 书斋新建书 → 进工作台连点三次「+ 新章节」→ 双击/点笔图标重命名 → 正文粘贴一段长文 → 观察 1.5s 后状态栏变「已保存」→ Ctrl+S → 重启应用核对内容 → 删除书
