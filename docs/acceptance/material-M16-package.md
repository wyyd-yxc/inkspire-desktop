# M16 打包发布 — 验收材料

## 里程碑与范围
M16 将应用打包为 Windows 开箱即用软件：NSIS 安装包 + 免安装目录。应用版本号 0.1.0 → 0.6.0（与里程碑对齐）。

## 交付物
- `dist/InkSpire-Setup-0.6.0.exe`（约 111 MB，NSIS 安装包，非单击版、可选安装目录、快捷方式名「墨灵」）
- `dist/win-unpacked/`（免安装目录，InkSpire.exe）
- 应用图标 `build/icon.ico`（程序化生成：罗兰紫圆角底 + 白色墨滴，256x256 PNG-in-ICO）
- electron-builder.yml 新增 `npmRebuild: false`（better-sqlite3 NAPI 预编译跨 ABI，无需重编译；机器无 Python/VS 环境）

## 验收点
1. 构建产物齐全：安装包 exe + blockmap + win-unpacked
2. 原生模块正确打包：better-sqlite3 的 win32-x64.node 在 app.asar.unpacked 中
3. 打包版烟测（win-unpacked\InkSpire.exe --remote-debugging-port=9223，CDP 驱动）：
   - preload 注入（window.api=object）、SQLite 原生模块加载（books.list ok）
   - 写路径：建书→列表可见→删除 ✓
   - 默认档案为「GMI Cloud · MiniMax M3」，经打包产物真实流式对话成功（回复「打包成功」）
4. 应用图标生效、标题「墨灵」、版本 0.6.0
5. 数据目录：%APPDATA%/inkspire-desktop（与开发期共享；档案已就绪，用户安装后无需重新配置 AI）
6. NSIS 静默安装（/S）→ 安装后应用可启动、可写作；卸载入口存在

## 开发自测声明（已执行）
- 构建三次失败排查：① node-gyp 缺 Python → npmRebuild:false；② GitHub 下载 Electron zip 超时 → ELECTRON_MIRROR 镜像；③ 同前 → 补 ELECTRON_BUILDER_BINARIES_MIRROR；最终构建成功
- 烟测全过（见验收点 3，tmp/packaged-smoke.mjs），测试书已删、无残留进程
- 图标程序化生成并视觉校验（tmp/icon-preview.png）

## 已知边界
- 未做代码签名（自签名占位；Windows SmartScreen 可能提示「未知发布者」，用户点「仍要运行」即可）
- 未做自动更新（electron-updater 未引入，后续里程碑）
- 安装包未含 API 档案预置——但 userData 与开发期共享，本机安装即有档案；全新机器需在设置中心手动配置一次

## 补充硬证据（应用户/审查要求附加）

### A. dist/ 产物清单与校验

```
builder-debug.yml                            0.0 MB  sha256:0293dac4aba1e35a…
InkSpire-Setup-0.6.0.exe                     111.3 MB  sha256:8f67ba007967d517…
InkSpire-Setup-0.6.0.exe.blockmap            0.1 MB  sha256:026dfcd8779f2476…
win-unpacked                                 [dir]
```

### B. 关键文件 .node 存在性

```
dist/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/win32-x64.node => true (1943 KB)
```

### C. 打包版烟测输出（tmp/packaged-smoke.mjs，源码在仓库 tmp/ 目录）

```
基础链路: {"apiType":"object","sqlite":"ok(0 本)","title":"墨灵"}
写路径: {"created":true,"foundInList":true,"deleted":true}
AI 流式: {"model":"MiniMaxAI/MiniMax-M3","text":"打包成功","err":""}
=== 烟测结论: 通过 ===
```

### D. 边界与审查意见回应

- **ABI 匹配**：better-sqlite3 13 为 NAPI（跨 ABI 稳定），且烟测在打包产物内实际加载成功（books.list ok）即运行时证明
- **图标多尺寸**：单尺寸 256x256 PNG-in-ICO，Windows 自动缩放各 DPI；多尺寸精修挂后续
- **全新 VM 测试 / 升级迁移 / SmartScreen**：本机无全新 Windows VM，静态审查此要求超出当前条件——以本机静默安装+启动验证替代（见黑盒验收）；数据迁移：0.6.0 为首个安装包，无旧安装版数据需迁移（开发/安装共享 userData 已说明）；SmartScreen 未签名提示为已知边界，交付说明中已向用户注明
- **userData 共享机制**：Electron app.getName() 取自打包后 package.json 的 name 字段（inkspire-desktop），dev 与安装版天然共享 %APPDATA%/inkspire-desktop，故本机安装后档案（GMI Cloud 默认）即席可用

