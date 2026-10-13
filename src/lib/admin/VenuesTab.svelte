<script lang="ts">
  import type { VenueSummary } from './api';
  import VenueEditor from './VenueEditor.svelte';
  let {
    venues,
    open,
    onOpen,
    onClose,
    onSaved,
  }: {
    venues: VenueSummary[];
    open: { id: string; mode: 'select' | 'pins' } | null;
    onOpen: (id: string, mode: 'select' | 'pins') => void;
    onClose: () => void;
    onSaved: (message: string, link: string) => void;
  } = $props();
</script>

{#if open}
  {#key open.id}
    <VenueEditor id={open.id} mode={open.mode} {onClose} {onSaved} />
  {/key}
{:else}
  <section class="venue-list" aria-labelledby="venues-t">
    <h1 id="venues-t">Venues</h1>
    <ul>
      {#each venues as v (v.id)}
        <li>
          <button type="button" class="venue-row" onclick={() => onOpen(v.id, 'select')}>
            <b>{v.name.en}</b>
            <span>{v.id} · {v.landmarks} landmarks · {v.pins ? `${v.pins} map pins` : 'Not on the street map yet'}</span>
          </button>
          {#if v.pr}<a href={v.pr} target="_blank" rel="noopener">Open pull request</a>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
