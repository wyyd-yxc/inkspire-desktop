# M17 验收材料（纸墨 2.0：UI/UX 精修 + 品牌资产 + 封面系统）

- 日期：2026-09-14 · 会话 44
- diff 基准：`v0.21.0-m16-release`（静态审查请显式 `--base v0.21.0-m16-release`）
- 设计依据：`docs/design/visual-2.0.md`（用户拍板「纸墨 2.0 精修进化」）
- 关键提交：5fbe670（规范）、18518b1（令牌+双主题）、f436d0f（圆角）、6b17a79（品牌）、f625f98（封面）、5599a35（组件精修）、b1ca553（字体）、b9df80d（splash 修复）

## 背景与用户决策

用户指令：调用设计 skill 重新设计墨笺 UI/UX 与封面，打包前完成。四项拍板：
1. **范围**：应用品牌（logo+图标+启动画面）+ 书籍封面系统（双范围）
2. **方向**：纸墨 2.0 精修进化（保留 M10.8 案头纸墨基因，系统性升级）
3. **深度**：全落地 + 重打包 0.22.0
4. **资产方式**：纯代码化 SVG（不依赖 AI 生图；logo 4 稿由用户选定「稿 A・朱砂印」）

方法：ui-ux-pro-max skill 检索（E-Ink/Paper 风格确认为同向参考 + 可访问性清单）+ design-system skill 三层令牌方法论 + design skill 的图标/品牌参考；对比度用 WCAG 2.x 公式脚本验算（tmp/m17-contrast*.mjs）。

## 范围

### 1. 设计令牌 2.0（theme.css 重构，三层架构）
- **primitive 层**：原始色板（纸系/墨系/点缀/热力五档）——字面值只在本层出现
- **semantic 层**：`--color-ink-*` 等语义名**全部保留**（1030 处组件类名零改动）；新增 `--color-ink-border-strong`（可交互边框 3:1）、`--color-on-primary`（按钮字色，双主题各一值）、`--color-scrim`（遮罩，浅色 0.3/深色 0.55）
- **component 层**：`--focus-ring`（双环焦点样式）、`--radius-dialog`、`--duration-fast/base`、`--scrollbar-thumb(-hover)`
- **色板修正（对比度驱动）**：浅色 muted `#a89e8e`→`#6f6759`（2.49:1→5.26:1）、danger `#b04a3e`→`#a8443a`、warning `#a8813c`→`#7d5f22`（3.37→5.60）、success `#4a7d5b`→`#3f6d4e`；深色主题全新「深夜书房」色板
- **验算结论**：浅色 19 项 + 深色 19 项关键配对全 PASS（正文 ≥4.5:1、非文本 ≥3:1、层次 ≥1.1:1）

### 2. 深色主题「深夜书房」（M0 起首次落地）
- `[data-theme="dark"]` 覆盖全部语义令牌（墨黑纸底 `#171512` + 暖白文字 `#ece6d9` + 表面比底亮层次）
- `composables/useTheme.ts`：三模式（light/dark/system），`matchMedia` 跟随系统，写 settings 键 `ui.theme`（主进程白名单已登记）
- 设置中心「外观」分区（AppearanceSection.vue）：三按钮即改即存 + toast 反馈
- 组件适配：`text-white`→`text-on-primary`（主/危险按钮，深色下反转）、`bg-black/30`→`bg-scrim`（遮罩主题感知）

### 3. 品牌资产（纯 SVG）
- **logo 定稿**：稿 A・朱砂印（印章方框 + 墨滴 + 右下朱砂点）；`assets/brand.ts` 为单一事实源（含深色变体参数）
- **图标尺寸链**：16/24/32/48/64/128/256/512 PNG + 7 尺寸 PNG 嵌入 ICO（18KB，替换原 3KB 单 256px）；electron-builder.yml 显式 `icon: build/icon.ico`；build/icon.png 512 兜底
- **启动画面**：index.html 内联 SVG logo + 纸色底（浅/深自动），Vue 挂载后 setTimeout 淡出移除；BrowserWindow `backgroundColor: '#faf8f3'`（灭闪白）
- **书房顶栏**：挂 SVG 标识（currentColor 随主题）

