<script lang="ts">
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  let {
    lang,
    name,
    meters,
    minutes,
    inside,
    onInside,
  }: { lang: Lang; name: string; meters: number; minutes: number; inside: number | null; onInside: () => void } = $props();
  const s = $derived(STRINGS[lang]);
</script>

<div class="outleg" role="status">
  <p class="olt">{s.walkTo(name)}</p>
  <div class="summary"><span class="m">{meters} {s.meters}</span><span class="t">{s.min(minutes)}</span></div>
  {#if inside !== null}<p class="hint first">{s.thenInside(inside)}</p>{/if}
  <div class="actions"><button type="button" class="btn primary" onclick={onInside}>{s.imInside}</button></div>
</div>
