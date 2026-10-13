<script lang="ts">
  let {
    hasPasskeys,
    busy,
    onSignIn,
    onSetUp,
  }: { hasPasskeys: boolean; busy: boolean; onSignIn: () => void; onSetUp: (code: string, name: string) => void } =
    $props();
  let code = $state('');
  let name = $state('My phone');
</script>

<section class="admin-signin" aria-label="Sign in">
  {#if hasPasskeys}
    <button type="button" class="btn primary" disabled={busy} onclick={onSignIn}>Sign in with a passkey</button>
  {/if}
  <details open={!hasPasskeys}>
    <summary>Set up a passkey</summary>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        onSetUp(code, name);
      }}
    >
      <label>Setup code <input type="password" autocomplete="off" bind:value={code} required /></label>
      <label>Name this passkey <input bind:value={name} maxlength="40" required /></label>
      <button type="submit" class="btn" disabled={busy}>Set up</button>
    </form>
    <p class="admin-note">
      The setup code is the ADMIN_SETUP_CODE secret in Cloudflare. It works once. To recover, set a new one and redeploy.
    </p>
  </details>
</section>