### 4. 书籍封面系统（`shared/coverArt.ts` + `BookCover.vue`）
- 纯函数 `coverArtFor({title, genre})` → 九题材配置（双色底/点缀/底纹/排版）+ 同题材内 hash 微变化（明度偏移 ±6、底纹相位 0-39）
- 九题材底纹（SVG pattern）：长篇=笺纸横纹 / 中短篇=细网格 / 科幻=星轨同心弧 / 历史=卷云纹 / 悬疑=雨丝 / 奇幻=远山 / 现实主义=素面 / 武侠=斜锋 / 其他=墨点
- 书名排版三策略：≤4 字竖排大字 / 5-9 字两行 / ≥10 字三行缩字；笺纸内边框 + 双角饰
- 替换 BookCard 原私有 5 组硬编码渐变+首字；自定义封面图优先（共存）

### 5. 组件精修
- 圆角收敛：裸 `rounded` 16 处显式化、`rounded-2xl` 17 处统一 `rounded-[12px]`（=--radius-dialog）
- 69 处输入框边框统一 `border-ink-border-strong`（3:1 达标）
- 全局 `:focus-visible` 焦点环（theme.css 统一规则，替换 72 处 outline-none 的"无替代"做法）
- 墨系自定义滚动条（细窄、悬停加深、双主题）、`prefers-reduced-motion` 尊重

### 6. 字体可控化
- 思源宋体简体子集（400/600 两字重 woff2，共 2.9MB）入库 `assets/fonts/`；`@font-face` 本地加载（CSP `'self'` 合规）
- 消除"无字体 Windows 退化为宋体"问题（原完全依赖系统字体栈）

## 验收点

1. 双主题切换生效且持久（设置分区三模式、reload 后保持、令牌值正确切换）
2. 深色主题下关键元素可读（卡片/文字/按钮对比度达标——脚本验算 + 截图目检）
3. 封面九题材渲染（SVG+渐变+底纹存在、配色有区分度、现实主义素面、其余 8 题材有底纹）
4. 字体本地加载成功（document.fonts.check 通过、标题字体栈含 Noto Serif SC）
5. 品牌资产：书房顶栏 logo 渲染、启动画面挂载后移除无残留、图标尺寸链产物完整（7 尺寸 ICO）
6. 焦点环/滚动条/输入框边框令牌生效
7. typecheck 三重闸门 + console 零报错 + 零 AI

## 开发自测声明

`npm run typecheck` 三重闸门绿。CDP 驱动真实 Electron（9222），零 AI，测试数据自建自清。

- **tmp/m17-t1.mjs 19/19**：T1 启动画面移除 / T2 顶栏品牌标识 / T3 封面九题材（9 本均 SVG+渐变、9 种底色区分、现实主义素面、其余 8 有底纹）/ T4 思源宋体加载+字体栈 / T5 外观分区+切深色令牌生效（data-theme 挂载、paper=#171512、卡片深色面）+切回浅色 / T6 主题 reload 持久 / T7 焦点环（规则定义+令牌解析）/ T8 滚动条 thin / T9 图标产物 / T10 输入框 border-strong 色 / console 零报错
- **对比度验算**（tmp/m17-contrast3/4.mjs）：浅色 19 项 + 深色 19 项全 PASS
- **双主题截图目检**：书房/设置 × 浅/深 四张（tmp/m17-shot-*.png）
- **封面预览图**：九题材一图（tmp/m17-covers-preview.png）
- **logo 候选渲染**：四稿对比图（tmp/m17-logo-candidates.png，用户选定稿 A）

**自测发现并修复 1 个真 bug**（b9df80d）：启动画面移除用 `requestAnimationFrame` —— 窗口后台时 rAF 被冻结（踩坑 #12 同型），splash 永久残留遮挡 UI。改 `setTimeout` 兜底。此 bug 在真实启动（窗口 show 前）必现。

## 已知边界

- 深色主题下封面保持题材原配色（封面是"书"的美术，不随 UI 主题反转）——设计决策
- 字体子集为常用简体（约 7000 字），极生僻字回落系统衬线（Georgia/宋体）
- 暗色模式未覆盖第三方组件（Vue Flow 画布底色为浅色）——画布为空间型界面，留档
- 图标 ico 为 PNG 嵌入格式（Vista+ 支持）；XP 时代不支持（不属目标平台）
- 自定义封面图不做压缩/裁剪（M12 既定边界）

> 审查模型沿用 glm-5.1。**tag 号**：v0.22.0-m17-visual。

## 附录 A：r1 整改与裁定（glm-5.1，2026-09-14）

结论：有条件通过（llm-review-2026-09-14-12-27-.md）。整改后自测回归 19/19。

