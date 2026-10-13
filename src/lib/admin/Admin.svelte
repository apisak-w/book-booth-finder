<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_FILTERS, type Filters, type StoredSpot } from '$lib/core/spotReview';
  import type { Surroundings } from '$lib/core/types';
  import { decide, getMe, getSpots, setUp, signIn, signOut, type Me } from './api';
  import { placeNote, placesFor, type Decision } from './places';
  import type { AdminVenue } from './types';
  import SignIn from './SignIn.svelte';
  import SpotsMap from './SpotsMap.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import './admin.css';

  let { venues }: { venues: AdminVenue[] } = $props();
  let me = $state<Me | null>(null);
  let venueId = $state('');
  let spots = $state<StoredSpot[]>([]);
  let decisions = $state<Decision[]>([]);
  let placeId = $state('');
  let filters = $state<Filters>({ ...ALL_FILTERS });
  let surroundings = $state<Surroundings | null>(null);
  let message = $state('');
  let link = $state('');
  let busy = $state(false);

  const venue = $derived(venues.find((v) => v.id === venueId) ?? venues[0] ?? null);
  const places = $derived(venue ? placesFor(venue, spots, decisions, filters) : []);
  const place = $derived(places.find((p) => p.id === placeId) ?? places[0] ?? null);

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
    if (!me.signedIn || !venue) return;
    const r = await getSpots(venue.id);
    spots = r.spots;
    decisions = r.decisions;
    surroundings = await fetch(`/v/${venue.id}/surroundings.json`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  const chooseVenue = (id: string) => {
    venueId = id;
    placeId = '';
    run(load);
  };
  const addPasskey = () =>
    run(async () => {
      const name = prompt('Name this passkey', 'Spare passkey');
      if (!name) return;
      await setUp('', name);
      await load();
      message = 'Spare passkey added.';
    });
  const keep = () =>
    run(async () => {
      if (!venue || !place) return;
      await decide(venue.id, place.id, 'keep', filters);
      await load();
      message = 'Pin kept.';
    });
  const move = () =>
    run(async () => {
      if (!venue || !place) return;
      const r = await decide(venue.id, place.id, 'move', filters);
      await load();
      message = 'Pull request ready. Check the preview, then merge.';
      link = r.pr ?? '';
    });

  onMount(() => {
    run(load);
  });
</script>

<div class="admin">
  <header class="admin-top">
    <b>Review guest spots</b>
    {#if me?.signedIn}
      {#if venues.length > 1}
        <label
          >Venue
          <select value={venue?.id} onchange={(e) => chooseVenue(e.currentTarget.value)}>
            {#each venues as v (v.id)}<option value={v.id}>{v.name.en}</option>{/each}
          </select>
        </label>
      {/if}
      <button type="button" class="btn" disabled={busy} onclick={addPasskey}>Add a passkey</button>
      <button type="button" class="btn" disabled={busy} onclick={() => run(async () => { await signOut(); await load(); })}>Sign out</button>
    {/if}
  </header>
  <p class="admin-msg" role="status">
    {message}
    {#if link}<a href={link} target="_blank" rel="noopener">Open the pull request</a>{/if}
  </p>
  {#if !me}
    <p class="admin-wait">Checking sign-in…</p>
  {:else if !me.signedIn}
    <SignIn
      hasPasskeys={me.hasPasskeys}
      {busy}
      onSignIn={() => run(async () => { await signIn(); await load(); })}
      onSetUp={(code, name) => run(async () => { await setUp(code, name); await load(); })}
    />
  {:else if !venue}
    <p class="admin-wait">No venue has map pins yet.</p>
  {:else}
    <div class="admin-body">
      <nav class="admin-places" aria-label="Places">
        <h2>Places guests confirmed</h2>
        {#each places as p (p.id)}
          <button type="button" class="admin-place" aria-current={p.id === place?.id} onclick={() => (placeId = p.id)}>
            <b>{p.name.en}{p.kind === 'hall' ? ' (hall confirm)' : ''}</b>
            <span>{placeNote(p, venue)}</span>
          </button>
        {/each}
      </nav>
      {#if place}
        <SpotsMap {venue} {place} {surroundings} />
        {#if place.kind === 'door'}
          <DecisionPanel {place} bind:filters {busy} onKeep={keep} onMove={move} />
        {:else}
          <aside class="admin-decision" aria-label="Decision">
            <h2>{place.name.en}</h2>
            <p class="admin-note">Hall confirms only check the map. They never move a pin.</p>
          </aside>
        {/if}
      {/if}
    </div>
  {/if}
</div>
