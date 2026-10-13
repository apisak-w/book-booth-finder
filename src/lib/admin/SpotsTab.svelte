<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_FILTERS, type Filters, type StoredSpot } from '$lib/core/spotReview';
  import type { Surroundings } from '$lib/core/types';
  import { decide, getSpots, type VenueSummary } from './api';
  import { placeNote, placesFor, type Decision } from './places';
  import type { AdminVenue } from './types';
  import SpotsMap from './SpotsMap.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import EmptySpots from './EmptySpots.svelte';

  let {
    venues,
    venueList,
    busy,
    run,
    onDone,
    onAddPins,
  }: {
    venues: AdminVenue[];
    venueList: VenueSummary[];
    busy: boolean;
    run: (fn: () => Promise<void>) => void;
    onDone: (message: string, link?: string) => void;
    onAddPins: (id: string) => void;
  } = $props();
  let venueId = $state('');
  let spots = $state<StoredSpot[]>([]);
  let decisions = $state<Decision[]>([]);
  let placeId = $state('');
  let filters = $state<Filters>({ ...ALL_FILTERS });
  let surroundings = $state<Surroundings | null>(null);

  const venue = $derived(venues.find((v) => v.id === venueId) ?? venues[0] ?? null);
  const places = $derived(venue ? placesFor(venue, spots, decisions, filters) : []);
  const place = $derived(places.find((p) => p.id === placeId) ?? places[0] ?? null);

  async function load() {
    if (!venue) return;
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
  const keep = () =>
    run(async () => {
      if (!venue || !place) return;
      await decide(venue.id, place.id, 'keep', filters);
      await load();
      onDone('Pin kept.');
    });
  const move = () =>
    run(async () => {
      if (!venue || !place) return;
      const r = await decide(venue.id, place.id, 'move', filters);
      await load();
      onDone('Pull request ready. Check the preview, then merge.', r.pr ?? '');
    });

  onMount(() => run(load));
</script>

{#if !venue}
  <EmptySpots venues={venueList} {onAddPins} />
{:else}
  {#if venues.length > 1}
    <label class="admin-venue-pick"
      >Venue
      <select value={venue.id} onchange={(e) => chooseVenue(e.currentTarget.value)}>
        {#each venues as v (v.id)}<option value={v.id}>{v.name.en}</option>{/each}
      </select>
    </label>
  {/if}
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
