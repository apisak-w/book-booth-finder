<script lang="ts">
  import type { EventData } from '$lib/core/types';
  import { STRINGS, nameIn, type Lang } from '$lib/i18n/strings';
  let {
    data,
    lang,
    choices,
    guess,
    onPick,
    onList,
  }: {
    data: EventData;
    lang: Lang;
    choices: string[];
    guess: string | null;
    onPick: (id: string) => void;
    onList: () => void;
  } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const areas = $derived(data.venue.areas.filter((a) => choices.includes(a.id)));
</script>

<div class="hallq" role="group" aria-labelledby="hallq-t">
  <h2 class="sec" id="hallq-t">{s.whichHall}</h2>
  <p class="hint first">{s.hallHint}</p>
  <div class="halls">
    {#each areas as a (a.id)}
      <button type="button" class="hallbtn" class:guess={a.id === guess} onclick={() => onPick(a.id)}>
        <b>{nameOf(a.name)}</b>
        {#if a.id === guess}<span>{s.gpsGuess}</span>{/if}
      </button>
    {/each}
  </div>
  <button type="button" class="linkbtn" onclick={onList}>{s.pickFromList}</button>
</div>
