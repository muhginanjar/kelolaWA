import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIconTemplate from '../../resources/trayIconTemplate.png?asset'
import { Sidecar, type AppSettings, type Account } from './sidecar'
import { AccountManager } from './accounts'

// Must run before app.whenReady() to affect the macOS menu bar app name and the
// About panel; has no effect in unpackaged dev mode, where macOS always shows the
// literal Electron.app bundle's name ("Electron") regardless of this call.
app.setName('kelolaWA')

const DEFAULT_SETTINGS: AppSettings = {
  minimizeToTray: true,
  launchAtLogin: 'no',
  windowBounds: { width: 1100, height: 750 },
  accounts: []
}

const START_MINIMIZED_FLAG = '--start-minimized'

function applyLoginItemSettings(): void {
  // macOS refuses login-item registration for an unsigned, unpackaged dev build
  // ("operation not permitted"); this only actually takes effect once packaged.
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin !== 'no',
      openAsHidden: settings.launchAtLogin === 'minimized',
      args: settings.launchAtLogin === 'minimized' ? [START_MINIMIZED_FLAG] : []
    })
  } catch (err) {
    console.error('[login-item] failed to apply:', err)
  }
}

function shouldStartMinimized(): boolean {
  if (process.argv.includes(START_MINIMIZED_FLAG)) return true
  // macOS reports this separately from argv when launched as a hidden login item.
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden
}

const sidecar = new Sidecar()
let settings: AppSettings = DEFAULT_SETTINGS
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let accountManager: AccountManager | null = null
let tray: Tray | null = null
let isQuitting = false
let boundsSaveTimeout: ReturnType<typeof setTimeout> | null = null

async function loadSettings(): Promise<void> {
  try {
    settings = await sidecar.getSettings()
  } catch (err) {
    console.error('[settings] falling back to defaults:', err)
    settings = DEFAULT_SETTINGS
  }
}

// First run (or upgrade from the single-account MVP): create a default account
// that uses Electron's default session, so any already-logged-in WhatsApp
// session carries over instead of forcing a fresh QR scan.
async function ensureDefaultAccount(): Promise<void> {
  if (settings.accounts.length > 0) return
  const defaultAccount: Account = { id: randomUUID(), name: 'Akun 1' }
  settings.accounts = [defaultAccount]
  settings.activeAccountId = defaultAccount.id
  try {
    settings = await sidecar.setSettings({
      accounts: settings.accounts,
      activeAccountId: settings.activeAccountId
    })
  } catch (err) {
    console.error('[settings] failed to persist default account:', err)
  }
}

function activeAccount(): Account | undefined {
  return settings.accounts.find((a) => a.id === settings.activeAccountId)
}

function switchToAccount(id: string): void {
  const account = settings.accounts.find((a) => a.id === id)
  if (!account || !accountManager) return
  accountManager.switchTo(account)
  settings.activeAccountId = id
  mainWindow?.webContents.send('accounts:active-changed', id)
  sidecar.setSettings({ activeAccountId: id }).catch((err) => {
    console.error('[settings] failed to save active account:', err)
  })
}

function cycleAccount(direction: 1 | -1): void {
  if (settings.accounts.length < 2) return
  const currentIndex = settings.accounts.findIndex((a) => a.id === settings.activeAccountId)
  const nextIndex = (currentIndex + direction + settings.accounts.length) % settings.accounts.length
  const next = settings.accounts[nextIndex]
  if (next) switchToAccount(next.id)
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function toggleMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible()) mainWindow.hide()
  else showMainWindow()
}

function saveWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  settings.windowBounds = bounds
  sidecar.setSettings({ windowBounds: bounds }).catch((err) => {
    console.error('[settings] failed to save window bounds:', err)
  })
}

