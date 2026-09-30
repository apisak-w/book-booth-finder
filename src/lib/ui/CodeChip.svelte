<script lang="ts">
  let { label, color, cat = '' }: { label: string; color: string; cat?: string } = $props();
</script>

<span class="code {cat ? `c-${cat}` : ''}" style:background={color}>{label}</span>
