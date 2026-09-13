# M15.5 验收材料（UI 布局重规划：全局书内导航壳 + UI 技术债清偿）

- 日期：2026-09-13 · 会话 43
- diff 基准：`v0.20.0-m15-bindings`（静态审查请显式 `--base v0.20.0-m15-bindings`）
- 关键提交：ca68647（导航壳）、385c71b（七页去头部）、d211210（五债清偿）、805fb48（切章保存修复）

## 背景

用户拍板：打包发布前重新规划 UI 布局，借鉴同类产品（Sudowrite/Novelcrafter 三栏范式：左导航常驻+内容区+上下文面板；彩云小梦/蛙蛙写作的轻创作页），结合自身功能收敛为「全局书内导航壳」形态，并全量清偿 UI 技术债。皮肤不动（M10.8 案头纸墨令牌保留），只动布局与信息架构。

## 范围

1. **BookShellLayout 全局壳**（`layouts/BookShellLayout.vue` + `shellContext.ts` 契约）：
   - 路由改嵌套：`/book/:bookId` 挂壳，8 个功能页（write/genesis/wiki/canvas/:chapterId/plot/memory/inspirations/stats）为 children；`/book/:bookId` 空路径 redirect 到 write；书房 `/` 与 `/settings` 不套壳
   - 左栏 w-60：①「← 书房」+书名 ②功能导航竖排 7 项（当前路由高亮 bg-ink-primary-soft；场景规划按章进入不设导航项）+「同步」按钮（syncAlert 红点）③章节树（ChapterSidebar 瘦身为纯树：新建/选中/行内重命名/上下移/删除/hover 场景规划跳转/底部全书统计）④加载遮罩
   - **章节状态壳持有**：book/chapters 由壳加载并 provide（BOOK_SHELL_KEY 注入契约：bookId/book/chapters/activeChapterId/editorCtx/renameChapter）；activeChapterId 由路由 `?ch=` 驱动（仅写作台路由有值）；章节树点击/新建 → push `/write?ch=<id>`；删除当前编辑章 → push 回 write 默认首章
   - **联动同步栈上移壳**：memorySync/wikiSync/plotSync + SyncDialog + 3×SyncCandidateDialog 随壳挂载——任意书内页面可发起同步（原仅写作台）
   - **助手浮球升级书内全局**（原「v1 仅写作台」）：AssistantDock 挂壳；编辑器上下文（标题/正文纯文本/选区）由 WorkspaceView 经 provide 的 editorCtx 回写，离开写作台清空——跨页助手仍带章节上下文
2. **七页去旧返回栏**：Genesis 顶栏仅留完成度信息；Canvas/Plot 删「← 写作台」链接与页名/书名；Wiki/Memory/Inspirations/Stats 左栏头部块整体移除（页名书名壳统一显示）。全站 grep「← 写作台」清零
3. **切章保存重构**：pendingContent 增归属章 id，flushSave 按归属落盘——首次切离默认章（无 `?ch` 旧值）不丢草稿；归属章已被删除则弃草稿
4. **UI 技术债五项清偿**（roadmap L39/L48/L49/L50/L51/L52）：
   - **L39** 书籍卡删除键 hover-only → 常驻弱显（opacity-70，hover/focus 加深为危险色），触屏键盘可达
   - **L50** toast 动画后 DOM 残留 → 根因：窗口被遮挡时 CSS transitionend 不派发，Vue 等 transitionend 卡住节点移除（backgroundThrottling:false 只保定时器不保过渡事件）——修复：离场去 transition（`.toast-leave-active{display:none}` 即时卸载），入场动画保留
   - **L51** 拆书截断提示仅拆解中态可见 → 候选勾选面板 description 追加「拆解基于参考文本前 2 万字。」（仅 truncated 时）
   - **L52** 拆书主动「停止」红色错误样式 → 拆分 errorMsg（失败，danger 样式）/noticeMsg（中性提示，bg-paper），停止显示「已停止拆解，可重新发起」
   - **L48+L49** AI 面板：流式 chunk 缓冲 120ms 批量上屏（降低逐 chunk 重排版+滚动回流）；`seal()` 密封机制——停止后丢弃在途增量（停止即瞬时截断）；空输出 finish 也进入 ready 并显示「模型没有返回内容，可点重写重试」（不再静默悬挂 generating）；fail() 自动密封

