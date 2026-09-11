<script lang="ts">
  // Presentational: all input via props, so its structure is unit-testable in
  // isolation (tests/ResultCard.svelte.test.ts).
  import type { RankedMatch } from '$lib/ranker/types';
  import { recordHref } from '$lib/view';
  import { renderInline } from '$lib/markdown';
  import ClampedBody from './ClampedBody.svelte';

  let { match, label }: { match: RankedMatch; label: string } = $props();
</script>

<li>
  <header>
    <a href={recordHref(match.rec)}>
      <span class="cat">{label}</span>
      <span class="sep">·</span>
      <!-- renderInline escapes the title, keeping {@html} of corpus text safe -->
      <span class="display">{@html renderInline(match.rec.title)}</span>
    </a>
    <span class="score" title="ranker score">{match.score.toFixed(3)}</span>
  </header>
  <ClampedBody source={match.rec.md_body} />
</li>

<style>
  li {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.2rem 1.1rem 1.1rem;
  }
  /* the head (category · name + score) is metadata, not documentation; give it
     room above and below so the corpus body reads as its own block */
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.9rem;
  }
  a { color: inherit; }
  .cat { color: var(--fg-mute); font-size: 0.85rem; }
  .sep { color: var(--fg-mute); }
  .display { font-family: var(--font-mono); font-weight: 500; }
  .score {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--fg-mute);
  }
</style>
