<script lang="ts">
  interface Account {
    id: string
    name: string
    partition?: string
  }

  let accounts = $state<Account[]>([])
  let activeId = $state<string | undefined>(undefined)
  let adding = $state(false)
  let newName = $state('')
  let renamingId = $state<string | null>(null)
  let renameValue = $state('')
  let unread = $state<Record<string, number>>({})

  async function refresh(): Promise<void> {
    const state = await window.api.listAccounts()
    accounts = state.accounts
    activeId = state.activeAccountId
  }

  refresh()

  window.api.onActiveAccountChanged((id) => {
    activeId = id
  })

  function badgeLabel(count: number): string {
    return count > 99 ? '99+' : String(count)
  }

  // Windows can't show a number on the taskbar button directly, so draw one here
  // and hand it to the main process as an overlay icon.
  function renderOverlay(total: number): string | null {
    if (total <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#e53935'
    ctx.beginPath()
    ctx.arc(16, 16, 16, 0, Math.PI * 2)
    ctx.fill()
    const label = total > 9 ? '9+' : String(total)
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${label.length > 1 ? 18 : 22}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 16, 17)
    return canvas.toDataURL('image/png')
  }

  function applyUnread(counts: Record<string, number>): void {
    unread = counts
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    window.api.setBadgeOverlay(renderOverlay(total), total > 0 ? `${total} chat belum dibaca` : '')
  }

  window.api.getUnreadCounts().then(applyUnread)
  window.api.onUnreadChanged(applyUnread)

  async function select(id: string): Promise<void> {
    activeId = id
    await window.api.switchAccount(id)
  }

  function startAdd(): void {
    adding = true
    newName = ''
  }

  async function confirmAdd(): Promise<void> {
    if (!adding) return
    adding = false
    if (!newName.trim()) return
    const state = await window.api.addAccount(newName.trim())
    accounts = state.accounts
    activeId = state.activeAccountId
  }

  async function remove(id: string, event: MouseEvent): Promise<void> {
    event.stopPropagation()
    if (!confirm('Hapus akun ini?')) return
    const state = await window.api.removeAccount(id)
    accounts = state.accounts
    activeId = state.activeAccountId
  }

  function startRename(account: Account, event: MouseEvent): void {
    event.stopPropagation()
    renamingId = account.id
    renameValue = account.name
  }

  async function confirmRename(): Promise<void> {
    if (!renamingId) return
    const id = renamingId
    const value = renameValue
    renamingId = null
    if (!value.trim()) return
    const state = await window.api.renameAccount(id, value.trim())
    accounts = state.accounts
    activeId = state.activeAccountId
  }

  function initials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase()
  }
</script>

<div class="rail">
  <div class="accounts">
    {#each accounts as account (account.id)}
      <div class="avatar-wrap">
        {#if renamingId === account.id}
          <input
            class="rename-input"
            bind:value={renameValue}
            onkeydown={(e) => e.key === 'Enter' && confirmRename()}
            onblur={confirmRename}
          />
        {:else}
          <button
            class="avatar"
            class:active={account.id === activeId}
            title={`${account.name} (dobel-klik untuk ganti nama)`}
            onclick={() => select(account.id)}
            ondblclick={(e) => startRename(account, e)}
          >
            {initials(account.name)}
          </button>
          {#if unread[account.id]}
            <span class="unread" aria-label={`${unread[account.id]} chat belum dibaca`}>
              {badgeLabel(unread[account.id])}
            </span>
          {/if}
          <button
            class="remove"
            aria-label={`Hapus akun ${account.name}`}
            onclick={(e) => remove(account.id, e)}
          >
            &times;
          </button>
        {/if}
      </div>
    {/each}
  </div>

  {#if adding}
    <input
      class="new-account-input"
      bind:value={newName}
      placeholder="Nama akun"
      onkeydown={(e) => e.key === 'Enter' && confirmAdd()}
      onblur={confirmAdd}
    />
  {:else}
    <button class="add" title="Tambah akun" onclick={startAdd}>+</button>
  {/if}

  <button class="settings" title="Pengaturan" onclick={() => window.api.openSettings()}>
    &#9881;
  </button>
</div>

<style>
  :global(body) {
    background: transparent;
  }

  .rail {
    width: 72px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    background: var(--ev-c-black-soft);
    border-right: 1px solid var(--ev-c-gray-3);
  }

  .accounts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    overflow-y: auto;
    /* Room for the unread badge, which overhangs the avatar's edge. */
    padding: 4px 8px;
  }

  .avatar-wrap {
    position: relative;
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--ev-c-gray-3);
    color: var(--ev-c-text-1);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .avatar.active {
    border-color: #25d366;
  }

  .remove {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    line-height: 16px;
    padding: 0;
    border-radius: 50%;
    background: var(--ev-c-black);
    color: var(--ev-c-text-2);
    font-size: 12px;
    opacity: 0;
    transition: opacity 120ms;
    cursor: pointer;
  }

  .unread {
    position: absolute;
    bottom: -4px;
    right: -6px;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 11px;
    border: 2px solid var(--ev-c-black-soft);
    background: #25d366;
    color: #111b21;
    font-size: 12px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    pointer-events: none;
  }

  .avatar-wrap:hover .remove {
    opacity: 1;
  }

  .add,
  .settings {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--ev-c-gray-3);
    color: var(--ev-c-text-1);
    font-size: 18px;
    cursor: pointer;
  }

  .add:hover,
  .settings:hover {
    background: var(--ev-c-gray-2);
  }

  .new-account-input {
    width: 60px;
    font-size: 11px;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid var(--ev-c-gray-2);
    background: var(--ev-c-black-mute);
    color: var(--ev-c-text-1);
    text-align: center;
  }

  .rename-input {
    width: 60px;
    font-size: 11px;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid #25d366;
    background: var(--ev-c-black-mute);
    color: var(--ev-c-text-1);
    text-align: center;
  }
</style>
