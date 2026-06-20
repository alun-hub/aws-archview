const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  })

  const distPath = path.join(__dirname, '../dist/index.html')

  if (app.isPackaged) {
    win.loadFile(distPath)
  } else {
    // In dev mode, load Vite dev server, fallback to built files if server is not up
    win.loadURL('http://localhost:5173').catch(() => {
      win.loadFile(distPath)
    })
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
