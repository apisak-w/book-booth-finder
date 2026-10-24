<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { eventStatus, openingTab, sortEvents, LEGACY_EVENT, type Status } from '$lib/core/status';
  import { STRINGS } from '$lib/i18n/strings';
  import { lang } from '$lib/i18n/lang.svelte';
  import Header from '$lib/ui/Header.svelte';
  import EventTabs from '$lib/ui/EventTabs.svelte';
  import EventCard from '$lib/ui/EventCard.svelte';

  let { data } = $props();
  let now = $state<Date | null>(null);
  let tab = $state<Status | null>(null);
  const s = $derived(STRINGS[lang.current]);
  const EMPTY = {
    live: ['noLive', 'noLiveHint'],
    upcoming: ['noUpcoming', 'noUpcomingHint'],
    past: ['noPast', 'noPastHint'],
  } as const;

  const groups = $derived.by(() => {
    const g: Record<Status, typeof data.events> = { live: [], upcoming: [], past: [] };
    if (now) for (const e of sortEvents(data.events, now)) g[eventStatus(e.dates, e.timezone, now)].push(e);
    return g;
  });
  const counts = $derived({ live: groups.live.length, upcoming: groups.upcoming.length, past: groups.past.length });

  onMount(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has('to') || p.has('from')) {
      goto(`/e/${LEGACY_EVENT}/${location.hash}`, { replaceState: true });
      return;
    }
    const at = new Date();
    now = at;
    tab = openingTab(data.events.map((e) => eventStatus(e.dates, e.timezone, at)));
  });
</script>

<svelte:head>
  <title>{s.title}</title>
  <meta name="theme-color" content="#13306B" />
</svelte:head>

<div class="page">
  <Header title={s.title} subtitle={s.events} />
  <main class="events">
    {#if !data.events.length}
      <p class="empty">{s.noEvents}</p>
    {:else if now && tab}
      <EventTabs current={tab} {counts} onpick={(t) => (tab = t)} lang={lang.current} />
      <div class="tabpanel" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}">
        {#each groups[tab] as e, i (e.id)}
          <EventCard event={e} status={tab} lang={lang.current} {now} eager={i === 0} />
        {:else}
          <div class="empty-tab"><b>{s[EMPTY[tab][0]]}</b><span>{s[EMPTY[tab][1]]}</span></div>
        {/each}
      </div>
    {:else}
      <div class="tabs-wait" aria-hidden="true"></div>
    {/if}
  </main>
</div>
