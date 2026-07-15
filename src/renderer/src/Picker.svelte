<script lang="ts">
  interface Account {
    id: string
    name: string
    partition?: string
  }

  let accounts = $state<Account[]>([])
  let phone = $state<string | undefined>(undefined)
  let loaded = $state(false)

  window.api.getPendingChatRequest().then((request) => {
    accounts = request.accounts
    phone = request.phone
    loaded = true
  })

  function choose(id: string): void {
    window.api.choosePickerAccount(id)
  }

  function initials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase()
  }
</script>

<main>
  <h1>Buka chat pakai akun mana?</h1>
  {#if phone}
    <p class="phone">{phone}</p>
  {/if}

  {#if loaded}
    <div class="accounts">
      {#each accounts as account (account.id)}
        <button class="account" onclick={() => choose(account.id)}>
          <span class="avatar">{initials(account.name)}</span>
          {account.name}
        </button>
      {/each}
    </div>
  {:else}
    <p class="hint">Memuat akun...</p>
  {/if}
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
    font-size: 16px;
    margin: 0 0 8px;
  }

  .phone {
    font-size: 13px;
    color: var(--ev-c-text-2);
    margin: 0 0 16px;
  }

  .accounts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .account {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--ev-c-gray-3);
    background: var(--ev-c-black-mute);
    color: var(--ev-c-text-1);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  .account:hover {
    background: var(--ev-c-gray-2);
  }

  .avatar {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--ev-c-gray-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }

  .hint {
    font-size: 12px;
    color: var(--ev-c-text-2);
  }
</style>
