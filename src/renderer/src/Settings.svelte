<script lang="ts">
  type LaunchAtLogin = 'no' | 'yes' | 'minimized'

  let minimizeToTray = $state(true)
  let launchAtLogin = $state<LaunchAtLogin>('no')
  let loaded = $state(false)

  window.api.getSettings().then((settings) => {
    minimizeToTray = settings.minimizeToTray
    launchAtLogin = settings.launchAtLogin
    loaded = true
  })

  async function onToggleMinimizeToTray(): Promise<void> {
    const settings = await window.api.setSettings({ minimizeToTray })
    minimizeToTray = settings.minimizeToTray
  }

  async function onChangeLaunchAtLogin(): Promise<void> {
    const settings = await window.api.setSettings({ launchAtLogin })
    launchAtLogin = settings.launchAtLogin
  }
</script>

<main>
  <h1>Pengaturan</h1>

  {#if loaded}
    <label class="row">
      <input type="checkbox" bind:checked={minimizeToTray} onchange={onToggleMinimizeToTray} />
      Minimize ke tray saat jendela ditutup
    </label>

    <div class="section">
      <p class="section-title">Buka otomatis saat login</p>
      <label class="row">
        <input
          type="radio"
          name="launchAtLogin"
          value="no"
          bind:group={launchAtLogin}
          onchange={onChangeLaunchAtLogin}
        />
        Tidak
      </label>
      <label class="row">
        <input
          type="radio"
          name="launchAtLogin"
          value="yes"
          bind:group={launchAtLogin}
          onchange={onChangeLaunchAtLogin}
        />
        Ya, tampilkan jendela
      </label>
      <label class="row">
        <input
          type="radio"
          name="launchAtLogin"
          value="minimized"
          bind:group={launchAtLogin}
          onchange={onChangeLaunchAtLogin}
        />
        Ya, minimize ke tray
      </label>
    </div>
  {:else}
    <p class="hint">Memuat pengaturan...</p>
  {/if}

  <p class="hint">Aplikasi tetap berjalan di tray meski jendela WhatsApp ditutup.</p>
</main>

<style>
  main {
    padding: 24px;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    color: var(--ev-c-text-1);
  }

  h1 {
    font-size: 18px;
    margin: 0 0 16px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
    margin-bottom: 6px;
  }

  .section {
    margin-top: 18px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--ev-c-text-1);
  }

  .hint {
    margin-top: 16px;
    font-size: 12px;
    color: var(--ev-c-text-2);
  }
</style>
