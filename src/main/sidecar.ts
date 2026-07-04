import { app } from 'electron'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface Account {
  id: string
  name: string
  partition?: string
}

export type LaunchAtLogin = 'no' | 'yes' | 'minimized'

export interface AppSettings {
  minimizeToTray: boolean
  launchAtLogin: LaunchAtLogin
  windowBounds: WindowBounds
  accounts: Account[]
  activeAccountId?: string
}

interface PendingRequest {
  resolve: (value: AppSettings) => void
  reject: (reason: Error) => void
}

function resolveBinaryPath(): string {
  const binaryName = process.platform === 'win32' ? 'rust-sidecar.exe' : 'rust-sidecar'
  return app.isPackaged
    ? join(process.resourcesPath, 'rust-sidecar', binaryName)
    : join(app.getAppPath(), 'rust-sidecar', 'target', 'release', binaryName)
}

export class Sidecar {
  private proc: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private buffer = ''

  start(): void {
    const binaryPath = resolveBinaryPath()
    if (!existsSync(binaryPath)) {
      console.error(`[sidecar] binary not found at ${binaryPath}. Run "npm run sidecar:build" first.`)
      return
    }

    this.proc = spawn(binaryPath, [app.getPath('userData')])
    this.proc.stdout.on('data', (chunk: Buffer) => this.handleData(chunk))
    this.proc.stderr.on('data', (chunk: Buffer) => {
      console.error(`[sidecar] ${chunk.toString().trim()}`)
    })
    // Without these, a broken pipe (e.g. the child dying mid-write) surfaces as an
    // unhandled 'error' event and crashes the whole Electron process.
    this.proc.stdin.on('error', (err) => console.error('[sidecar] stdin error:', err.message))
    this.proc.stdout.on('error', (err) => console.error('[sidecar] stdout error:', err.message))
    this.proc.on('error', (err) => console.error('[sidecar] process error:', err.message))
    this.proc.on('exit', (code) => {
      console.log(`[sidecar] exited with code ${code}`)
      this.proc = null
      this.rejectAllPending(new Error('sidecar process exited'))
    })
  }

  private rejectAllPending(reason: Error): void {
    for (const pending of this.pending.values()) pending.reject(reason)
    this.pending.clear()
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString()
    let newlineIndex: number
    while ((newlineIndex = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (!line) continue

      let message: { id: number; data?: AppSettings; error?: string }
      try {
        message = JSON.parse(line)
      } catch (err) {
        console.error('[sidecar] failed to parse response', line, err)
        continue
      }

      const pending = this.pending.get(message.id)
      if (!pending) continue
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error))
      else pending.resolve(message.data as AppSettings)
    }
  }

  private request(cmd: string, data?: unknown): Promise<AppSettings> {
    return new Promise((resolve, reject) => {
      if (!this.proc) {
        reject(new Error('sidecar not running'))
        return
      }
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      try {
        this.proc.stdin.write(`${JSON.stringify({ id, cmd, data })}\n`)
      } catch (err) {
        this.pending.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  getSettings(): Promise<AppSettings> {
    return this.request('get_settings')
  }

  setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return this.request('set_settings', partial)
  }

  stop(): void {
    this.proc?.kill()
    this.proc = null
  }
}
