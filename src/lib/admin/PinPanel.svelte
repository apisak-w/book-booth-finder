<script lang="ts">
  import { georef, pinProblems } from '$lib/core/geo';
  import type { LatLng, Point, Venue } from '$lib/core/types';
  import { parseLatLng } from './osm';

  let {
    venue,
    selectedPin,
    pending,
    readonly,
    onSelectPin,
    onPaste,
    onRemove,
    onEntrance,
  }: {
    venue: Venue;
    selectedPin: string | null;
    pending: Point | null;
    readonly: boolean;
    onSelectPin: (id: string) => void;
    onPaste: (ll: LatLng) => void;
    onRemove: (id: string) => void;
    onEntrance: (id: string, on: boolean) => void;
  } = $props();
  let text = $state('');
  let bad = $state(false);
  const pins = $derived(venue.geo?.pins ?? []);
  const problems = $derived(pins.length >= 3 ? pinProblems(pins, venue.metersPerPx) : []);
  const fit = $derived(pins.length >= 3 ? georef(pins) : null);
  const entries = $derived(venue.landmarks.filter((l) => l.group === 'entry' || venue.geo?.entrances.includes(l.id)));
  function set() {
    const ll = parseLatLng(text);
    bad = !ll;
    if (ll) {
      onPaste(ll);
      text = '';
    }
  }
</script>

<div class="pin-panel">
  <b class="pin-title">Map pins</b>
  {#if pending}
    <span class="lm-note">Now click the same spot on the street map, or paste its coordinates.</span>
  {:else if !readonly}
    <span class="lm-note">Click a spot on the plan you can also find on the street map, like a building corner or a door.</span>
  {/if}
  <ul class="pin-list">
    {#each pins as p, k (p.id)}
      <li>
        <button type="button" class="pin-row" aria-current={p.id === selectedPin} onclick={() => onSelectPin(p.id)}>
          <b>Pin {k + 1}</b><span>plan {p.x}, {p.y} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>
        </button>
        {#if !readonly}<button type="button" class="btn" aria-label="Remove pin {k + 1}" onclick={() => onRemove(p.id)}>Remove</button>{/if}
      </li>
    {/each}
  </ul>
  {#if !readonly && (pending || selectedPin)}
    <label>Paste coordinates for this pin <input bind:value={text} placeholder="13.72361, 100.55972" /></label>
    {#if bad}<span class="editor-error">Paste two numbers, latitude then longitude.</span>{/if}
    <button type="button" class="btn" onclick={set}>Set pin</button>
  {/if}
  {#if pins.length < 3}
    <span class="lm-note">Add at least 3 pins (4 is better) spread across the venue.</span>
  {:else if fit}
    <span class="lm-note">Fit error {fit.residualM.toFixed(1)} m · scale {((fit.mPerPx / venue.metersPerPx - 1) * 100).toFixed(1)}% off</span>
    {#if problems.length}
      <ul class="editor-problems">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
    {:else}
      <span class="admin-ok">Map pin checks pass.</span>
    {/if}
  {/if}
  {#if venue.geo}
    <b class="pin-title">Street entrances</b>
    {#each entries as l (l.id)}
      <label class="lm-check"
        ><input type="checkbox" checked={venue.geo.entrances.includes(l.id)} disabled={readonly} onchange={(e) => onEntrance(l.id, e.currentTarget.checked)} />
        {l.en}</label
      >
    {/each}
  {/if}
</div>
