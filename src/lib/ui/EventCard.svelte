<script lang="ts">
  import type { EventSummary } from '$lib/server/catalog';
  import type { Status } from '$lib/core/status';
  import { STRINGS, fmtRange, nameIn, type Lang } from '$lib/i18n/strings';
  let { event, status, lang }: { event: EventSummary; status: Status | null; lang: Lang } = $props();
  const s = $derived(STRINGS[lang]);
  const nameOf = $derived(nameIn(lang));
</script>

<a class="event-card" href="/e/{event.id}/">
  {#if status}<span class="badge {status}">{s[status]}</span>{/if}
  <b>{nameOf(event.name)}</b>
  <span>{nameOf(event.venueName)}</span>
  <span>{fmtRange(event.dates.start, event.dates.end, lang)}</span>
</a>
