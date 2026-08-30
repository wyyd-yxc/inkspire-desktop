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
