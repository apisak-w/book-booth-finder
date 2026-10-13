<script lang="ts">
  let {
    hasPasskeys,
    busy,
    error = '',
    onSignIn,
    onSetUp,
  }: {
    hasPasskeys: boolean;
    busy: boolean;
    error?: string;
    onSignIn: () => void;
    onSetUp: (code: string, name: string) => void;
  } = $props();
  let code = $state('');
  let name = $state('My phone');
  let reveal = $state(false);
  let setupOpen = $state(false);
  const showSetup = $derived(!hasPasskeys || setupOpen);
</script>

<section class="signin" aria-labelledby="signin-t">
  <div class="signin-card">
    <div class="signin-badge" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M16 7l3 3M18 5l2 2" />
      </svg>
    </div>

    {#if showSetup}
      <h1 id="signin-t">Set up your passkey</h1>
      <p class="signin-lede">A passkey lets you sign in with Face ID, Touch ID or your device PIN. There is no password to remember.</p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          onSetUp(code, name);
        }}
      >
        <ol class="signin-steps">
          <li>
            <span class="signin-step" aria-hidden="true">1</span>
            <div class="signin-field">
              <label for="setup-code">Setup code</label>
              <div class="signin-code">
                <input id="setup-code" type={reveal ? 'text' : 'password'} autocomplete="off" spellcheck="false" bind:value={code} required />
                <button type="button" class="signin-reveal" aria-pressed={reveal} onclick={() => (reveal = !reveal)}>
                  {reveal ? 'Hide code' : 'Show code'}
                </button>
              </div>
              <span class="signin-hint">The ADMIN_SETUP_CODE secret from Cloudflare.</span>
            </div>
          </li>
          <li>
            <span class="signin-step" aria-hidden="true">2</span>
            <div class="signin-field">
              <label for="setup-name">Name this device</label>
              <input id="setup-name" bind:value={name} maxlength="40" required />
            </div>
          </li>
          <li>
            <span class="signin-step" aria-hidden="true">3</span>
            <div class="signin-field">
              <span class="signin-label">Confirm with Face ID, Touch ID or your PIN</span>
              <span class="signin-hint">Your device asks after you press the button.</span>
            </div>
          </li>
        </ol>
        {#if error}<p class="signin-error" role="alert">{error}</p>{/if}
        <button type="submit" class="btn primary signin-go" disabled={busy}>
          {busy ? 'Waiting for your passkey…' : 'Set up passkey'}
        </button>
      </form>
      {#if hasPasskeys}
        <button type="button" class="signin-link" onclick={() => (setupOpen = false)}>Back to sign in</button>
      {/if}
    {:else}
      <h1 id="signin-t">Sign in to Booth finder admin</h1>
      <p class="signin-lede">Use Face ID, Touch ID or your device PIN.</p>
      {#if error}<p class="signin-error" role="alert">{error}</p>{/if}
      <button type="button" class="btn primary signin-go" disabled={busy} onclick={onSignIn}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 11v3a8 8 0 0 1-1.5 4.7M8.2 7.2A6 6 0 0 1 18 12v1.5M6 12a6 6 0 0 1 .4-2.1M15 13.6a12 12 0 0 1-1.2 5.2M9 13a3 3 0 0 1 6-1" />
        </svg>
        {busy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
      </button>
      <div class="signin-or"><span>First time on this device?</span></div>
      <button type="button" class="signin-link" onclick={() => (setupOpen = true)}>Set up a passkey</button>
    {/if}
  </div>
  <p class="signin-note">The setup code works once. To recover, set a new ADMIN_SETUP_CODE in Cloudflare and redeploy.</p>
</section>
