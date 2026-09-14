# 墨笺视觉规范 2.0（M17 纸墨 2.0）

> 状态：定稿（2026-09-13，会话 44）。本文件是 M17 视觉精修的**唯一设计依据**——令牌、组件、封面、品牌资产的取值与验收口径均以此为准。
> 定位：在 M10.8「案头纸墨」基因上系统性精修（用户拍板「纸墨 2.0 精修进化」），不换方向。

## 1. 设计原则

1. **纸墨为本**：暖米纸底 + 炭墨主色 + 一点朱砂（danger）与赭金（warning）作仅有的彩色点缀；去彩度、低饱和、无渐变滥用。
2. **阅读优先**：衬线只用于标题与正文编辑区（写作沉浸），UI 控件维持无衬线（清晰高效）。
3. **可访问性达标**：正文级文字对比度 ≥ 4.5:1、非文本 UI 组件 ≥ 3:1（全部关键配对已脚本验算，见 §3）；焦点可见；尊重 `prefers-reduced-motion`。
4. **令牌单源**：所有颜色/圆角/阴影/字号/时长只经 `theme.css` 令牌引用，组件零硬编码（存量 0 硬编码 hex 的纪律保持）。
5. **克制动效**：仅状态过渡（150-250ms），无装饰动画；纸感而非玻璃感（不引入 blur/glassmorphism）。
6. **暗色是"深夜书房"**：不是简单反色，而是墨黑纸底 + 暖白文字的夜间阅读体验；层次靠表面亮度差（surface 比 paper 亮）。

## 2. 令牌架构（三层）

```
primitive（原始值，@theme 内 :root 层）
  └─ semantic（语义别名，--color-ink-* 等；组件类名引用层，M17 不改名）
      └─ component（组件级，--btn-* / --focus-ring / --scrollbar-* 等新增）
```

### 2.1 语义色（浅色主题）

| 令牌 | 值 | 用途 | 变更 |
|---|---|---|---|
| `--color-paper` | `#faf8f3` | 全局底 | 不变 |
| `--color-surface` | `#fffefb` | 卡片面 | 不变 |
| `--color-ink-primary` | `#3a352e` | 主色/主按钮 | 不变 |
| `--color-ink-primary-hover` | `#26221b` | 主色悬停 | 不变 |
| `--color-ink-primary-soft` | `#f1ede2` | 选中态/浅底 | 不变 |
| `--color-ink-text` | `#2b2721` | 主文字 | 不变 |
| `--color-ink-text-secondary` | `#6d6558` | 次要文字 | 不变 |
| `--color-ink-text-muted` | **`#6f6759`** | 占位/辅助 | **改**（原 #a89e8e 仅 2.49:1 不达标） |
| `--color-ink-border` | `#e6dfd1` | 分隔线/边框 | 不变 |
| `--color-ink-border-strong` | **`#9a8f7c`** | 输入框/可交互边框 | **新增**（3:1 达标） |
| `--color-ink-danger` | **`#a8443a`** | 删除/错误 | **改**（原 #b04a3e 在 soft 底 4.61:1 边缘，加深） |
| `--color-ink-warning` | **`#7d5f22`** | 警示 | **改**（原 #a8813c 仅 3.37:1） |
| `--color-ink-success` | **`#3f6d4e`** | 成功 | **改**（原 #4a7d5b 在 soft 底 4.10:1） |
| `--color-heat-0..4` | 不变 | 热力图 5 档 | 不变 |

### 2.2 语义色（深色主题「深夜书房」）

| 令牌 | 值 | 说明 |
|---|---|---|
| `--color-paper` | `#171512` | 墨黑纸底 |
| `--color-surface` | `#292420` | 卡片面（比底亮，层次靠亮度） |
| `--color-ink-primary` | `#e3dbc9` | 主色反转为暖白（按钮底） |
| `--color-ink-primary-hover` | `#d3c9b4` | |
| `--color-ink-primary-soft` | `#332d26` | 选中态浅底 |
| `--color-ink-text` | `#ece6d9` | 主文字（暖白，非纯白防刺眼） |
| `--color-ink-text-secondary` | `#b8ae9c` | |
| `--color-ink-text-muted` | `#a49a88` | |
| `--color-ink-border` | `#3a342c` | |
| `--color-ink-border-strong` | `#7d7365` | |
| `--color-ink-danger` | `#da8577` | 提亮保可读 |
| `--color-ink-warning` | `#c9a35c` | |
| `--color-ink-success` | `#86b394` | |
| `--color-heat-0..4` | 反转（深底→亮格） | heat-0 `#26221c` … heat-4 `#e3dbc9` |
| `--color-on-primary` | `#241f18` | 主按钮上文字（浅色主题为 `#ffffff`） |

### 2.3 圆角标度（收敛六种混用）

| 令牌 | 值 | 映射存量 |
|---|---|---|
| `--radius-card` | 8px | `rounded-card`（不变）；裸 `rounded`(45处)→`rounded-lg`；`rounded-2xl`(17)/`rounded-xl`(6) 的**弹窗**改 card、**卡片**改 lg |
| `--radius-lg` | 8px | `rounded-lg`（152 处，语义=控件/卡片） |
| `--radius-sm` | 4px | `rounded-md`(7)/`rounded-sm`(2)→sm |
| `--radius-full` | 9999px | `rounded-full`（67 处，胶囊按钮/徽标，不变） |

> 执行口径：**不追求 1:1 替换，只消除"无令牌裸值"**——裸 `rounded` 全部显式化；`rounded-2xl` 仅弹窗容器保留（视觉上大圆角适合浮层）并纳入 component 令牌 `--radius-dialog: 12px`。

### 2.4 组件级令牌（新增）

