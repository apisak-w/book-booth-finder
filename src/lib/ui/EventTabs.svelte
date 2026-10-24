<script lang="ts">
  import type { Status } from '$lib/core/status';
  import { STRINGS, type Lang } from '$lib/i18n/strings';
  let {
    current,
    counts,
    onpick,
    lang,
  }: { current: Status; counts: Record<Status, number>; onpick: (s: Status) => void; lang: Lang } = $props();
  const ORDER: Status[] = ['live', 'upcoming', 'past'];
  const s = $derived(STRINGS[lang]);
  const label = (t: Status) => (t === 'live' && counts.live > 0 ? `${s.live} · ${counts.live}` : s[t]);
  const buttons: HTMLButtonElement[] = [];

  function onkeydown(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = ORDER[(ORDER.indexOf(current) + step + ORDER.length) % ORDER.length];
    onpick(next);
    buttons[ORDER.indexOf(next)]?.focus();
  }
</script>

<div class="tabs" role="tablist" aria-label={s.events}>
  {#each ORDER as t, i (t)}
    <button
      bind:this={buttons[i]}
      type="button"
      role="tab"
      class="tab"
      id="tab-{t}"
      aria-selected={current === t}
      aria-controls="panel-{t}"
      tabindex={current === t ? 0 : -1}
      onclick={() => onpick(t)}
      {onkeydown}>{label(t)}</button
    >
  {/each}
</div>
