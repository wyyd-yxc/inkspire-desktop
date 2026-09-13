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

结论：有条件通过（llm-review-2026-09-13-04-46-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中：AiWritingPanel finish() 缺 sealed=true，迟到达 chunk 污染已完成面板 | **采纳** | finish() 补密封（与 fail 一致）；retry 经 reset() 解封不受影响 |
| 高：typecheck 闸门未捕获未 import 的 watchEffect，疑闸门失效 | **采纳披露，确认为既有工程缺口（非本轮引入）** | 查实：typecheck=tsc×2+build——**tsc 不检查 .vue SFC**（.vue 的 script 类型检查需 vue-tsc，而 vue-tsc 3.3.11 与项目 TypeScript 7 不兼容：TS7 包不再导出 `./lib/tsc`，vue-tsc 启动即 ERR_PACKAGE_PATH_NOT_EXPORTED，M0 起即无法接入）。.ts/.shared/主进程/preload 覆盖正常；.vue 缺口以 typecheck（共享类型/契约）+build（转译错误会挂）+CDP 运行时自测三层兜底。登记 roadmap 技术债（vue-tsc 支持 TS7 后接入）；踩坑登记「.vue 内未导入标识符 typecheck 不报，运行时才炸」 |
| 低：ChapterSidebar 死 prop bookId | **误报** | props.bookId 在场景规划跳转（router.push \`/book/${props.bookId}/canvas/...\`）中活跃使用；附源码自证 |
| 低：字数统计模板内联 reduce | **采纳** | 提取为 computed totalWords |
| 无法判定（diff 截断）：壳布局/切章保存/同步栈/助手上下文/路由 | **证据补全** | 核心源码摘录入附录 B（shellContext 契约+壳关键段+WorkspaceView 切章保存段+路由嵌套配置）；运行时断言见自测 T2-T11 |

## 附录 B：核心源码事实（r1 截断补全）

### 契约 layouts/shellContext.ts（全文见 diff，未截断）

`BOOK_SHELL_KEY: InjectionKey<BookShellCtx>`；BookShellCtx = { bookId, book, chapters, activeChapterId, editorCtx: {title,content,selection}, renameChapter }。

### 壳关键段（BookShellLayout.vue 摘录）

```ts
const activeChapterId = computed(() =>
  route.name === 'workspace' ? ((route.query.ch as string) ?? '') : ''
)
const editorCtx = reactive({ title: '', content: '', selection: '' })
provide(BOOK_SHELL_KEY, { bookId, book, chapters, activeChapterId, editorCtx, renameChapter })
// 章节树点击/新建 → router.push({ path: `/book/${bookId.value}/write`, query: { ch: c.id } })
// 删除当前编辑章 → router.push({ path: `/book/${bookId.value}/write` })（回落首章）
// 同步栈：useMemorySync/useWikiSync/usePlotSync 全在壳实例化；openSyncDialog 任意页可用
```

```html
<aside class="flex h-full w-60 shrink-0 flex-col border-r ...">
  <div>← 书房 / 书名</div>
  <nav> 7×router-link（route.name === item.name 时高亮 bg-ink-primary-soft）+ 同步按钮（syncAlert 红点）</nav>
  <ChapterSidebar :chapters :active-id="activeChapterId" :book-id @create @select @rename @remove @move />