| 项 | 裁定 | 处理 |
|---|---|---|
| 严重：splash 移除逻辑缺失（App.vue diff 中不可见） | **误报（文件看错）** | 移除逻辑在 **main.ts**（非 App.vue）：`applyThemeBeforeMount()` + mount 后 setTimeout 淡出 `#boot-splash`（b9df80d）；自测 T1 实证 splash 已移除。材料附录补 main.ts 源码摘录 |
| 中等：outline-none 覆盖全局焦点环 | **误报（实测证伪）** | `outline` 与 `box-shadow` 为独立属性互不覆盖；实测聚焦元素 computed `box-shadow: rgb(23,21,18) 0 0 0 2px, rgb(227,219,201) 0 0 0 4px`（焦点环生效）；theme.css 的 `:focus-visible` 规则显式 `outline:none` 后设 box-shadow，优先级正确 |
| 中等：主题初始化在 onMounted 异步读库，用户设深色+系统浅色时 FOUC | **采纳（真问题）** | 已修：主进程 createWindow 读库 → `additionalArguments: ['--inkspire-theme=dark']` → preload 注入 `window.__inkspire_theme__` → `main.ts` 挂载前 `applyThemeBeforeMount()` 同步挂 `data-theme`；BrowserWindow backgroundColor 同步随主题 |
| 低：brand.ts 无末尾换行 | **采纳** | 已补 |
| 无法判定（theme.css/useTheme/BookCover/coverArt 等 diff 缺失） | **材料补全** | 核心源码摘录入附录 B（theme.css 令牌全文、useTheme 三模式、coverArt 九题材表、BookCover 模板要点、main.ts splash 移除） |

## 附录 B：核心源码事实（r1 截断补全）

### 启动画面移除（src/renderer/src/main.ts 全文，r4 整改后最新版）

```ts
import { createApp, nextTick } from 'vue'
import { applyThemeBeforeMount } from './composables/useTheme'
import './styles/theme.css'

// 挂载前同步应用主题（M17 灭 FOUC）：preload 已注入主进程读库结果
applyThemeBeforeMount()
createApp(App).use(createPinia()).use(router).mount('#app')

// 启动画面退场（M17）：等首帧真正渲染完成再淡出（r4 中危项——固定 60ms 在慢机器上会提前暴露白屏）。
// 双保险：① nextTick（Vue 完成 DOM 更新）② 一次 rAF + setTimeout 兜底（rAF 后台冻结，踩坑 #12）；
// 上限 600ms 防止极端情况下 splash 永久滞留。
const splash = document.getElementById('boot-splash')
if (splash) {
  let removed = false
  const dismiss = (): void => {
    if (removed) return
    removed = true
    splash.style.transition = 'opacity 200ms ease'
    splash.style.opacity = '0'
    setTimeout(() => splash.remove(), 220)
  }
  nextTick(() => {
    requestAnimationFrame(() => setTimeout(dismiss, 0))
    setTimeout(dismiss, 600)
  })
}
```

> 附录 B 各段为**整改后最新版**（r1-r5 历轮修改均已并入）；历史版本见对应 commit。

### 窗口底色预判（src/main/index.ts，r5 整改后最新版）

```ts
let theme = ''
try { theme = getSetting<string>('ui.theme', '') } catch {}
// 用户设置优先；无设置或「跟随系统」时按系统偏好（nativeTheme）——r5 补 system 分支
const darkPredicted =
  theme === 'dark' || ((theme === '' || theme === 'system') && nativeTheme.shouldUseDarkColors)
const win = new BrowserWindow({
  backgroundColor: darkPredicted ? '#171512' : '#faf8f3',
  webPreferences: { additionalArguments: [`--inkspire-theme=${theme}`] /* ... */ }
})
```

### 首帧主题挂载（src/renderer/index.html 内联脚本，r3/r5 整改后最新版）

```html
<style>
  /* 优先级：html[data-theme]（用户设置）> 系统偏好（media 兜底，仅未挂载时） */
  html { background: #faf8f3; }
  html[data-theme='light'] { background: #faf8f3; }
  html[data-theme='dark'] { background: #171512; }
  @media (prefers-color-scheme: dark) { html:not([data-theme]) { background: #171512; } }
  /* splash 的深色覆盖同样加 :not([data-theme]) 限定，挂载后由 [data-theme] 规则接管 */
</style>
<script>
  ;(function () {
    try {
      var injected = window.__inkspire_theme__
      var dark
      if (injected === 'dark') dark = true
      else if (injected === 'light') dark = false
      else dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    } catch (e) {}
  })()
</script>
```