## 补正材料（第二轮审查必须项 1/3/4 + 建议项 6）

### E. 打包配置最终内容

```yaml
# electron-builder 打包配置（NSIS 安装包）
appId: cn.inkspire.desktop
productName: 墨灵
# better-sqlite3 使用 NAPI 预编译二进制（跨 ABI），无需 node-gyp 重编译
#（机器无 Python/VS 编译环境，rebuild 必失败；dev 模式已验证预编译二进制在 Electron 内正常）
npmRebuild: false
directories:
  buildResources: build
files:
  - out/**
  - "!**/.vscode/*"
  - "!src/*"
  - "!electron.vite.config.{js,ts,mjs,cjs}"
  - "!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}"
  - "!{.env,.env.*,.npmrc,pnpm-lock.yaml,yarn.lock}"
asarUnpack:
  - resources/**
win:
  target:
    - nsis
  executableName: InkSpire
nsis:
  artifactName: InkSpire-Setup-${version}.exe
  oneClick: false
  allowToChangeInstallationDirectory: true
  shortcutName: 墨灵
```

```json（关键字段：version=0.6.0, name=inkspire-desktop → userData/%APPDATA%/inkspire-desktop, main=out/main/index.js）
{
 "name": "inkspire-desktop",
 "version": "0.6.0",
 "description": "墨灵桌面版 —— AI 驱动的小说创作工作台（复刻自 inkspires.cn，本地数据 + 自定义 AI API）",
 "main": "./out/main/index.js",
 "author": "inkspire-dev",
 "private": true,
 "scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
  "start": "electron-vite preview",
  "dist": "electron-vite build && electron-builder",
  "postinstall": "electron-builder install-app-deps"
 },
 "devDependencies": {
  "@tailwindcss/vite": "^4.3.3",
  "@types/better-sqlite3": "^9.6.0",
  "@vitejs/plugin-vue": "^6.0.8",
  "electron": "^43.4.1",
  "electron-builder": "^26.15.3",
  "electron-vite": "^5.0.0",
  "tailwindcss": "^4.3.3",
  "typescript": "^7.0.2"
 },
 "dependencies": {
  "@tiptap/pm": "^3.30.2",
  "@tiptap/starter-kit": "^3.30.2",
  "@tiptap/vue-3": "^3.30.2
…```

### F. 打包版烟测脚本全文（tmp/packaged-smoke.mjs，仓库 tmp/ 目录）

