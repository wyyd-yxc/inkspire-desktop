/**
 * Electron 主进程入口。
 * 职责：创建主窗口、注册 IPC 通道；后续数据库（better-sqlite3）与 AI 请求都在本进程内实现，
 * 渲染进程一律通过 preload 暴露的白名单 API 访问（见 docs/design/architecture.md）。
 */
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'node:path'
import { wrap } from './ipc/wrap'
import { getSetting } from './db/settings'
import { registerBookIpc } from './ipc/books'
import { registerSettingsIpc } from './ipc/settings'
import { registerAiIpc } from './ipc/ai'
import { registerChapterIpc } from './ipc/chapters'
import { registerGenesisIpc } from './ipc/genesis'
import { registerWikiIpc } from './ipc/wiki'
import { registerSceneIpc } from './ipc/scenes'
import { registerSceneEdgeIpc } from './ipc/sceneEdges'
import { registerPlotIpc } from './ipc/plot'
import { registerInspirationIpc } from './ipc/inspirations'
import { registerStyleIpc } from './ipc/styles'
import { registerCoverIpc } from './ipc/covers'
import { registerStatsIpc } from './ipc/stats'
import { registerMemoryIpc } from './ipc/memories'
import { registerAssistantIpc } from './ipc/assistant'
import { registerSyncIpc } from './ipc/sync'
import { registerDigestIpc } from './ipc/digest'
import { registerBindingsIpc } from './ipc/bindings'

/** 创建应用主窗口（1280x800，中文标题「墨笺」）。 */
function createWindow(): void {
  // 主题随窗口参数注入（M17 灭 FOUC）：preload 同步读取，首帧前挂 data-theme。
  // 默认空串=无用户设置（首次安装）→ 内联脚本走系统偏好分支（r4 中危项修正）。
  let theme = ''
  try {
    theme = getSetting<string>('ui.theme', '')
  } catch {
    /* 库未就绪（理论不达）：空串回落系统偏好 */
  }
  // 窗口底色预判（灭闪白）：用户设置优先；无设置时按系统偏好（nativeTheme）
  const darkPredicted = theme === 'dark' || (theme === '' && nativeTheme.shouldUseDarkColors)
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: '墨笺',
    backgroundColor: darkPredicted ? '#171512' : '#faf8f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      additionalArguments: [`--inkspire-theme=${theme}`],
      // 写作应用：窗口后台时仍保持 AI 流式与自动保存的定时器运转
      backgroundThrottling: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 自检开关（INKSPIRE_SELFTEST=1 时启用）：完整 CRUD 全链路验证（含写路径），结果打到主进程日志
  win.webContents.on('did-finish-load', () => {
    if (process.env.INKSPIRE_SELFTEST) {
      win.webContents
        .executeJavaScript(
          `(async () => {
            const apiType = typeof window.api
            if (apiType !== 'object') return JSON.stringify({ apiType })
            const b = window.api.books
            const created = await b.create({ title: 'SELFTEST-临时', genre: '', description: '自检自动创建' })
            const id = created.ok ? created.data.id : ''
            const listSawIt = (await b.list()).data.some((x) => x.id === id)
            const updated = await b.update(id, { description: '自检更新' })
            const removed = await b.remove(id)
            const listAfterDelete = (await b.list()).data.some((x) => x.id === id)
            return JSON.stringify({
              apiType,
              create: created.ok,
              listSawIt,
              update: updated.ok,
              remove: removed.ok,
              listAfterDelete
            })
          })()`
        )
        .then((out: string) => console.log(`[selftest] ${out}`))
        .catch((err: unknown) => console.error('[selftest] 检查失败:', err))
    }
  })

  // 开发模式加载 electron-vite 的 dev server；生产模式加载打包后的静态文件
  if (process.env.ELECTRON_RENDERER_URL) {
    win
      .loadURL(process.env.ELECTRON_RENDERER_URL)
      .catch((err: unknown) => console.error('[main] 加载 dev server 失败:', err))
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win
      .loadFile(join(__dirname, '../renderer/index.html'))
      .catch((err: unknown) => console.error('[main] 加载页面失败:', err))
  }
}

// IPC 通道：app:ping —— 通路自检
ipcMain.handle('app:ping', () => wrap(() => 'pong'))

// 各业务域 IPC 注册（books / settings / ai / chapters / ... 随里程碑增加）
registerBookIpc()
registerSettingsIpc()
registerAiIpc()
registerChapterIpc()
registerGenesisIpc()
registerWikiIpc()
registerSceneIpc()
registerSceneEdgeIpc()
registerPlotIpc()
registerInspirationIpc()
registerStyleIpc()
registerCoverIpc()
registerStatsIpc()
registerMemoryIpc()
registerAssistantIpc()
registerSyncIpc()
registerDigestIpc()
registerBindingsIpc()

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    // macOS 上点击 Dock 图标且无窗口时重建窗口（Windows 不触发）
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Windows/Linux 关闭所有窗口即退出；macOS 保留激活态
  if (process.platform !== 'darwin') app.quit()
})
