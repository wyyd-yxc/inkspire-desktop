# M12 验收材料（作品风格：风格包管理 + 书籍绑定 + 优先级注入 + 封面上传）

- 日期：2026-09-09 · 会话 39
- diff 基准：`v0.16.0-m11-wall`（静态审查请显式 `--base v0.16.0-m11-wall`）
- 关键提交：a8f7526（数据层）、f885baf（管理分区）、6595ce9（书绑定）、22e3470（注入改造）、8487858（封面）

## 范围

1. **migration v13**：`style_profiles` 全局风格包表（name/tone 文笔调性/rules JSON 数组/word_target_min·max/sample/source_type 'manual'（'digest' 留 M14））+ **项目首个 ALTER TABLE**：`ALTER TABLE books ADD COLUMN style_profile_id TEXT REFERENCES style_profiles(id) ON DELETE SET NULL`（删包自动解绑，SQLite ADD COLUMN 带 REFERENCES 合法）。
2. **风格包管理**（设置中心「作品风格包」分区，抽 `StylePackagesSection.vue`+`StyleProfileDialog.vue` 守 400 行规）：CRUD（名称/调性/叙事规则动态行增删/单章字数软目标区间/样例）；来源徽标（自建/拆书）；删除确认含「自动解绑」提示。**预设 5 包保持 presetStyles.ts 常量不入库**（分区文案明示）。
3. **书绑定**：书房卡片第 4 按钮「风格」→ `StyleBindDialog`（不绑定/用户包单选）→ books:update 落 style_profile_id；卡片显示「文风·包名」徽标；构思台基调步双列表——用户包（「我的」/「拆书」徽标，点击写 books 绑定）+ 预设（照旧写 step1）；**绑定优先语义**：绑定包存在时预设卡不显示「已绑定 ✓」，改选预设自动清书绑定（保证所选即所效）。
4. **风格注入**（抽 `services/styleContext.ts` 纯函数，两管线共用）：优先级 **书绑定包 > 基调步预设 promptHint > 无**。注入面（口径经用户确认）：①写作管线（续写/划词/整章润色，ChapterEditor writingContext 合并解析）②场景规划「按场景生成正文」（buildSceneProseMessages 增可选 styleHint 参数，CanvasView 并行加载 genesis step1+styles 解析）。**剧情事件链/场景节点生成不注入**（sceneSystemPrompt 未改动——结构规划与文风无关）。
5. **封面上传**（清偿 roadmap 技术债「封面自定义上传」）：IPC `books:set-cover`（showOpenDialog 图片过滤 png/jpg/jpeg/webp/gif、≤5MB、copy 到 userData/covers/<uuid>.<ext>、DB 只存文件名——v1 既有约定）+ `books:read-cover`（basename+扩展名白名单校验防路径穿越，回 data URL 合 CSP img-src data:）+ `books:remove-cover`（清字段，物理文件保留——任务卡已知边界）；BookCard 有 cover 渲染 `<img>`（渐变做加载底），无则渐变+书名首字；hover 工具「上传封面/换封面/移除」。
6. **字数软目标**：归一化（正数取整/非法弃用/min>max 交换）；注入为「单章篇幅约 X-Y 字（软目标，内容完整优先）」，不做硬切分。

## 验收点

1. 风格包 CRUD 全链路（分区新建→列表卡→编辑→删除确认），重启持久
2. 绑定风格包后续写请求的 systemPrompt 含「目标文风：{调性}」+ 规则逐条 + 字数软目标，且**不含**基调预设 promptHint（绑定包压过预设）
3. 仅基调预设（无绑定）时回落预设 promptHint，维持现状注入
4. 皆无时不注入任何风格块
5. 删包 → 书绑定自动置空（FK SET NULL 实证）+ UI 徽标消失 + 注入回落
6. 基调步可选用户包（「我的」徽标）并生效；预设列表在绑定包存在时不误标「已绑定 ✓」
7. 场景正文请求注入风格；**场景/剧情节点生成请求不含风格**（M12 未改 sceneSystemPrompt/plotPrompts——源码事实）
8. 封面：readCover 回 data URL 且内容一致；路径穿越被拒；书卡 img 渲染；移除后字段清空+渐变回归；重启持久。上传对话框人工路径（showOpenDialog 原生交互）由黑盒/亲手验证覆盖
9. 删书级联（books 删除不残留风格包）、console 零报错；**外部 AI 额度消耗 0**（本地假 OpenAI 服务器捕获真实请求体）

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron，测试数据自建自清（删书删包终审计清零）：

