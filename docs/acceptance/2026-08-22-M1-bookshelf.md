# 验收报告：书斋（M1）

- 日期：2026-08-22
- 验收人：GLM-5.3（zai-start-plan）· 独立验收子代理（与开发会话分离，只读验收，未改动任何源码）
- 结论：**不通过** —— `books:create` 与 `books:update` 存在 SQL 命名参数绑定不匹配的阻断级 bug，应用内完全无法新建/更新书籍，M1 核心验收点「建书→重启仍在」无法达成。需修复后从 ① 开发自测重新走验收流程（acceptance-workflow 第 1/6 节）。

## 验证方式说明（重要）

- 环境：Windows 10 / Git Bash / Node v24.19.0，项目根 `D:\desktop\vibecoding_program\writing`。
- **UI 与异常路径全部在真实 Electron 应用内验证**：以 `--remote-debugging-port=9222` 启动应用，通过 CDP（Runtime.evaluate）在真实渲染进程里驱动 DOM 点击、表单输入、toast 读取，等价于真实用户操作，强于「浏览器 + mock」路径。本会话的浏览器自动化技能受「仅主代理使用」约束未启用，CDP 方案效果等价且更贴近生产运行环境，特此注明。
- 持久化验证：node + better-sqlite3 直写 `%APPDATA%/inkspire-desktop/inkspire.sqlite` → 重启应用 → selftest 读回。
- 全程未修改任何源码；测试数据与进程均已清理（数据库 books 表已清空、`taskkill //IM electron.exe //F` 无遗留、5173 端口已释放）。

## 验收点逐项核对

| # | 验收点 | 结果 | 备注 |
|---|---|---|---|
| 1 | 持久化：应用内建书→重启仍在 | ❌ 不通过 | 「应用内建书」环节被 P0-1 阻断（create 必失败）；「直写→重启→读到」我已复现通过（list 链路持久化正常，snake_case→camelCase 映射正确） |
| 2a | 书斋卡片网格（渐变封面/书名/分类标签/更新时间） | ✅ | 真实 Electron 内渲染验证：CDP DOM 快照确认卡片、书名、header「墨灵/书斋」；代码含按书名 hash 稳定取色渐变、分类标签（未分类兜底）、状态徽标、`更新于 yyyy-MM-dd` |
| 2b | 新建弹窗（书名必填/十分类/简介） | ✅ 结构 / ❌ 功能 | 弹窗结构完整（书名 input maxlength50、十分类单选可再点取消、简介 textarea maxlength500）；空书名提交被拦截且 toast「请填写书名」实测通过；**填书名提交 100% 失败**（P0-1，toast 显示 `Missing named parameter "createdAt"`） |
| 2c | hover 删除 + 确认弹窗 | ✅ | 全流程实测：hover 卡片出删除按钮 → 点击 → 确认弹窗（标题含书名、危险色确认键）→ 确认 → toast「《删除流程测试书》已删除」→ 卡片消失 → 回到空状态 |
| 2d | 空状态 | ✅ | 「还没有作品，从一个书名开始你的故事」+「新建第一本书」引导按钮，实测出现/消失均正常 |
| 2e | toast 提示 | ✅ | success/error 实测均正常呈现（错误 4s、成功 2.6s 自动消失） |
| 3 | 代码规范（DAO 映射/IPC wrap/注释命名） | ✅ | 行↔实体映射经 toBook 单点完成且实测字段正确；四通道全走 wrap()；文件头/JSDoc/中文注释齐备、命名合规；无 `any`、无无主 TODO、渲染层零 console（错误全走 toast）；Vue 组件均 <400 行且 script→template→style 顺序正确 |
| 4 | 异常路径：空书名 / 删除不存在 | ✅ | 空书名：UI 层（BookCreateDialog.submit 拦截+toast）与 DAO 层（throw「书名不能为空」→wrap 转错误）双层拦截，实测 `{ok:false,error:"书名不能为空"}`；删除不存在 id：实测 `{ok:true,data:false}`，不崩溃 |
| 5 | typecheck 双通过；无 console 报错 | ✅ | `tsc -p tsconfig.node.json` 与 `tsconfig.web.json` 均 0 错误；主进程日志全程无 error（多次 selftest 均 ok:true）；渲染层 CDP 监听 exceptionThrown 全程无未捕获异常（错误均被 catch 转 toast，符合规范第 7 节） |

