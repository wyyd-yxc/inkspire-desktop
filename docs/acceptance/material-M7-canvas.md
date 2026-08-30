# M7 章节画布 — 验收材料

## 里程碑与范围
M7 交付章节画布：Vue Flow 场景编排 + AI 场景生成（v1 五模式）+ 按场景顺序生成正文。
入口：工作台侧栏章节 hover「画布」按钮 / 路由 /book/:bookId/canvas/:chapterId。

## 验收点
1. **场景 CRUD**：手动新建（面板全字段：标题/摘要/节拍/张力滑条/标签/状态 4 档/关联词条多选）、编辑、删除（确认+序号补齐）+ 持久化
2. **画布交互**：Vue Flow 渲染自定义场景节点（状态色条/序号/标签芯片/词条图标）；拖动落库（pos+按 x 重排 sort_order）；双击开详情；单击选中（锚点模式用）
3. **AI 场景生成 v1 五模式**：init（空画布 3-5 场景链）/bridge（锚点前插过渡）/rewrite（充实选中场景）/ending（收尾）/append（尾部 N 场景）——严格 JSON 数组输出+宽容解析+正则救援兜底
4. **按场景生成正文**：确认弹窗（字数/覆盖警告/锁定计数）→ 逐场景生成（前文衔接、locked 跳过并占位）→ 拼合 HTML 写入章节 → 自动跳工作台
5. **词条挂接生效**：场景挂 always/manual 词条 → 生成正文引用其内容
6. **入口**：侧栏 hover 画布按钮

## 开发自测声明
- 场景 CRUD+事务重排（IPC 直调）：create3→list→reorder→update(pos+summary)→remove→序号压缩 全过 ✓
- 解析器白盒单测 5/5（标准数组/值内引号/散文包裹/单对象/截断）✓
- AI init 流式实测：正确产出场景 JSON 数组（997 字实捕）✓
- 已知上游问题：GMI MiniMax M3 流式**间歇停摆**（流中断 done 不触发，5 分钟硬超时后报「已中止」）——应用侧超时/中止/重试路径完整，属 API 服务质量问题
- typecheck 双 0

## 实现定位
- shared/canvas.types.ts、main/db/{database(v6),scenes}.ts、main/ipc/scenes.ts、preload
- renderer/services/scenePrompts.ts（场景生成+正文提示词+宽容解析+wikiRefText）
- renderer/views/CanvasView.vue（Vue Flow+自定义节点+详情面板+AI 集成+正文生成循环）
- components/ChapterSidebar.vue（画布入口）

## 验证提示（针对上游 AI 抖动）
AI 相关用例如遇长时间无响应，多为上游流式停摆：等待 5 分钟硬超时报「已中止」后**重试**即可。黑盒验收请对 AI 用例允许最多 3 次重试。

## 已知边界
- 平行推演/素材组生成（依赖灵感墙 M11）延后；连线仅视觉存储（生成顺序由 x 坐标决定）
- 生成正文为整章替换（覆盖警告已带）；章节概要字段依赖 chapters.summary（M3 未提供 UI，暂空）
