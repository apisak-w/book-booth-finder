<script lang="ts">
  import type { EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  let { data, lang, notice = '', onPick }: { data: EventData; lang: Lang; notice?: string; onPick: (kind: 'booth' | 'place', id: string) => void } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const label = (kind: 'booth' | 'place', id: string) => {
    if (kind === 'place') return nameOf(data.landmarkById[id]);
    const z = data.event.zones[id];
    return z ? `${id} ${nameOf(z)}` : id;
  };
</script>

{#if notice}<p class="notice">{notice}</p>{/if}
<p class="hint first">{s.tapHint}</p>
{#if data.event.quickPicks.length}
  <h2 class="sec">{s.quick}</h2>
  <div class="quick">
    {#each data.event.quickPicks as [kind, id] (kind + id)}
      <button type="button" onclick={() => onPick(kind, id)}>{label(kind, id)}</button>
    {/each}
  </div>
{/if}
<h2 class="sec">{s.legend}</h2>
<ul class="legend">
  {#each Object.entries(data.event.categories) as [key, c] (key)}
    <li><span class="sw" style:background={c.color}></span>{nameOf(c)}</li>
  {/each}
</ul>
