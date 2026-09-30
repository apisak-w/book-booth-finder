<script lang="ts">
  import FinderView from '$lib/ui/FinderView.svelte';
  let { data } = $props();
</script>

{#key data.bundle.event.id}
  <FinderView bundle={data.bundle} />
{/key}
