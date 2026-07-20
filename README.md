# kelolaWA

Unofficial WhatsApp Web desktop wrapper for Windows, macOS, and Linux — multiple accounts in one window, native OS notifications, tray icon, and voice/video calling.

> **Disclaimer:** kelolaWA is an independent, unofficial desktop client that wraps `web.whatsapp.com` in a native window. It is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta Platforms, Inc. "WhatsApp" is a trademark of Meta Platforms, Inc.

![kelolaWA main window with the account rail on the left; chat content is blurred for privacy](screenshots/main-window.png)

_Chat list and conversation are blurred — that part is just regular WhatsApp Web. The rail on the left (with the three accounts) is what kelolaWA adds._

## Features

- **Multiple accounts** — add as many WhatsApp accounts as you like, each isolated in its own session (its own cookies/login, independent of the others). Switch between them from a rail on the left; every account keeps syncing in the background even while you're looking at a different one.
- **Native notifications** — real OS notification banners, not just the badge in the tab title. Clicking a notification brings the app to front and switches straight to that account's chat.
- **Voice & video calls** — camera and microphone access is wired up, so WhatsApp Web's own calling feature works normally.
- **Tray icon** — closing the window minimizes to the system tray instead of quitting; the app keeps running and notifying in the background.
- **Launch at login** — optionally start kelolaWA automatically when you log in, either with the window shown or minimized straight to the tray.
- **Rename / remove accounts** — double-click an account's avatar to rename it; hover and click the small × to remove it.
- **Keyboard shortcut to switch accounts** — Cmd (Ctrl on Windows/Linux) + backtick cycles to the next account, the same convention macOS uses for cycling windows; add Shift to go to the previous one instead.
- **Auto-reload on reconnect** — if the network drops and comes back, the affected account's view reloads itself automatically so WhatsApp Web doesn't stay stuck "connecting…"; there's also a manual "Muat Ulang" item in the tray menu. Either way it's just a page reload, so the session stays logged in.
- **`whatsapp://` deep links** — kelolaWA registers itself as the handler for `whatsapp://send?phone=...&text=...` links (the scheme click-to-chat buttons and the official WhatsApp desktop app both use). With more than one account, it asks which one to open the chat in before deep-linking straight to it.

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) — app shell, windows, tray, per-account session isolation via `WebContentsView`
- [Svelte 5](https://svelte.dev/) + TypeScript — account rail and settings UI
- [Rust](https://www.rust-lang.org/) — a small sidecar process that persists app settings (window position, accounts list, preferences) to disk as JSON, communicating with the main process over stdin/stdout

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- [Rust](https://www.rust-lang.org/tools/install) (`cargo`) — only needed to build the settings sidecar; installed automatically as part of `npm run dev` / `npm run build` if you have `cargo` on your `PATH`

## Getting started

```bash
git clone <this-repo-url>
cd kelolaWA
npm install
npm run dev
```

`npm run dev` builds the Rust sidecar once, then starts Electron with hot-reload for the renderer.

## Building for production

```bash
npm run build:mac     # macOS (.app, .dmg)
npm run build:win     # Windows (.exe, NSIS installer)
npm run build:linux   # Linux (AppImage, deb)
```

Output goes to `dist/`. Note that on macOS, in dev mode the app always shows up as "Electron" in the menu bar and Dock — that's an Electron limitation for unpackaged apps. A `npm run build:mac` (or `npm run build:unpack` for a quick unsigned local build) produces a properly named/iconed `.app`.

Builds are unsigned (no Apple Developer / Windows code-signing certificate configured), so macOS Gatekeeper and Windows SmartScreen will warn on first launch — that's expected for a project without a paid signing certificate; users just need to right-click → Open (macOS) or click "More info" → "Run anyway" (Windows) once.

## Releasing (GitHub Actions)

`.github/workflows/release.yml` builds macOS, Windows, and Linux in parallel on their native GitHub-hosted runners and attaches the installers to a GitHub Release, triggered by pushing a version tag:

```bash
npm version 0.2.0 --no-git-tag-version   # bump the version in package.json
git commit -am "Release 0.2.0"
git tag v0.2.0
git push origin main --tags
```

No extra secrets to configure — it uses the repo's built-in `GITHUB_TOKEN`.

## Project structure

```
src/
  main/            Electron main process
    index.ts       window/tray/menu setup, IPC handlers
    accounts.ts     per-account WebContentsView manager (session isolation, notifications)
    sidecar.ts      client for talking to the Rust settings sidecar
  preload/         contextBridge preload scripts (shell/settings window + per-account WhatsApp view)
  renderer/        Svelte UI (account rail, settings window, account-picker window)
rust-sidecar/      Rust binary that reads/writes settings.json over stdio
resources/         app + tray icons
build/             electron-builder resources (icons, entitlements)
```

## How multi-account works

Each account gets its own Electron session partition (except the first, which reuses the default session so an existing login isn't lost on upgrade). That means separate cookies, local storage, and IndexedDB per account — WhatsApp Web has no idea it's sharing the machine with other logged-in numbers. All accounts are loaded in the background on startup so notifications keep working for accounts you aren't currently viewing; only the active one is attached to the visible window.

## How the whatsapp:// deep link works

kelolaWA registers itself as the OS handler for the `whatsapp://` custom URL scheme (not `https://wa.me/...` — that's Meta's own https domain, and no third-party desktop app can register itself as the handler for someone else's https domain without that domain owner's cooperation). A single-instance lock means clicking a link when kelolaWA is already running hands the URL to that existing process instead of launching a second copy. With one account it deep-links straight there; with more than one, a small modal window asks which account to use first.

## License

No license is granted. This repository is public for reference and portfolio purposes only — you may not copy, modify, or redistribute this code without the author's explicit permission.
