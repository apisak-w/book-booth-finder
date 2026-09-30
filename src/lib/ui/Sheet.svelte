<script lang="ts">
  import type { Snippet } from 'svelte';
  let { open, toggleLabel, onToggle, head, children }: { open: boolean; toggleLabel: string; onToggle: () => void; head: Snippet; children: Snippet } = $props();
</script>

<section class="sheet" class:min={!open}>
  <div class="sheet-head">
    {@render head()}
    <button type="button" class="toggle" aria-expanded={open} onclick={onToggle}>{toggleLabel}</button>
  </div>
  <div class="body" aria-live="polite">{@render children()}</div>
</section>
