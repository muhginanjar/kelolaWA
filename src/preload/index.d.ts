import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppSettings, Account } from '../main/sidecar'

interface AccountsState {
  accounts: Account[]
  activeAccountId?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getSettings: () => Promise<AppSettings>
      setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
      listAccounts: () => Promise<AccountsState>
      switchAccount: (id: string) => Promise<void>
      addAccount: (name: string) => Promise<AccountsState>
      removeAccount: (id: string) => Promise<AccountsState>
      renameAccount: (id: string, name: string) => Promise<AccountsState>
      openSettings: () => void
      onActiveAccountChanged: (callback: (id: string) => void) => void
    }
  }
}