```css
--focus-ring: 0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-ink-primary);
--radius-dialog: 12px;
--duration-fast: 120ms;   /* 微反馈：hover/active */
--duration-base: 200ms;   /* 常规过渡：面板/弹窗 */
--scrollbar-thumb: rgb(58 53 46 / 0.22);      /* 深色主题覆盖为 rgb(227 219 201 / 0.22) */
--scrollbar-thumb-hover: rgb(58 53 46 / 0.38);
```

## 3. 可访问性验收口径（脚本已验算，全部 PASS）

- **正文级（≥4.5:1）**：text/secondary/muted/danger/warning/success 对 paper、surface、primary-soft 三底；白字对 primary；深色主题 on-primary/on-danger 对各自按钮底。
- **非文本（≥3:1）**：`ink-border-strong` 对 surface（输入框/可交互边界）。
- **层次可辨（≥1.1:1）**：深色 surface vs paper、soft vs surface。
- **装饰级**：`ink-border` 分隔线（1.2:1 即可，不承载信息）。
- 验算脚本留档 `tmp/m17-contrast*.mjs`（WCAG 2.x 相对亮度公式）。
- **焦点**：全站交互元素 `:focus-visible` 显示 `--focus-ring`；移除"仅有 outline-none 无替代"的做法。
- **动效**：`@media (prefers-reduced-motion: reduce)` 下过渡时长归零。

## 4. 品牌资产规范

### 4.1 墨笺 logo
- **意象**：印章 × 墨滴 × 笺纸。构图为方形印章轮廓（圆角方框），内含一滴墨（或「墨」字篆意几何化）+ 右下角朱砂小印。
- **形式**：纯 SVG，单色炭墨主体 + 一点朱砂；无渐变、无描边过细（缩放清晰）。
- **变体**：主标（印章+文字「墨笺」横排，用于启动画面/关于）、纯图标（方形，用于任务栏/安装向导）。
- **尺寸链**：16/24/32/48/64/128/256/512 PNG（由 SVG 母稿在 Electron 内 canvas 导出）+ 多尺寸 ico 容器。
- 现有 `build/icon.ico`（3KB 单 256px）替换为完整尺寸链。

### 4.2 启动画面
- index.html 内联：paper 底色 + 居中 SVG 图标（无文字动画）+ 细进度点；`ready-to-show` 前可见，灭闪白（BrowserWindow `backgroundColor` 同步设为 paper 值）。

## 5. 书籍封面系统规范

### 5.1 结构（`src/shared/coverArt.ts` 纯函数）
```
coverArtFor(book: { title, genre }) → { palette, pattern, layout, accent }
```
- **palette**：题材驱动（九题材各一组墨系双色底 + 点缀色），确定性。
- **pattern**：题材底纹 SVG pattern id（见 5.2）。
- **layout**：书名排版策略（字数 ≤4 竖排大字 / 5-9 横排两行 / ≥10 缩字号三行）。
- **accent**：朱砂/赭金点缀位置（角饰或印点）。

### 5.2 九题材底纹与配色

| 题材 | 底纹意象 | 底色（深→浅双色） | 点缀 |
|---|---|---|---|
| 长篇 | 笺纸横纹 | 墨褐系 | 朱砂角印 |
| 中短篇 | 细网格 | 灰蓝系 | 墨点 |
| 科幻 | 星轨同心弧 | 靛墨系 | 冷白星点 |
| 历史 | 卷云纹 | 赭褐系 | 金 |
| 悬疑 | 雨丝斜线 | 青灰系 | 冷白 |
| 奇幻 | 远山层叠 | 黛紫系 | 微光 |
| 现实主义 | 素面留白 | 暖灰系 | 无 |
| 武侠 | 斜锋笔触 | 苍青系 | 朱砂 |
| 其他 | 素笺 | 中性墨系 | 墨点 |

> 全部低饱和墨系（延续 M10.8 plotStyle 降饱和纪律），底纹用 SVG `<pattern>`（≤2KB/个，内联渲染零网络）。

### 5.3 排版与共存
- 书名白色（深底上）或炭墨（浅底上）衬线，字距 0.05em；底边细笺纸边框线 + 角饰。
- 已有自定义封面（`books.cover`）时**优先显示图片**，无图时用新模板（替换 BookCard 现 5 组硬编码渐变）。

## 6. 组件规格

| 组件 | 规格 |
|---|---|
| 主按钮 | 底 `ink-primary`、字 `on-primary`、圆角 full、padding 8/16、hover `primary-hover`、focus ring、disabled opacity-50 |
| 次按钮 | 边框 `ink-border`（hover `primary`）、字 `text-secondary`（hover `primary`） |
| 危险按钮 | 字 `ink-danger`、hover 底 `danger/10` |
| 输入框 | 边框 `ink-border-strong`（focus 时 `ink-primary` + ring）、圆角 lg、底 surface |
| 弹窗 | 底 surface、圆角 `--radius-dialog`、遮罩 `bg-black/30`（深色主题 `bg-black/50`）、阴影加强 |
| 卡片 | `rounded-card bg-surface shadow-card` |
| 空状态 | 简笔 SVG 插画（墨线风格，1.5-2px stroke）+ 一行说明 + 主操作 |
| 图标 | 统一 2px stroke 线性风格（现有内联 SVG 增量统一） |

## 7. 执行与验收

- 令牌迁移后：全 10 页 + 画布在浅/深两主题下截图目检（tmp/m17-*.png）。
- 封面：九题材各渲染一断言（元素/配色/底纹存在）。
- 焦点：Tab 遍历关键页，断言 `:focus-visible` 环出现。
- 对比度：本文件 §3 配对脚本复跑全 PASS。
- 双轨验收（静态 glm-5.1 + 黑盒子代理）→ 0.22.0 重打包 → 覆盖安装验证新图标生效。