- **tmp/m12-t1.mjs 15/15**（零 AI）：migration v13 断言（版本/表/列）/分区可见/弹窗全链路新建（调性+两规则+字数区间）/DB 断言/列表卡徽标/min>max 交换/书房绑定弹窗+DB+卡片徽标/编辑保存/删除确认含解绑提示/物理删/**SET NULL 自动解绑 DB 实证**/清理
- **tmp/m12-t2.mjs 13/13**（本地假 OpenAI 服务器 127.0.0.1:18923 捕获真实请求体，外部额度 0）：写作管线绑定包注入（调性+规则+字数+压过预设 4 断言）/场景正文绑定包注入/解绑后回落基调 promptHint/皆无无风格块/默认档案恢复
- **tmp/m12-t3a.mjs 3/3 + t3b.mjs 6/6**：封面直写等价产物+readCover data URL 内容一致/**路径穿越拒**/书卡 img 渲染/**整进程重启后包+绑定+封面逐字段一致**+removeCover 回落渐变/清理清零

**自测发现并修复的测试脚本问题**（非应用缺陷，如实披露）：
1. 弹窗定位 helper `body > div` 首个匹配是 `#app` 根节点（页面自身含同名按钮）——加 `d.id !== 'app'` 过滤
2. contextBridge 暴露对象只读，chatStream 无法 hook——改本地假服务器方案（更优：拿到完整请求体且链路全通）
3. 绕过 UI 直调 IPC 后必须重载组件再断言（M10.5/M11/M12 三次实锤；本轮 hash 同值不触发重挂载再次踩中——改双跳导航）
4. 脚本直调 IPC 不触发 UI 事件链（removeCover 后徽标/封面不即时消失）——真实用户路径经 emit changed 刷新，脚本用 reload 等价模拟

## 已知边界

- 封面上传对话框（showOpenDialog 原生交互）不在 CDP 自测覆盖内，由黑盒/亲手验证覆盖
- 删书/移除封面不清理 userData/covers 物理文件（小文件无害，任务卡登记）
- 风格包列表全量拉取（量级同记忆/情节域）；剧情与场景节点生成不注入文风（口径已拍板）
- 字数目标为提示词软约束，不强制截断/扩写

## 实现定位

- shared：`src/shared/style.types.ts`（StyleProfile/入参）、`book.types.ts`（styleProfileId 三处）
- main：`database.ts`（migration v13 含首个 ALTER）、`db/styles.ts`（DAO：名称必填/规则 20 条×100 字钳制/字数归一化）、`db/books.ts`（扩列+绑定存在性校验）、`ipc/styles.ts`、`ipc/covers.ts`（上传/移除/读取）、`ipc/books.ts` 不变、`index.ts` 注册
- preload：styles 组 + books.setCover/removeCover/readCover
- renderer：`components/settings/StylePackagesSection.vue`+`StyleProfileDialog.vue`（管理）、`components/StyleBindDialog.vue`+`BookCard.vue`（绑定徽标/封面渲染/hover 工具）、`services/styleContext.ts`（resolveEffectiveStyle/buildStyleProfileHint 纯函数）、`components/ChapterEditor.vue`（boundStyle 缓存+writingContext 合并）、`views/CanvasView.vue`（genesis+styles 并行装载+styleHint 传递）、`services/scenePrompts.ts`（buildSceneProseMessages 增 styleHint 参数）、`views/GenesisView.vue`（基调步双列表+绑定/解绑）、`views/SettingsView.vue`（分区接入）、`views/BookshelfView.vue`（onBookChanged 就地更新）

## 设计边界（任务卡口径，经用户确认）

- 注入面=写作管线+场景正文；剧情/节点生成不注入
- 预设 5 包常量不入库；style_profiles 只存用户包；'digest' 留 M14（拆书产出直写 styles:create）
- 风格包全局库，books 侧绑定；删包 FK SET NULL 自动解绑
- 不做：导入导出/按章切换/AI 生成风格包/段落级重写/封面裁剪编辑器
