<script lang="ts">
  // Search-result bodies are full rendered records, which can be very long
  // (e.g. `typeset`, `_arguments`). Clamp to a preview height on the results
  // list and reveal the rest on demand; the permalink page still shows the
  // whole body. The toggle only appears when the body actually overflows the
  // clamp — measured with a ResizeObserver because <Md> renders async, so the
  // body grows after first paint.
  import Md from './Md.svelte';

  let { source }: { source: string } = $props();

  // Clamp the preview to ~15rem, but only bother clamping when a worthwhile
  // amount is hidden (CLAMP_REM + MIN_HIDDEN_REM). A body that pokes just past
  // the clamp is shown whole instead of behind a "show more" that reveals one
  // stingy line. scrollHeight is the full content height in either state, so
  // the measurement is independent of whether the clamp is currently applied.
  const CLAMP_REM = 15;
  const MIN_HIDDEN_REM = 4;

  let expanded = $state(false);
  let overflowing = $state(false);
  let el = $state<HTMLDivElement>();

  $effect(() => {
    const node = el;
    if (!node) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      overflowing = node.scrollHeight > (CLAMP_REM + MIN_HIDDEN_REM) * rem;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    measure();
    return () => ro.disconnect();
  });
</script>

<div class="clamp" class:clamped={overflowing && !expanded} bind:this={el}>
  <Md {source} />
</div>
{#if overflowing}
  <button class="toggle" type="button" onclick={() => (expanded = !expanded)}>
    {expanded ? 'show less' : 'show more'}
  </button>
{/if}

<style>
  .clamp {
    position: relative;
    overflow: hidden;
  }
  .clamp.clamped {
    max-height: 15rem;
  }
  /* Fade the clamped edge into the card surface (--bg-elev) — only when the
   * body is actually clamped, so a short card's last line isn't dimmed. */
  .clamp.clamped::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: 3rem;
    background: linear-gradient(to bottom, transparent, var(--bg-elev));
    pointer-events: none;
  }
  .toggle {
    margin-top: 0.6rem;
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
    color: var(--accent);
    background: transparent;
    border: 1px solid var(--border);
  }
  .toggle:hover {
    border-color: var(--accent);
  }
</style>
