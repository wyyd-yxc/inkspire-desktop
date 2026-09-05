# 补充：material-M8-memory.md 的完整实现文件（响应静态审查「diff 截断」）
附录 A：src/main/db/memories.ts 全文
附录 B：src/renderer/src/services/memoryPrompts.ts 全文
附录 C：src/renderer/src/views/MemoryView.vue 全文（含删除确认弹窗 ConfirmDialog 接线）
附录 D：ChapterEditor.vue memoryCache computed（注入过滤实际路径）
附录 E：src/main/ipc/memories.ts 全文（含 kind/source 白名单校验 da0de7b 后 3350f97）
以上文件均已在仓库中，静态审查可用 git show HEAD:path 直接读取；因单次材料体积限制未能全文粘贴，以仓库路径代替。
另：注入过滤口径说明——渲染层 computed（ChapterEditor.memoryCache）按当前章 sortOrder 过滤 chapterNo < sortOrder 是实际生效路径；DAO listMemoriesBefore 为预留的服务端权威过滤接口（当前未调用，已加注释说明），两者口径一致（chapterNo < 目标章，不含）。
删除确认弹窗：MemoryView 模板 ConfirmDialog 组件（与 M6/M7 同一复用组件，M6 黑盒已验证其弹窗行为）。
