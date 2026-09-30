<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { eventStatus, sortEvents, LEGACY_EVENT, type Status } from '$lib/core/status';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  import EventCard from '$lib/ui/EventCard.svelte';

  let { data } = $props();
  let now = $state<Date | null>(null);
  const s = $derived(STRINGS[lang.current]);
  const events = $derived(now ? sortEvents(data.events, now) : data.events);
  const statusOf = (e: (typeof data.events)[number]): Status | null => (now ? eventStatus(e.dates, e.timezone, now) : null);

  onMount(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has('to') || p.has('from')) {
      goto(`/e/${LEGACY_EVENT}/${location.hash}`, { replaceState: true });
      return;
    }
    now = new Date();
  });
</script>

<svelte:head>
  <title>{s.title}</title>
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="page">
  <Header title={s.title} subtitle={s.events} />
  <main class="events">
    {#if !events.length}<p class="empty">{s.noEvents}</p>{/if}
    {#each events as e (e.id)}
      <EventCard event={e} status={statusOf(e)} lang={lang.current} />
    {/each}
  </main>
</div>
