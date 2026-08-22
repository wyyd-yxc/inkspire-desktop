/**
 * Electron 主进程入口。
 * 职责：创建主窗口、注册 IPC 通道；后续数据库（better-sqlite3）与 AI 请求都在本进程内实现，
 * 渲染进程一律通过 preload 暴露的白名单 API 访问（见 docs/design/architecture.md）。
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { wrap } from './ipc/wrap'
import { registerBookIpc } from './ipc/books'

/** 创建应用主窗口（1280x800，中文标题「墨灵」）。 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: '墨灵',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // 自检开关（INKSPIRE_SELFTEST=1 时启用）：确认 preload 桥接与数据库全链路，结果打到主进程日志
  win.webContents.on('did-finish-load', () => {
    if (process.env.INKSPIRE_SELFTEST) {
      win.webContents
        .executeJavaScript(
          `(async () => {
            const apiType = typeof window.api
            const books = apiType === 'object' ? await window.api.books.list() : null
            return JSON.stringify({ apiType, books })
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

// 各业务域 IPC 注册（books / settings / ai / ... 随里程碑增加）
registerBookIpc()

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
