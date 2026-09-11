<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';

  let { source }: { source: string } = $props();

  let html = $state('');
  let token = 0;

  $effect(() => {
    const t = ++token;
    renderMarkdown(source)
      .then((out) => {
        if (t === token) html = out;
      })
      .catch(() => {
        // Render only fails if the shared highlighter build fails; clear so a
        // stale body from a previous record can't linger under this one.
        if (t === token) html = '';
      });
  });
</script>

<div class="md">{@html html}</div>
