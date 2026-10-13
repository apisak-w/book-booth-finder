<script lang="ts">
  import { onMount } from 'svelte';
  import { getMe, getVenues, setUp, signIn, signOut, type Me, type VenueSummary } from './api';
  import type { AdminVenue } from './types';
  import SignIn from './SignIn.svelte';
  import SpotsTab from './SpotsTab.svelte';
  import VenuesTab from './VenuesTab.svelte';
  import './admin.css';

  let { venues }: { venues: AdminVenue[] } = $props();
  let me = $state<Me | null>(null);
  let tab = $state<'venues' | 'spots'>('venues');
  let venueList = $state<VenueSummary[]>([]);
  let open = $state<{ id: string; mode: 'select' | 'pins' } | null>(null);
  let message = $state('');
  let link = $state('');
  let busy = $state(false);

  async function run(fn: () => Promise<void>) {
    busy = true;
    message = '';
    link = '';
    try {
      await fn();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function load() {
    me = await getMe();
    if (!me.signedIn) return;
    venueList = (await getVenues()).venues;
  }
  const done = (m: string, l = '') => {
    message = m;
    link = l;
  };
  const openVenue = (id: string, mode: 'select' | 'pins') => {
    open = { id, mode };
    tab = 'venues';
  };
  const addPasskey = () =>
    run(async () => {
      const name = prompt('Name this passkey', 'Spare passkey');
      if (!name) return;
      await setUp('', name);
      await load();
      message = 'Spare passkey added.';
    });

  onMount(() => {
    run(load);
  });
</script>

<div class="admin">
  <header class="admin-top">
    <b>Booth finder admin</b>
    {#if me?.signedIn}
      <nav class="admin-tabs" aria-label="Admin sections">
        <button type="button" class="admin-tab" aria-current={tab === 'venues' ? 'page' : undefined} onclick={() => (tab = 'venues')}>Venues</button>
        <button type="button" class="admin-tab" aria-current={tab === 'spots' ? 'page' : undefined} onclick={() => (tab = 'spots')}>Guest spots</button>
      </nav>
      <button type="button" class="btn" disabled={busy} onclick={addPasskey}>Add a passkey</button>
      <button type="button" class="btn" disabled={busy} onclick={() => run(async () => { await signOut(); await load(); })}>Sign out</button>
    {/if}
  </header>
  {#if !me || me.signedIn}
    <p class="admin-msg" role="status">
      {message}
      {#if link}<a href={link} target="_blank" rel="noopener">Open the pull request</a>{/if}
    </p>
  {/if}
  {#if !me}
    <p class="admin-wait">Checking sign-in…</p>
  {:else if !me.signedIn}
    <SignIn
      hasPasskeys={me.hasPasskeys}
      {busy}
      error={message}
      onSignIn={() => run(async () => { await signIn(); await load(); })}
      onSetUp={(code, name) => run(async () => { await setUp(code, name); await load(); })}
    />
  {:else if tab === 'venues'}
    <VenuesTab
      venues={venueList}
      {open}
      onOpen={openVenue}
      onClose={() => (open = null)}
      onSaved={(m, l) => {
        done(m, l);
        getVenues()
          .then((r) => (venueList = r.venues))
          .catch(() => {});
      }}
    />
  {:else}
    <SpotsTab {venues} {venueList} {busy} {run} onDone={done} onAddPins={(id) => openVenue(id, 'pins')} />
  {/if}
</div>
