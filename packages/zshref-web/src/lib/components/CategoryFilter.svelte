<script lang="ts">
  // The category multi-select: a popover with per-category counts, collapsed
  // by default; it floats, so opening it never reflows the controls beside it.
  import { allTicked, categorySummary } from "$lib/view"
  import type { Category } from "$nlp"

  let {
    categories,
    counts,
    selected = $bindable(),
  }: {
    categories: readonly Category[]
    counts: ReadonlyMap<string, number>
    /** The ticked category ids. */
    selected: string[]
  } = $props()

  let open = $state(false)
  let details: HTMLDetailsElement | undefined = $state()

  let all = $derived(allTicked(selected.length, categories.length))

  function onDocPointerDown(e: PointerEvent) {
    if (open && details && !details.contains(e.target as Node)) open = false
  }
</script>

<svelte:window onpointerdown={onDocPointerDown} />

<details class="catfilter" bind:open bind:this={details}>
  <summary>
    <span class="cat-tag">categories</span>
    {categorySummary(selected.length, categories.length)}
  </summary>
  <div class="cat-panel">
    <div class="cat-panel-head">
      <span class="muted">filter by category</span>
      <span class="cat-actions">
        <button
          type="button"
          class="linkish"
          disabled={all}
          onclick={() => (selected = categories.map(c => c.id))}
        >
          all
        </button>
        <button
          type="button"
          class="linkish"
          disabled={selected.length === 0}
          onclick={() => (selected = [])}
        >
          none
        </button>
      </span>
    </div>
    <div class="cat-grid">
      {#each categories as c (c.id)}
        <label class="cat-opt" class:off={!selected.includes(c.id)}>
          <input type="checkbox" value={c.id} bind:group={selected} />
          <span class="cat-name">{c.label}</span>
          <span class="cat-count">{counts.get(c.id) ?? 0}</span>
        </label>
      {/each}
    </div>
  </div>
</details>

<style>
  .catfilter {
    position: relative;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.9rem;
  }
  .catfilter summary {
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    user-select: none;
    list-style-position: inside;
    color: var(--fg-mute);
  }
  .catfilter summary:hover { color: var(--fg); }
  .cat-tag { color: var(--fg); }
  .cat-panel {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.3rem;
    z-index: 10;
    width: min(22rem, 90vw);
    max-height: 60vh;
    overflow: auto;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
    padding: 0.6rem 0.7rem;
  }
  .cat-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.4rem;
    font-size: 0.8rem;
  }
  .muted { color: var(--fg-mute); }
  .cat-actions {
    display: flex;
    gap: 0.85rem;
  }
  .linkish {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
    padding: 0;
  }
  .linkish:disabled { opacity: 0.4; cursor: not-allowed; }
  .cat-grid {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }
  .cat-opt {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0;
    cursor: pointer;
  }
  /* name takes the slack; the padding guarantees a gap to the count even for
     the longest label */
  .cat-name { flex: 1; color: var(--fg); }
  .cat-count {
    padding-left: 1.5rem;
    color: var(--fg-mute);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
  /* un-ticked rows recede: dimmed label, fainter count */
  .cat-opt.off .cat-name { color: var(--fg-mute); }
  .cat-opt.off .cat-count { color: color-mix(in srgb, var(--fg-mute) 45%, transparent); }
</style>