function saveWindowBoundsDebounced(): void {
  if (boundsSaveTimeout) clearTimeout(boundsSaveTimeout)
  boundsSaveTimeout = setTimeout(saveWindowBounds, 500)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: settings.windowBounds.width,
    height: settings.windowBounds.height,
    x: settings.windowBounds.x,
    y: settings.windowBounds.y,
    show: false,
    autoHideMenuBar: true,
    title: 'kelolaWA',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!shouldStartMinimized()) mainWindow?.show()
  })

  mainWindow.on('resize', saveWindowBoundsDebounced)
  mainWindow.on('move', saveWindowBoundsDebounced)

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    } else {
      saveWindowBounds()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  accountManager = new AccountManager(mainWindow, cycleAccount)
  const account = activeAccount()
  if (account) accountManager.switchTo(account)

  // Connect every other account in the background too, so all of them stay
  // synced and can still fire notifications while a different one is shown.
  for (const other of settings.accounts) {
    if (other.id !== account?.id) accountManager.preload(other)
  }
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 440,
    resizable: false,
    title: 'Pengaturan - kelolaWA',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

function updateTrayMenu(): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: 'Buka WhatsApp', click: () => showMainWindow() },
    { label: 'Muat Ulang', click: () => accountManager?.reloadActive() },
    { label: 'Pengaturan', click: () => openSettingsWindow() },
    { type: 'separator' },
    {
      label: 'Minimize ke tray saat ditutup',
      type: 'checkbox',
      checked: settings.minimizeToTray,
      click: (item) => {
        settings.minimizeToTray = item.checked
        sidecar.setSettings({ minimizeToTray: item.checked }).catch((err) => {
          console.error('[settings] failed to save minimizeToTray:', err)
        })
      }
    },
    { type: 'separator' },
    {
      label: 'Keluar',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

function createTray(): void {
  // macOS menu-bar icons should be a plain transparent-background silhouette, not the
  // full-color app icon, so it sits correctly next to the system's own tray icons.
  // Pre-sized to 22/44px (@2x) on disk instead of resized at runtime, since resizing
  // via nativeImage.resize() was flattening the alpha channel into a solid square.
  const trayIcon = nativeImage.createFromPath(trayIconTemplate)
  if (process.platform === 'darwin') trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip('kelolaWA')
  tray.on('click', () => toggleMainWindow())
  updateTrayMenu()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.kelolawa.app')
  app.dock?.setIcon(nativeImage.createFromPath(icon))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  sidecar.start()
  await loadSettings()
  await ensureDefaultAccount()
  applyLoginItemSettings()

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', async (_event, partial: Partial<AppSettings>) => {
    settings = { ...settings, ...partial }
    updateTrayMenu()
    if (partial.launchAtLogin) applyLoginItemSettings()
    try {
      settings = await sidecar.setSettings(partial)
    } catch (err) {
      console.error('[settings] set failed, keeping optimistic value:', err)
    }
    return settings
  })

  ipcMain.handle('accounts:list', () => ({
    accounts: settings.accounts,
    activeAccountId: settings.activeAccountId
  }))

  ipcMain.handle('accounts:switch', (_event, id: string) => switchToAccount(id))

  ipcMain.handle('accounts:add', async (_event, name: string) => {
    const account: Account = {
      id: randomUUID(),
      name: name.trim() || `Akun ${settings.accounts.length + 1}`,
      partition: `persist:account-${randomUUID()}`
    }
    settings.accounts = [...settings.accounts, account]
    settings.activeAccountId = account.id
    accountManager?.switchTo(account)
    try {
      settings = await sidecar.setSettings({
        accounts: settings.accounts,
        activeAccountId: settings.activeAccountId
      })
    } catch (err) {
      console.error('[settings] failed to persist new account:', err)
    }
    return { accounts: settings.accounts, activeAccountId: settings.activeAccountId }
  })

  ipcMain.handle('accounts:remove', async (_event, id: string) => {
    accountManager?.remove(id)
    settings.accounts = settings.accounts.filter((a) => a.id !== id)
    if (settings.activeAccountId === id) {
      const next = settings.accounts[0]
      settings.activeAccountId = next?.id
      if (next) accountManager?.switchTo(next)
    }
    try {
      settings = await sidecar.setSettings({
        accounts: settings.accounts,
        activeAccountId: settings.activeAccountId
      })
    } catch (err) {
      console.error('[settings] failed to persist account removal:', err)
    }
    return { accounts: settings.accounts, activeAccountId: settings.activeAccountId }
  })

  ipcMain.handle('accounts:rename', async (_event, id: string, name: string) => {
    const account = settings.accounts.find((a) => a.id === id)
    const trimmed = name.trim()
    if (account && trimmed) {
      account.name = trimmed
      settings.accounts = [...settings.accounts]
      try {
        settings = await sidecar.setSettings({ accounts: settings.accounts })
      } catch (err) {
        console.error('[settings] failed to persist account rename:', err)
      }
    }
    return { accounts: settings.accounts, activeAccountId: settings.activeAccountId }
  })

  ipcMain.on('shell:open-settings', () => openSettingsWindow())

  ipcMain.on('wa:online', (_event, accountId: string) => {
    accountManager?.reload(accountId)
  })

  ipcMain.on('wa:notification-click', (_event, accountId: string) => {
    switchToAccount(accountId)
    showMainWindow()
  })

  createMainWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    else showMainWindow()
  })
})

app.on('window-all-closed', () => {
  // Main window hides to tray instead of closing; only an explicit "Keluar"
  // from the tray menu (which calls app.quit()) should end the process.
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  sidecar.stop()
})
