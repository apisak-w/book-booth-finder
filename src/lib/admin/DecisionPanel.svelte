<script lang="ts">
  import { GOOD_ACCURACY_M, NEAR_PIN_M, type Filters } from '$lib/core/spotReview';
  import type { DoorPlace } from './places';
  let {
    place,
    filters = $bindable(),
    busy,
    onKeep,
    onMove,
  }: { place: DoorPlace; filters: Filters; busy: boolean; onKeep: () => void; onMove: () => void } = $props();
  const r = $derived(place.review);
</script>

<aside class="admin-decision" aria-label="Decision">
  <h2>{place.name.en}</h2>
  <p class="admin-note">
    {r.middle
      ? `Good spots sit ${r.offsetM.toFixed(1)} m from the pin. Moving it also shifts every hall a little.`
      : 'No good spots yet.'}
  </p>
  <fieldset>
    <legend>Which spots count</legend>
    <label><input type="checkbox" bind:checked={filters.accuracy} /> GPS better than {GOOD_ACCURACY_M} m</label>
    <label><input type="checkbox" bind:checked={filters.near} /> Within {NEAR_PIN_M} m of the pin</label>
    <label><input type="checkbox" bind:checked={filters.eventDays} /> Sent during event days</label>
  </fieldset>
  <dl>
    <dt>Good spots</dt>
    <dd>{r.good.length}</dd>
    <dt>Left out</dt>
    <dd>{r.left.length}</dd>
    <dt>Spread</dt>
    <dd>{r.spreadM.toFixed(1)} m</dd>
  </dl>
  {#if place.problems.length}
    <ul class="admin-problems">
      {#each place.problems as p (p)}<li>{p}</li>{/each}
    </ul>
  {:else}
    <p class="admin-ok">Map pin checks pass after the move.</p>
  {/if}
  {#if place.last}
    <p class="admin-note">
      Last decision: {place.last.action === 'move' ? 'moved' : 'kept'} on {place.last.at.slice(0, 10)}
      {#if place.last.pr}· <a href={place.last.pr} target="_blank" rel="noopener">pull request</a>{/if}
    </p>
  {/if}
  <div class="admin-btns">
    <button type="button" class="btn" disabled={busy} onclick={onKeep}>Keep pin</button>
    <button type="button" class="btn move" disabled={busy || place.problems.length > 0} onclick={onMove}>Move pin</button>
  </div>
</aside>