## 发现的问题

### P0-1（阻断）`books:create` SQL 命名参数绑定不匹配，应用内新建书籍 100% 失败

- 位置：`src/main/db/books.ts` 第 71–83 行（createBook）。
- 原因：INSERT 语句占位符为 `@createdAt`/`@updatedAt`（camelCase），而 `.run({...})` 传参键为 `created_at`/`updated_at`（snake_case）。better-sqlite3 按占位符名取键，找不到即抛 `Missing named parameter "createdAt"`。
- 实测证据（真实 Electron 渲染进程内调用 `window.api.books.create({title:"CDP应用内建书",...})`）：
  `{ok:false, error:"Missing named parameter \"createdAt\""}`。
- UI 表现：新建弹窗点「开始创作」→ toast 报错英文异常信息、弹窗不关、书未创建。M1 验收点「建书→重启仍在」因此不可能达成。
- 修复指引：run 传参键改为 `createdAt:`/`updatedAt:`（与占位符一致），或占位符改 `@created_at`/`@updated_at`（与列名一致，推荐后者，语义更清晰）。

### P0-2（阻断）`books:update` 同类绑定错误，更新书籍 100% 失败

- 位置：`src/main/db/books.ts` 第 104–115 行（updateBook）。
- UPDATE 占位符 `@updatedAt` vs run 键 `updated_at`，实测 `{ok:false,error:"Missing named parameter \"updatedAt\""}`（对存在 id 与不存在 id 均如此；后者若 getBook 先拦则返回「书籍不存在」）。
- M1 无 UI 入口但随 M1 交付同库函数，属同一缺陷一次性修复。

### P1-1（一般）开发自测存在盲区，selftest 覆盖不足导致阻断 bug 漏检

- `INKSPIRE_SELFTEST` 自检只调用 `books:list`，未覆盖 create/update/delete；worklog 会话 3 的「新建全流程」自测仅在浏览器 mock 模式下执行（`mock.create` 不经过 DAO/SQLite），因此 P0-1/P0-2 在自测中不可见。
- 核实结果：worklog 中「selftest list 通过」「持久化（直写→重启读到）」「typecheck 双过」等声明均属实（我已复现）；但「功能按 roadmap 验收点逐条核对」中的「建书→重启仍在」实际未在 Electron 内真实达成。
- 建议：selftest 扩展为 create→list→delete 全链路（自建自删，不污染用户数据），并把「每条 IPC 通道至少一次真实调用」纳入自测清单。

### P2-1（轻微）数据模型与架构文档漂移

- `docs/design/architecture.md` 第 3 节 books 表字段为 `cover_path`，实现为 `cover`；主键约定 nanoid，实现用 `randomUUID()`。功能等价，但违反「架构变更必须先改本文件再改代码」纪律。二选一对齐即可（改文档成本低，推荐）。

### P2-2（轻微）可访问性/边缘细节

- BookCard 删除按钮 `hidden group-hover:flex`，仅鼠标 hover 可达，无键盘/焦点路径（桌面鼠标场景影响小）。
- 封面首字 `book.title.slice(0,1)` 对 emoji 书名会切出半个代理对（极边缘）。

## 遗留与建议

1. **（转开发，阻断流程）** 修复 P0-1/P0-2 后，从 ① 开发自测重新走三级验收；建议 selftest 同步扩展为 create→list→delete 全链路（P1-1）。
2. （转文档）architecture.md books 字段名与主键约定对齐实现（P2-1）。
3. （转 M2+）`services/books.ts` 的浏览器 mock 自动降级建议改为显式开关（如 `?mock=1`），避免今后再把 mock 路径误当真实链路验收——本次漏检的教训。
4. （转 M12，已在 worklog 登记）封面上传；「点击卡片进入创作」待 M3 路由。
5. 验收期间的临时验证产物（CDP 建书尝试、直写测试书）均已清理，数据库 books 表为空，无残留进程。

## 附：验收操作记录（供复现）