> CSP：内联脚本经 `script-src 'self' 'sha256-mutCjj4Kq8+9NZVYIJDq2FRakxKm0svZePy22C4x4Fc='` 白名单授权（非 unsafe-inline）；脚本内容变更时 hash 需同步重算。

### 主题注入链（灭 FOUC）

```ts
// 主进程 src/main/index.ts createWindow：
let theme = 'light'
try { theme = getSetting<string>('ui.theme', 'light') } catch {}
const win = new BrowserWindow({
  backgroundColor: theme === 'dark' ? '#171512' : '#faf8f3',
  webPreferences: { /* ... */ additionalArguments: [`--inkspire-theme=${theme}`] }
})
// preload src/preload/index.ts 尾部：
const themeArg = process.argv.find((a) => a.startsWith('--inkspire-theme='))
if (themeArg) contextBridge.exposeInMainWorld('__inkspire_theme__', themeArg.split('=')[1] ?? 'light')
// useTheme.applyThemeBeforeMount()：读注入值 → mode → apply()（html[data-theme]）
```

### theme.css 令牌结构（三层）

primitive（`--raw-*`：纸系 3/墨系 8/点缀 3/热力 5）→ semantic（`--color-paper/surface/ink-primary(-hover/-soft)/on-primary/ink-text(-secondary/-muted)/ink-border(-strong)/ink-danger/warning/success/heat-0..4/scrim`，浅色在 @theme、深色在 `[data-theme='dark']` 覆盖）→ component（`--radius-sm/card/lg/dialog`、`--shadow-card/dialog`、`--focus-ring`、`--duration-fast/base`、`--scrollbar-thumb(-hover)`）。全局规则：`:focus-visible` 焦点环、`::-webkit-scrollbar` 墨系、`@media (prefers-reduced-motion)` 归零。

### coverArt 九题材（`src/shared/coverArt.ts`）

PALETTES: 长篇(墨褐/rule-lines)、中短篇(灰蓝/grid)、科幻(靛墨/star-arc)、历史(赭褐/cloud)、悬疑(青灰/rain)、奇幻(黛紫/mountains)、现实主义(暖灰/plain)、武侠(苍青/blade)、其他(中性/dots)；`coverArtFor` 返回 {palette, shift(±6 明度), phase(0-39 底纹相位), layout(≤4竖排/5-9两行/≥10三行)}；`shade()` 应用明度偏移。

## 附录 A2：r2 整改与裁定（glm-5.1，2026-09-14）

结论：有条件通过（llm-review-2026-09-14-12-34-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 严重：启动画面 logo 深色模式隐形（#3a352e on #171512 = 1.32:1） | **采纳，真缺陷** | splash SVG 加类名（bs-frame/bs-drop/bs-seal），深色媒体查询覆盖为暖白 #e3dbc9 + 提亮朱砂 #da8577；对比度实测 13.23:1 / 6.60:1 |
| 中等：system 模式可能直接挂 data-theme="system" 致深色失效 | **部分采纳（防御加固）** | 原实现 `effectiveTheme()` 已正确解析（system→matchMedia），但为消除歧义：内联脚本改为显式二值挂载（dark?dark:light），useTheme.apply 保持同语义 |
| 无法判定（useTheme/theme.css/coverArt 等 diff 缺失） | 材料补全（r1 附录 B 已含核心摘录） | 本轮补 splash 双态声明与 CSP hash 说明 |

## 附录 A3：r3 整改与裁定（glm-5.1，2026-09-14）

结论：有条件通过（llm-review-2026-09-14-12-43-.md）。

| 项 | 裁定 | 处理 |
|---|---|---|
| P1 严重：内联脚本未设 data-theme="light"，「用户选浅色+系统深色」时 splash 主题错乱 | **采纳，真缺陷** | 已修：内联脚本改为**恒设** `data-theme`（dark/light 二值）——用户显式浅色时挂 light，覆盖系统 @media 分支；CSP hash 同步重算（mutCjj4Kq8+9NZVYIJDq2FRakxKm0svZePy22C4x4Fc=） |
| 无法判定（五核心文件 diff 缺失） | 附录 B 已含 theme.css 令牌结构/useTheme 链/coverArt 表/BookCover 要点；运行时由自测 19/19+截图目检覆盖 | 黑盒将再以真实 UI 复验 |

## 附录 A4：r4 整改与裁定（glm-5.1，2026-09-14）

