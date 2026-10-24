<script lang="ts">
  import type { EventSummary } from '$lib/core/types';
  import { dayOf, daysUntil, type Status } from '$lib/core/status';
  import { STRINGS, fmtRange, fmtTime, nameIn, type Lang } from '$lib/i18n/strings';
  import { posterUrl } from './posters';
  let {
    event,
    status,
    lang,
    now,
    eager,
  }: { event: EventSummary; status: Status; lang: Lang; now: Date; eager: boolean } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
  const day = $derived(dayOf(event.dates, event.timezone, now));
  const opensIn = $derived(daysUntil(event.dates.start, event.timezone, now));
  const hours = $derived(
    event.hours && status !== 'past' ? s.hours(fmtTime(event.hours.open, lang), fmtTime(event.hours.close, lang)) : '',
  );
  const src = $derived(event.poster ? posterUrl(event.id, event.poster.file) : undefined);
  let failed = $state(false);
  const cta = $derived(status === 'live' ? s.findBooth : status === 'upcoming' ? s.previewMap : s.openMap);
</script>

<a class="event-card {status}" href="/e/{event.id}/">
  {#if event.poster && src}
    <div class="poster-box" style:aspect-ratio="{event.poster.width} / {event.poster.height}">
      <img
        class="poster"
        class:failed
        {src}
        alt=""
        width={event.poster.width}
        height={event.poster.height}
        loading={eager ? 'eager' : 'lazy'}
        onerror={() => (failed = true)}
      />
    </div>
  {/if}
  <div class="event-body">
    <span class="badge {status}">{s[status]}</span>
    <b>{nameOf(event.name)}</b>
    <span class="meta">{nameOf(event.venueName)}</span>
    {#if status !== 'live'}<span class="meta">{fmtRange(event.dates.start, event.dates.end, lang)}</span>{/if}
    {#if hours}<span class="meta">{hours}</span>{/if}
    {#if status === 'live'}
      <div class="progress" role="img" aria-label={s.dayOf(day.day, day.total)}>
        <i style:width="{(day.day / day.total) * 100}%"></i>
      </div>
      <div class="progress-text">
        <span>{s.dayOf(day.day, day.total)}</span>
        <span>{s.until(fmtRange(event.dates.end, event.dates.end, lang))}</span>
      </div>
    {:else if status === 'upcoming'}
      <span class="meta">{opensIn === 1 ? s.opensTomorrow : s.opensIn(opensIn)}</span>
    {:else}
      <span class="meta">{s.pastNote}</span>
    {/if}
    <span class="cta">{cta}</span>
  </div>
</a>
