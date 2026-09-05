# 画布场景连线 — 验收材料

## 范围
M7 章节画布增强：场景连线（关系表达 + AI 参考）。tag v0.8.0-m7-canvas 已打（核心画布），连线并入后续 tag。

## 验收点
1. **建边**：拖动节点左右手柄连线（或 IPC）→ 落库渲染；校验拦截「连接自身」「同向同类型重复」
2. **三类型样式**：main 主线实线金 / logic 因果虚线蓝 / relation 关联点线灰；label 显示在边上
3. **边编辑**：单击边选中 → 工具栏编辑器（类型切换即时生效 + 标签输入回车/按钮保存 + 删除）
4. **级联**：删除场景时其出入连线自动删除（FK + 本地同步）
5. **正文关系注入**：生成正文时 systemPrompt 携带该场景出入关系描述（「顺承接续/因果指向/关联 X」「承接自 Y」），因果不写反
6. **持久化**：重启后连线完整回读

## 开发自测声明（CDP 真实应用，tmp/edge-verify.mjs）
- IPC 建边 logic+「引发」成功；自身/重复双拦截文案正确
- reload 后画布渲染 1 条边 + label「引发」
- update 改 main+清 label 生效
- 删场景 1 后边自动级联（edgesAfter=0）
- 重建边后按场景生成正文：全部场景完成、自动跳工作台（relationText 注入无报错）
- typecheck：tsc×2 + electron-vite build 全过

## 实现定位
- shared/canvas.types.ts（连线类型四件套）、main/db/database.ts（migration v7）、main/db/sceneEdges.ts、main/ipc/sceneEdges.ts、preload
- CanvasView.vue：sceneEdges/flowEdges/edgeTypeStyle、onConnect/onEdgeClick/saveEdgeEdit/removeSelectedEdge/relationTextFor、节点 Handle 左入右出、工具栏连线编辑器
- services/scenePrompts.ts：buildSceneProseMessages 增 relationText 参数

## 设计边界（已确认）
连线 v1 = 关系表达 + AI 参考；生成顺序仍按 x 坐标线性；分支独立生成、交叉避让、灵感节点不做。

## 已知边界
- 边删除仅经编辑器删除按钮（Vue Flow 默认 Delete 键删除选中元素的行为未额外定制）
- relationText 注入效果依赖模型遵循度，无法强断言（黑盒可抽查因果方向）
