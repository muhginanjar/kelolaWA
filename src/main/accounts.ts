import { BrowserWindow, WebContentsView, shell } from 'electron'
import { join } from 'path'
import type { Account } from './sidecar'

const WHATSAPP_URL = 'https://web.whatsapp.com'
const RAIL_WIDTH = 72
// WhatsApp Web rejects/limits non-mainstream user agents; impersonate a recent desktop Chrome.
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

// Wraps the page's own Notification so WhatsApp's click-to-open-chat behavior keeps
// working, while also telling the main process which account + to bring the window forward.
// Also reports the browser's own online/offline transitions so a force-reload can
// recover WhatsApp Web from a stuck "connecting..." state once the network is back,
// without touching cookies/localStorage (a reload keeps the session logged in).
const PAGE_BRIDGE_SCRIPT = `(() => {
  if (window.__waBridgePatched) return
  window.__waBridgePatched = true
  const NativeNotification = window.Notification
  function PatchedNotification(title, options) {
    const instance = new NativeNotification(title, options)
    instance.addEventListener('click', () => {
      if (window.waBridge) window.waBridge.notifyClick()
    })
    return instance
  }
  PatchedNotification.permission = NativeNotification.permission
  PatchedNotification.requestPermission = NativeNotification.requestPermission.bind(NativeNotification)
  window.Notification = PatchedNotification

  window.addEventListener('online', () => {
    if (window.waBridge) window.waBridge.notifyOnline()
  })
})()`

// WhatsApp Web prefixes the page title with the unread-chat count, e.g. "(3) WhatsApp".
const UNREAD_TITLE_PATTERN = /^\((\d+)\)/

export class AccountManager {
  private views = new Map<string, WebContentsView>()
  private unread = new Map<string, number>()
  private activeId: string | null = null

  constructor(
    private window: BrowserWindow,
    private onUnreadChange: () => void
  ) {
    this.window.on('resize', () => this.layoutActive())
  }

  private ensure(account: Account): WebContentsView {
    let view = this.views.get(account.id)
    if (view) return view

    view = new WebContentsView({
      webPreferences: {
        partition: account.partition,
        preload: join(__dirname, '../preload/whatsapp.js'),
        additionalArguments: [`--wa-account-id=${account.id}`],
        sandbox: false
      }
    })
    view.webContents.setUserAgent(DESKTOP_USER_AGENT)

    // Grant notifications (native alerts) and media (camera/mic for voice & video
    // calls), deny everything else by default.
    const allowedPermissions = new Set(['notifications', 'media'])
    view.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(allowedPermissions.has(permission))
    })
    view.webContents.session.setPermissionCheckHandler((_wc, permission) =>
      allowedPermissions.has(permission)
    )

    view.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })
    view.webContents.on('did-finish-load', () => {
      view?.webContents.executeJavaScript(PAGE_BRIDGE_SCRIPT).catch((err) => {
        console.error('[page-bridge] failed to inject:', err)
      })
    })
    view.webContents.on('page-title-updated', (_event, title) => {
      const match = UNREAD_TITLE_PATTERN.exec(title)
      this.setUnread(account.id, match ? Number(match[1]) : 0)
    })
    view.webContents.loadURL(WHATSAPP_URL)

    this.views.set(account.id, view)
    return view
  }

  private setUnread(id: string, count: number): void {
    if ((this.unread.get(id) ?? 0) === count) return
    this.unread.set(id, count)
    this.onUnreadChange()
  }

  unreadCounts(): Record<string, number> {
    return Object.fromEntries(this.unread)
  }

  totalUnread(): number {
    let total = 0
    for (const count of this.unread.values()) total += count
    return total
  }

  // Creates (and starts loading/connecting) the view without making it visible,
  // so background accounts stay synced and their notifications keep firing even
  // while a different account is the one shown on screen.
  preload(account: Account): void {
    this.ensure(account)
  }

  switchTo(account: Account): void {
    const view = this.ensure(account)
    if (this.activeId && this.activeId !== account.id) {
      const prev = this.views.get(this.activeId)
      if (prev) this.window.contentView.removeChildView(prev)
    }
    this.activeId = account.id
    this.window.contentView.addChildView(view)
    this.layoutActive()
  }

  // Deep-links a specific account straight to a chat (from a whatsapp:// link).
  openChat(id: string, phone?: string, text?: string): void {
    const view = this.views.get(id)
    if (!view) return
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    if (text) params.set('text', text)
    const query = params.toString()
    view.webContents.loadURL(`https://web.whatsapp.com/send${query ? `?${query}` : ''}`)
  }

  // Reloads the page in place (same as a browser refresh) — cookies, localStorage
  // and IndexedDB survive, so the WhatsApp session stays logged in.
  reload(id: string): void {
    this.views.get(id)?.webContents.reload()
  }

  reloadActive(): void {
    if (this.activeId) this.reload(this.activeId)
  }

  remove(id: string): void {
    const view = this.views.get(id)
    if (!view) return
    this.window.contentView.removeChildView(view)
    view.webContents.close()
    this.views.delete(id)
    if (this.activeId === id) this.activeId = null
    if (this.unread.delete(id)) this.onUnreadChange()
  }

  layoutActive(): void {
    if (!this.activeId) return
    const view = this.views.get(this.activeId)
    if (!view) return
    const { width, height } = this.window.getContentBounds()
    view.setBounds({ x: RAIL_WIDTH, y: 0, width: Math.max(width - RAIL_WIDTH, 0), height })
  }
}