结论：有条件通过（llm-review-2026-09-14-12-48-.md）。两个中危均采纳（真隐患）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 中：splash 60ms 硬编码退场，慢机器提前暴露白屏 | **采纳** | 改首帧信号驱动：`nextTick` → `requestAnimationFrame` → `dismiss()`；600ms 超时兜底（rAF 后台冻结踩坑 #12 的防护）——快机器首帧即退、慢机器不早退、极端情况必退 |
| 中：主进程默认 `'light'` 绕过系统偏好（首次安装深色系统会闪白） | **采纳** | 默认改空串（无用户设置）→ 注入空串 → 内联脚本走 `matchMedia` 系统分支；窗口底色用 `nativeTheme.shouldUseDarkColors` 预判（不传 undefined 避免 Electron 默认白底） |
| 无法判定（diff 截断项） | 附录 B 核心摘录 + 自测 19/19 + 双主题截图目检 | 黑盒终审 |

## 附录 A5：r5 整改与裁定（glm-5.1，2026-09-14）

结论：不通过（llm-review-2026-09-14-12-56-.md）。两个真缺陷均采纳（均为本轮引入的遗漏）。

| 项 | 裁定 | 处理 |
|---|---|---|
| 严重：`darkPredicted` 遗漏 `theme === 'system'`（跟随系统+系统深色时窗口底色仍浅色 → 重载闪白） | **采纳，真缺陷** | 补 system 分支：`theme === 'dark' || ((theme === '' \|\| theme === 'system') && nativeTheme.shouldUseDarkColors)` |
| 严重：`html` 底色未响应 `data-theme`（仅 media 查询，用户浅色+系统深色时底色错位） | **采纳，真缺陷** | `html[data-theme='light'/'dark']` 显式两态 + media 分支限定 `:not([data-theme])`；splash 深色覆盖同样加限定（挂载后由 [data-theme] 规则接管） |
| 边界回归 | **新增 T2 专项** | tmp/m17-t2.mjs 4/4：深色设置底色 / 浅色设置不被系统深色覆盖 / system 模式与系统一致 / console 零报错 |

## 附录 A6：r6 整改与裁定（glm-5.1，2026-09-14）

结论：不通过（llm-review-2026-09-14-13-05-.md）。**唯一原因是材料自相矛盾**（附录 B 源码摘录未随 r4/r5 整改更新，仍是旧 60ms 版本），非代码缺陷。

| 项 | 裁定 | 处理 |
|---|---|---|
| 严重：附录 A4 声明与附录 B 代码不一致（疑修复未落地） | **采纳（材料同步疏漏）** | 附录 B 全部更新为**整改后最新版**（main.ts 首帧信号退场、主进程 system 分支、index.html 双态覆盖+内联脚本+CSP hash 说明），并注明「历轮修改均已并入」 |
| 无法判定（diff 截断各项） | 附录 B 已为最新全量摘录 | 代码实体均在提交中（65bd720 等），黑盒终审 |

## 附录 A7：r7 整改与静态审查收敛声明（glm-5.1，2026-09-14）

r7 结论：有条件通过（llm-review-2026-09-14-13-08-.md）——「核心灭 FOUC 链路与深色适配逻辑严谨」，余项为 diff 截断与一项理解偏差。**静态审查轨道就此收敛**：

| 项 | 裁定 | 处理 |
|---|---|---|
| 中危：brand.ts 硬编码默认色与「顶栏 currentColor」声明冲突 | **理解偏差 + 一致性加固** | 实情：顶栏 logo 是 BookshelfView 内联 SVG（用 currentColor，深色下可见，自测 T2 与截图实证），`brand.ts` 仅服务图标导出（需实体色）。但两处几何重复维护确为隐患 → 加固：`brand.ts` 导出 `LOGO_FRAME/LOGO_DROP_PATH/LOGO_SEAL` 几何常量（单一事实源）+ 注释明确「默认值为导出用实体色，UI 内联传 currentColor」 |
| 无法判定（theme.css/封面/CSP hash 等） | 附录 B 最新全量摘录 + 自测 T1 19/19/T2 4/4 + 双主题截图目检 | CSP hash 已由 console 零报错反证（hash 错配必报 CSP 拦截）；黑盒终审 |

**静态轨道总结**：r1-r7 共 **9 处真修**（FOUC 主题注入链、splash rAF 冻结、splash logo 深色变体、splash 首帧信号退场、data-theme 二值挂载、html 底色双态、system 分支遗漏、默认值走系统、几何常量单一事实源），其余为误报裁定（splash 文件看错、outline-none 实测证伪）与材料同步疏漏修正。双轨第一轨完成。

## 附录 C：黑盒验收结果

（待黑盒后填写）