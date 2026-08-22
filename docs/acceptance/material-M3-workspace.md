# M3 正文工作台 — 验收材料

## 里程碑与范围

M3 交付正文工作台：书籍的章节管理与沉浸式编辑器。入口：书斋点击书籍卡片 → /book/:id/write。

## 验收点（roadmap 定义）

1. 章节树：新建（自动命名「第 N 章」）、选中切换、行内重命名、上移/下移、删除（确认弹窗）、每章字数与全书总字数显示
2. TipTap 编辑器：万字级章节流畅编辑；网文排版（首行缩进 2em、段间距）；标题行内编辑
3. 自动保存：输入停止 1.5s 后自动落盘；Ctrl+S 立即保存；切换章节与离开页面前强制保存；状态栏实时显示「已保存/未保存/保存中」与字数
4. 持久化：完全重启应用后章节、正文、字数全部保留
5. 数据完整性：删除书籍时级联删除其全部章节（FK ON DELETE CASCADE）

## 开发自测声明（CDP 驱动真实 Electron 实测）

- IPC 全链路：新建 2 章（自动命名+自定义标题）、万字正文（9 段 12960 字）保存字数精确、列表排序正确
- UI：万字 9 段渲染正常；连续输入 5 次共 10ms（无卡顿）；自动保存增量落库（13005 字）；状态栏「已保存」
- 完全重启（taskkill 全部 electron 进程后重新 dev 启动）：章节 2、万字正文、自动保存内容全部恢复
- 级联：删除测试书后 chapters.list 返回 0
- typecheck（tsconfig.node/web）双 0 错误

## 实现要点（供代码审查定位）

- src/main/db/database.ts：migration v3 + `foreign_keys = ON`
- src/main/db/chapters.ts：DAO（moveChapter 事务交换序号；deleteChapter 事务删除+序号压缩）
- src/main/ipc/chapters.ts：五通道（list/create/update/delete/move）
- src/renderer/src/views/WorkspaceView.vue：编排层（flushSave 幂等、切换前保存、卸载保存）
- src/renderer/src/components/ChapterEditor.vue：TipTap 封装（防抖由父层处理、Ctrl+S 拦截、setSaveState）
- src/renderer/src/components/ChapterSidebar.vue：章节树
- 字数口径：纯文本去所有空白字符

## 已知边界（登记在案，非缺陷）

- 章节排序用上移/下移按钮，拖拽排序列入技术债
- 编辑器右栏（作品记忆/在场角色等）规划于 M8+
- 删除章节/书籍均不可恢复（有确认弹窗拦截）
