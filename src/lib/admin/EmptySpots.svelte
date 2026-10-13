<script lang="ts">
  import type { VenueSummary } from './api';
  let { venues, onAddPins }: { venues: VenueSummary[]; onAddPins: (id: string) => void } = $props();
</script>

<section class="signin" aria-labelledby="empty-t">
  <div class="signin-card">
    <div class="signin-badge" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
      </svg>
    </div>
    <h1 id="empty-t">No venue is on the street map yet</h1>
    <p class="signin-lede">Guest spots start once a venue has map pins.</p>
    <ul class="empty-venues">
      {#each venues as v (v.id)}
        <li>
          <div><b>{v.name.en}</b><span>{v.id} · {v.landmarks} landmarks</span></div>
          <button type="button" class="btn primary" onclick={() => onAddPins(v.id)}>Add map pins</button>
        </li>
      {/each}
    </ul>
  </div>
</section>
