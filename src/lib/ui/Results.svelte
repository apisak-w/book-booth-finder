<script lang="ts">
  import type { SearchItem } from '$lib/core/search';
  import type { EventData } from '$lib/core/types';
  import { boothSub, boothTitle, PLACE_GLYPH } from '$lib/core/describe';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  import CodeChip from './CodeChip.svelte';
  let { items, query, data, lang, onPick }: { items: SearchItem[]; query: string; data: EventData; lang: Lang; onPick: (it: SearchItem) => void } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
</script>

{#if !items.length}
  <p class="empty">{s.noRes(query.trim())}</p>
{:else}
  <ul class="results">
    {#each items as it, k (k)}
      <li>
        <button type="button" onclick={() => onPick(it)}>
          {#if it.type === 'place'}
            <CodeChip label={PLACE_GLYPH[it.lm.group]} color="var(--ink)" />
            <span class="rmain"><b>{nameOf(it.lm)}</b><span>{s.groups[it.lm.group]}</span></span>
          {:else}
            <CodeChip label={it.b.c} color={data.event.categories[it.b.cat].color} cat={it.b.cat} />
            <span class="rmain">
              <b>{it.type === 'exh' ? nameOf(it.ex) : boothTitle(it.b, data, lang)}</b>
              <span>{boothSub(it.b, data, lang)}</span>
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}