## 验收点

1. 壳渲染：写作台/六功能页左导航常驻（书房返回/书名/7 导航项+同步/章节树/统计），当前页高亮，旧返回栏全站清零
2. 切章保存专项：真实键盘输入后未过 1.5s 防抖即切章 → 旧章内容已落盘；切回内容完整；从默认章（无 ?ch）首切同样正确
3. 助手浮球在非写作台页可用；壳同步按钮任意页可打开同步弹窗
4. 章节树 CRUD（新建跳转选中/重命名/移动/删除联动）+ 场景画布经章节行进入且壳保持
5. 技术债回归：删除键无需 hover 渲染可见；toast 显示后 4s 内 DOM 移除
6. 书房/设置不套壳；`/book/:id` redirect；typecheck 三重闸门+console 零报错+零 AI

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron（9222），零 AI 零外部额度，测试数据自建自清（删书终审计）。

- **tmp/m155-t1.mjs 22/22**：
  - T1 书籍卡删除键无需 hover 渲染（getComputedStyle display≠none）
  - T2 壳渲染三断言（左导航含书房/写作台/章节树；「← 写作台」全站清零；导航 7 项且写作台高亮）
  - T3 **切章保存专项**（真实 CDP 键盘输入）：输入探针 500ms（<1.5s 防抖）→ 点第二章 → chapters.get 断言旧章已落盘含探针 → 编辑器切换到第二章 → 切回第一章编辑器内容完整（探针+原文）
  - T4 六功能页逐页：壳在+高亮对+页面探针（新建词条/手动加事件/手动记一条/回收站/里程碑/已完成）在+旧头部无
  - T5 非写作台页（设定集）助手浮球可打开面板
  - T6 壳同步按钮打开「同步到其他模块」弹窗
  - T7 壳「+新章节」→ 列表+1 且路由跳转 `?ch=<新id>`
  - T8 场景画布经章节路由进入且壳保持、无旧返回栏
  - T9 `/book/:id` redirect 到 `/write`
  - T10 书房/设置不套壳（无 aside nav）
  - T11 toast 显示后 4s 内 DOM 移除（真实设置页触发）
  - 全程 console 零报错
- **自测发现并修复 1 个真 bug**（805fb48）：切章保存初版 watch 依赖 `?ch` 旧值——首次从默认章（无 query）切走时 oldId undefined 跳过 flush 丢草稿。重构为 pendingContent 绑定归属章 id（更健壮：与路由形态解耦）。另：typecheck 未能捕获未 import 的 watchEffect（运行时 ReferenceError），已修复并记入教训
- **测试脚本教训**：body.innerText 不含 input placeholder（探针须用按钮文本）；PowerShell 控制台 GBK 输出乱码不影响 PASS/FAIL 判读；HMR 污染（踩坑 #13）——壳类全局改动必须完全重启 dev 再测（两轮实证）

## 已知边界

- 场景规划无导航项（按章进入，入口在章节树行 hover 图标——沿用原交互）；情节大纲页在壳上高亮其导航项
- 助手章节上下文在离开写作台后清空（跨页助手对话不带章节正文，防陈旧数据）
- 同步栈上移后「当前章」范围仅在写作台路由下可选（其他页 can-sync-current 为 false）——语义正确（当前章=正在编辑的章）
- AI 面板缓冲 120ms：极短输出的上屏延迟不可感知；停止截断语义=「保留已上屏内容，丢弃在途」

> 审查模型沿用 glm-5.1。**依赖**：无。**tag 号**：v0.20.1-m15.5-relayout。

## 附录 A：r1 整改与裁定（glm-5.1，2026-09-13）

（待静态审查后填写）

## 附录 B：黑盒验收结果

（待黑盒后填写）
