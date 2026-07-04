import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings, Account } from '../main/sidecar'

interface AccountsState {
  accounts: Account[]
  activeAccountId?: string
}

// Custom APIs for renderer
const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  listAccounts: (): Promise<AccountsState> => ipcRenderer.invoke('accounts:list'),
  switchAccount: (id: string): Promise<void> => ipcRenderer.invoke('accounts:switch', id),
  addAccount: (name: string): Promise<AccountsState> => ipcRenderer.invoke('accounts:add', name),
  removeAccount: (id: string): Promise<AccountsState> => ipcRenderer.invoke('accounts:remove', id),
  renameAccount: (id: string, name: string): Promise<AccountsState> =>
    ipcRenderer.invoke('accounts:rename', id, name),
  openSettings: (): void => ipcRenderer.send('shell:open-settings')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
