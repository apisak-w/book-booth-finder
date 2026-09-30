<script lang="ts">
  let { message, show }: { message: string; show: boolean } = $props();
</script>

<div class="toast" class:show role="status" aria-live="polite">{message}</div>
