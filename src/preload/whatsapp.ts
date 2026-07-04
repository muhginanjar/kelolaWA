import { contextBridge, ipcRenderer } from 'electron'

function getAccountId(): string {
  const arg = process.argv.find((a) => a.startsWith('--wa-account-id='))
  return arg ? arg.split('=')[1] : ''
}

const accountId = getAccountId()

contextBridge.exposeInMainWorld('waBridge', {
  notifyClick: (): void => ipcRenderer.send('wa:notification-click', accountId)
})
