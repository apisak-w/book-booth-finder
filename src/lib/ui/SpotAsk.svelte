<script lang="ts">
  import type { SpotKind } from '$lib/core/spots';
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  let {
    lang,
    kind,
    onAnswer,
  }: { lang: Lang; kind: SpotKind; onAnswer: (send: boolean, never: boolean) => void } = $props();
  const s = $derived(STRINGS[lang]);
  let never = $state(false);
</script>

<div class="spotask" role="group" aria-labelledby="spotask-t">
  <div class="spotask-head">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
    <div>
      <h2 class="sec" id="spotask-t">{s.spotTitle}</h2>
      <p class="hint first">{kind === 'door' ? s.spotBody : s.spotBodyHall}</p>
    </div>
  </div>
  <div class="spotask-btns">
    <button type="button" class="btn" onclick={() => onAnswer(false, never)}>{s.spotNo}</button>
    <button type="button" class="btn primary" onclick={() => onAnswer(true, never)}>{s.spotSend}</button>
  </div>
  <p class="spotask-fine">
    {s.spotFine(kind === 'door')}
    <a href="/what-we-keep/" target="_blank" rel="noopener">{s.whatWeKeep}</a>
  </p>
  <label class="spotask-never"><input type="checkbox" bind:checked={never} /> {s.spotNever}</label>
</div>