</aside>
<main class="min-w-0 flex-1"><router-view /></main>
<AssistantDock :book-id :book :chapter-title="editorCtx.title" :chapter-content="editorCtx.content" :selection-text="editorCtx.selection" />
```

### 切章保存段（WorkspaceView.vue，805fb48 全文）

```ts
const pendingContent = ref<{ html: string; wordCount: number; chapterId: string } | null>(null)
async function flushSave(): Promise<void> {
  const pending = pendingContent.value
  if (!pending) return
  const target = chapters.value.find((c) => c.id === pending.chapterId)
  if (!target) { pendingContent.value = null; return } // 归属章已删除：弃草稿
  pendingContent.value = null
  /* chapters.update(target.id, ...) + 共享数组原位更新 + setSaveState */
}
function onContentChange(html, wordCount) {
  if (!activeChapter.value) return
  pendingContent.value = { html, wordCount, chapterId: activeChapter.value.id }
  /* ...防抖 1.5s flushSave... */
}
watch(() => route.query.ch, () => { if (route.name !== 'workspace') return; void flushSave() })
watchEffect(() => {  // 助手上下文回写；onBeforeUnmount 清空
  editorCtx.title = activeChapter.value?.title ?? ''
  editorCtx.content = (activeChapter.value?.content ?? '').replace(/<[^>]+>/g, '')
})
```

### 路由嵌套（router/index.ts 全文见 diff）

`{ path: '/book/:bookId', component: BookShellLayout, children: [{ path: '', redirect: write }, write/genesis/wiki/canvas/:chapterId/plot/memory/inspirations/stats 八 children] }`；书房 `/` 与 `/settings` 平级在外。

## 附录 A2：r2 裁定（glm-5.1，2026-09-13）

结论：不通过（llm-review-2026-09-13-04-53-.md）——三项复核如下，整改后 T1 扩为 23/23。

| 项 | 裁定 | 处理 |
|---|---|---|
| P1 高：离开写作台路由时 watch 守卫拦截 flushSave，草稿丢失 | **不采纳（缺陷定性），采纳（覆盖缺口）** | 守卫 return 后组件随即卸载，`onBeforeUnmount → void flushSave()` 按归属章落盘（附录 B 补摘录该钩子）——功能上不丢；**场景级自测缺口属实**：新增 T3b（输入未过防抖→点「设定集」→ 断言第二章已落盘含探针）PASS 实证。watcher 守卫保留（防其他路由 query 变化误触发） |
| P2 中：flushSave 先清 pending 再异步落盘，异常时草稿不可恢复 | **不采纳（既有语义，M3 起如此）** | 失败路径：setSaveState('dirty')+toast 报错，编辑器屏幕文本仍在，用户继续编辑即产生新 pending 自动重试；「恢复旧 pending」会引入覆盖新输入的竞态，弊大于利。留档 |
| P3 中：AiWritingPanel flushTimer 无卸载清理 | **采纳（卫生）** | 补 onBeforeUnmount 清理定时器 |
| 无法判定项（壳模板/CRUD handler/路由配置等 diff 截断） | 黑盒覆盖 | 附录 B 已含关键段摘录；运行时断言 T2/T4/T6/T7/T8/T9/T10 全 PASS；黑盒将再以真实 UI 复验 |

## 附录 A3：r3 裁定（glm-5.1，2026-09-13）

结论：有条件通过（llm-review-2026-09-13-04-58-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 高：七页去头部 diff 截断，全站清零无法静态验证 | **证据补全（运行时+grep 双证）** | 该七页变更合计仅 -37/+7 行（删头部块），grep 证据如下；运行时 T4 六页断言+T8 画布「无旧返回栏」全 PASS |
| 中：BookCard 删除键缺 focus 危险色 | **采纳** | 补 `focus:bg-ink-danger focus:text-white` |
| 中：AiWritingPanel 卸载未 flushBuf | **采纳** | onBeforeUnmount 先 flushBuf 再清定时器 |
| 低：stopGeneration 中 seal()+finish() 冗余 | **不采纳（语义显式）** | seal()=「停止截断」意图、finish()=「流结束」，finish 现含密封故功能等价；显式 seal 表达停止语义，保留可读性 |
| 信息：typecheck .vue 缺口 | r1 已裁定并登记技术债 | 不重复 |

### 「← 写作台」全站 grep 清零证据（r3）

```
$ grep -rn "← 写作台" src/renderer/src --include="*.vue"
（无输出=清零，2026-09-13 会话 43 实测）
$ git show 385c71b --stat
七页文件各 -3~-14 行（ GenesisView/CanvasView/PlotCanvasView 顶栏链接+页名；WikiView/MemoryView/InspirationsWallView/StatsView 左栏头部块）
```

## 附录 A4：静态审查收敛声明（glm-5.1，2026-09-13）

r4 结论：有条件通过（llm-review-2026-09-13-05-01-.md）——「可审查部分的代码质量合格」，余项全部为 BookShellLayout.vue diff 截断（1.5 万字 diff 限额的结构性限制，核心段已摘录附录 B）与运行时范畴（黑盒覆盖）。**静态审查轨道就此收敛**：

| 项 | 裁定 |
|---|---|
| U8：窗口关闭时 flushSave 落盘时序 | M3 起既有语义（onBeforeUnmount void flushSave 发起 IPC），非本轮引入；Electron 窗口关闭不等待渲染层在途 IPC 属已知边界，自动保存 1.5s 防抖下窗口暴露面与本轮改前一致——留档不另改 |
| U9 及其余无法判定项 | 自测 T9/T10 已断言（redirect/书房设置无壳）；黑盒终审 |

静态轨道结论：r1-r4 共 6 处真修（finish 密封、computed 字数、卸载清定时器、T3b 场景补测、focus 危险色、卸载 flushBuf），P1/P2/seal 三项裁定留档，.vue 类型检查缺口查实登记技术债。双轨第一轨完成。

## 附录 C：黑盒验收结果

**37/37 断言全过，无应用缺陷**（2026-09-13，报告已入库 docs/acceptance/2026-09-13-M15.5-relayout.md）。零真实 AI（本地假服务器三模式：digest 慢流/writing 空输出/慢流）；console 错误 0；测试数据全清零+默认档案与槽位绑定恢复原值。

- **壳全页遍历 12/12**：书房/设置无壳；7 功能页+画布壳元素齐全（书房链/书名/7 导航/同步/章节树/统计/浮球）、高亮正确、全站无「← 写作台」、redirect 正确
- **切章保存双场景 6/6**：真实键盘探针 600/500ms 内切章/离台均落盘，切回完整
- **浮球全局+壳同步 6/6**：设定集/统计页浮球打开面板；灵感墙页同步弹窗正常
- **技术债回归 8/8**：删除键常驻（computed style 实证）；toast 2.53s DOM 消失；拆书停止中性样式；空输出「模型没有返回内容，可点重写重试」；慢流停止后文本冻结（33/33/33）
- **场景入口 5/5**：章节行悬停图标进入画布且壳保持

**双轨验收总结论：通过**（静态 r1-r4 六处真修+三项裁定；黑盒 37/37 无缺陷）。

## 附录 D：交付物提交清单（自 v0.20.0-m15-bindings）

ca68647 壳 / 385c71b 七页去头部 / d211210 五债 / 805fb48 切章保存修复 / b1b97c7 材料 / 748309d r1 整改 / cb1f131 r2 整改 / 69e61b7 r3 整改 / 1e97c16 静态收敛。