```js
/** 打包版烟测：窗口启动 + SQLite 原生模块 + 建书 + 默认档案 + AI 流式（走打包产物） */
const BASE = 'http://127.0.0.1:9223'

async function main() {
  // 等 CDP 端口就绪
  let targets = null
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      targets = await (await fetch(`${BASE}/json`)).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch {}
  }
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('未找到应用页面: ' + JSON.stringify(targets?.map((t) => t.url)))

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let seq = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result)
    }
  }
  const send = (method, params) =>
    new Promise((res, rej) => {
      const id = ++seq
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const ev = (expression) =>
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then(
      (r) => r.result.value
    )
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  await sleep(2000)

  // 1) 基础链路：preload + SQLite 原生模块
  const basic = await ev(`(async () => {
    const apiType = typeof window.api;
    let sqlite = 'fail';
    try {
      const books = await window.api.books.list();
      sqlite = books.ok ? 'ok(' + books.data.length + ' 本)' : books.error;
    } catch (e) { sqlite = 'throw: ' + e.message; }
    return { apiType, sqlite, title: document.title };
  })()`)
  console.log('基础链路:', JSON.stringify(basic))

  // 2) 建书 → 列表 → 删除（写路径）
  const writePath = await ev(`(async () => {
    const c = await window.api.books.create({ title: '打包版烟测', genre: '玄幻', description: '' });
    if (!c.ok) return { fail: c.error };
    const list = await window.api.books.list();
    const found = list.data.some((b) => b.id === c.data.id);
    const del = await window.api.books.remove(c.data.id);
    return { created: true, foundInList: found, deleted: del.ok };
  })()`)
  console.log('写路径:', JSON.stringify(writePath))

  // 3) 默认档案 + AI 流式（打包内真实请求 MiniMax M3）
  const ai = await ev(`(async () => {
    const list = await window.api.apiProfiles.list();
    if (!list.ok || list.data.length === 0) return { fail: '无档案' };
    const def = await window.api.settings.get('ai.default_profile_id', '');
    const d = list.data.find((p) => p.id === def.data) || list.data[0];
    const stream = await window.api.ai.chatStream({
      profileId: d.id,
      messages: [{ role: 'user', content: '只回复四个字：打包成功' }]
    });
    if (!stream.ok) return { fail: stream.error };
    return await new Promise((resolve) => {
      let text = '', err = '';
      let unsub;
      const finish = () => { if (unsub) unsub(); resolve({ model: d.model, text: text.slice(0, 40), err }); };
      unsub = window.api.ai.onStreamEvent((e) => {
        if (e.requestId !== stream.data.requestId) return;
        if (e.type === 'chunk') text += e.text;
        if (e.type === 'error') { err = e.message; finish(); }
        if (e.type === 'done') finish();
      });
      setTimeout(() => { err = err || '(超时)'; finish(); }, 120000);
    });
  })()`)
  console.log('AI 流式:', JSON.stringify(ai))

  ws.close()
  const ok =
    basic.apiType === 'object' &&
    String(basic.sqlite).startsWith('ok') &&
    writePath.created && writePath.foundInList && writePath.deleted &&
    ai.text && !ai.err
  console.log('=== 烟测结论:', ok ? '通过' : '不通过', '===')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})

```

> targets 发现方式：`fetch http://127.0.0.1:9223/json` 取 type=page（打包版以 file:// 协议加载 out/renderer/index.html）。

### G. SQL 回环澄清（回应「仅覆盖 SELECT 空表」）

烟测「写路径」一步经应用 IPC 完整执行了 INSERT（books.create）→ SELECT（books.list 且 foundInList=true）→ DELETE（remove.ok=true），即完整增删查回环，非只读空表。

### H. diff 截断说明

--base v0.5.0 的 diff 含 M5+M16 全部变更（超 1.5 万字被截断），electron-builder.yml/package.json 未出现在截断窗口内——现已在 E 节补交全文。

### I. userData 实证（回应 P2）

```
%APPDATA%/inkspire-desktop/ 内容：
  DevToolsActivePort            0 KB
  DIPS                          36 KB
  DIPS-wal                      8 KB
  inkspire.sqlite               116 KB
  inkspire.sqlite-shm           32 KB
  inkspire.sqlite-wal           40 KB
  Local State                   0 KB
  Preferences                   1 KB
  SharedStorage                 4 KB
  SharedStorage-wal             0 KB
```

默认档案落盘位置验证：
```
DB 路径: C:\Users\Administrator.DESKTOP-GRPRATA\AppData\Roaming\inkspire-desktop/inkspire.sqlite（app.asar 外，用户数据区）
默认档案: GMI Cloud · MiniMax M3 | MiniMaxAI/MiniMax-M3 | https://api.gmi-serving.com/v1
=> 该档案存储于 userData 数据库，非 app.asar 内置，实证「userData 与开发期共享、安装后即席可用」
```
### J. NSIS 安装实证（回应 P3，黑盒验收 2026-08-30-M16-package.md）

```
- 静默安装 /S 退出码 0
- 安装路径: C:/Users/Administrator.DESKTOP-GRPRATA/AppData/Local/Programs/InkSpire/InkSpire.exe
- 卸载入口: Uninstall InkSpire.exe + HKCU 注册表项 + 开始菜单「墨灵.lnk」
- 安装版 CDP 验证: window.api 注入 / books.list ok / 标题「墨灵」/ UA inkspire-desktop/0.6.0
- 设置中心: 「GMI Cloud · MiniMax M3」默认徽标 + 「基元律动（ZCode 同款）」均在（userData 共享实证——这些档案由开发侧写入 userData，安装版直接读到）
- 安装版 AI 流式: MiniMax M3 真实对话返回「安装成功」，无错误
- 图标: exe 提取图标为罗兰紫底白墨滴（非 Electron 默认）
```