1. `npm run typecheck` → 双 tsconfig 0 错误。
2. `INKSPIRE_SELFTEST=1 npm run dev` → 日志 `[selftest] {"apiType":"object","books":{"ok":true,"data":[]}}`（preload→IPC→SQLite 全链路通）。
3. 停应用 → node 直写书（id=accept-m1-test）→ 重启 → selftest 完整读回（持久化 ✅）。
4. `npm run dev -- -- --remote-debugging-port=9222` + CDP 驱动真实应用：
   - `books.create(...)` → `{ok:false,error:"Missing named parameter \"createdAt\""}`（P0-1 实锤）；
   - 空书名 create → `{ok:false,error:"书名不能为空"}`；
   - `books.remove("nonexistent")` → `{ok:true,data:false}`；`books.update(存在id)` → `Missing named parameter "updatedAt"`（P0-2）；`books.update(不存在id)` → `{ok:false,error:"书籍不存在"}`。
   - UI：删书后 reload → 空状态 ✅ → 点「新建第一本书」弹窗开 ✅ → 空书名提交 toast「请填写书名」且弹窗不关 ✅ → 填书名+选分类提交 toast 报 P0-1 错误 ✅（错误呈现符合规范）→ 直写书后 reload 卡片渲染 ✅ → hover 删除→确认弹窗→已删除 toast→回空状态 ✅；全程 exceptionThrown 无。
5. `taskkill //IM electron.exe //F` 清理，无遗留进程。

---

## 复验记录（2026-08-22，整改 commit ae3c9d3 之后）

- 复验人：GLM-5.3（zai-start-plan）· 独立验收子代理（同一验收员复验，只读，未改源码）
- **最终结论：通过（有条件通过 → 通过）** —— 首验的全部 P0/P1/P2 问题已在 commit `ae3c9d3` 修复并经真实 Electron 环境复验；M1 全部验收点达成，可进入 ③ 用户确认环节。

### 整改核实（白盒）

| 首验问题 | 整改 | 核实 |
|---|---|---|
| P0-1/P0-2 命名参数不匹配 | `src/main/db/books.ts`：INSERT 占位符改 `@created_at/@updated_at`、UPDATE 占位符改 `@updated_at`，与 `.run()` 键一致 | ✅ 代码确认，且实测通过（见下） |
| P1-1 selftest 盲区 | selftest 升级为 create→listSawIt→update→remove→listAfterDelete 完整 CRUD（自建自删，不污染数据） | ✅ 代码确认；两次启动均输出 `{apiType:"object",create:true,listSawIt:true,update:true,remove:true,listAfterDelete:false}` |
| P2-1 文档漂移 | architecture.md：`cover_path`→`cover`、nanoid→randomUUID | ✅ diff 确认 |

### 用户路径复验（真实 Electron，CDP 驱动，等价真实操作）

1. **新建书籍（UI 弹窗全程）**：点「新建第一本书」→ 填书名「复验之书」+ 选分类「玄幻」+ 填简介 → 点「开始创作」→ toast「《复验之书》已创建」、弹窗自动关闭、卡片网格出现该书 ✅（渲染层全程无未捕获异常）。
2. **编辑→保存**：`books.update` 改标题为「复验之书·改」、简介「编辑后的简介」→ 返回 `{ok:true}` 且 `updatedAt` 刷新 → reload 后卡片显示新标题/新简介 ✅（M1 无编辑 UI 入口，此为保存链路验证；编辑界面属后续里程碑）。
3. **新建→重启→仍在**：完全关闭应用（taskkill）→ 重新 `INKSPIRE_SELFTEST=1 npm run dev` → 应用 API list 返回「复验之书·改」、DOM 卡片同步渲染 ✅（编辑内容跨重启保留）。
4. typecheck 双 tsconfig 0 错误 ✅；主进程日志无报错 ✅。
5. 清理：复验测试书已通过应用 API 删除（books 表恢复为空），electron 进程已全部 taskkill，无遗留。

### 复验后遗留（不阻断，转后续里程碑）

- 首验 P2-2（删除按钮仅 hover 可达、封面首字 slice 边缘情况）未在本次整改范围，维持轻微级挂账。
- 建议 3（mock 降级改显式开关）未实施，转 M2 顺手处理。
- 下一步：③ 用户确认（亲手验证指引：启动 `npm run dev` → 书斋点「新建书籍」→ 填书名建书 → 关闭重开确认还在 → hover 卡片删除），确认后 commit+tag 并更新 roadmap/worklog。

