/**
 * Electron 主进程入口。
 * 职责：创建主窗口、注册 IPC 通道；后续数据库（better-sqlite3）与 AI 请求都在本进程内实现，
 * 渲染进程一律通过 preload 暴露的白名单 API 访问（见 docs/design/architecture.md）。
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

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
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // 开发模式加载 electron-vite 的 dev server；生产模式加载打包后的静态文件
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC 通道：app:ping —— M0 用于验证「渲染进程 ↔ 主进程」通路是否正常
ipcMain.handle('app:ping', () => 'pong')

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
