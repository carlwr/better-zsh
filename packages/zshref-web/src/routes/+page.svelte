<script lang="ts">
  import { getArtifacts, categoryLabel as lookupLabel, type Artifacts } from '$lib/artifacts';
  import { onModelProgress, type ModelProgress } from '$lib/embedder';
  import { errMsg } from '$lib/errors';
  import { search } from '$lib/search';
  import type { RankedMatch } from '$lib/ranker/types';
  import ResultCard from '$lib/components/ResultCard.svelte';
  import { recordKey, summaryLine, viewState } from '$lib/view';

  let artifacts = $state<Artifacts | null>(null);
  let artifactsErr = $state('');
  let searchErr = $state('');
  let query = $state('');
  let selectedCats = $state<string[]>([]); // ticked categories; initialised to all on load
  let catOpen = $state(false); // category popover open?
  let catDetails: HTMLDetailsElement | undefined = $state();
  let limit = $state(20);
  let matches = $state<RankedMatch[]>([]);
  let total = $state(0);
  let searching = $state(false);
  let firstRun = $state(true);
  let embedderReady = $state(false); // gates the first-run download hint
  let modelProgress = $state<ModelProgress | null>(null); // live one-time download

  onModelProgress((p) => (modelProgress = p));

  function mb(bytes: number): number {
    return Math.round(bytes / 1_000_000);
  }

  // Collapse the category popover on any click outside it.
  function onDocPointerDown(e: MouseEvent) {
    if (catOpen && catDetails && !catDetails.contains(e.target as Node)) {
      catOpen = false;
    }
  }

  // what to show; precedence lives in viewState
  let view = $derived(
    viewState({
      artifactsErr,
      hasArtifacts: artifacts !== null,
      searching,
      embedderReady,
      searchErr,
      firstRun,
      matchCount: matches.length
    })
  );

  // categories.json label, not RecordText.category_label (heuristic-embedded)
  function categoryLabel(id: string): string {
    return artifacts ? lookupLabel(artifacts.categories, id) : id;
  }

  // Record count per category, from the loaded index — drives the per-category
  // counts shown beside each filter checkbox.
  let catCounts = $derived.by(() => {
    const m = new Map<string, number>();
    if (artifacts) {
      for (const r of artifacts.index.records) {
        m.set(r.text.category, (m.get(r.text.category) ?? 0) + 1);
      }
    }
    return m;
  });

  let allCatIds = $derived(artifacts ? artifacts.categories.map((c) => c.id) : []);
  let allSelected = $derived(
    allCatIds.length > 0 && selectedCats.length === allCatIds.length
  );
  let catSummary = $derived(
    allSelected ? 'all' : selectedCats.length === 0 ? 'none' : `${selectedCats.length} selected`
  );

  // First-run model fetch: show real bytes while downloading, a neutral note
  // once bytes are in and we're embedding/ranking.
  let coldMsg = $derived.by(() => {
    const p = modelProgress;
    if (p && p.totalBytes > 0 && p.loadedBytes < p.totalBytes) {
      return `loading the embedding model… ${mb(p.loadedBytes)} / ${mb(p.totalBytes)} MB`;
    }
    return 'preparing the embedding model…';
  });

  $effect(() => {
    void (async () => {
      try {
        artifacts = await getArtifacts();
        // Start with every category ticked; filtering is by un-ticking.
        selectedCats = artifacts.categories.map((c) => c.id);
      } catch (e) {
        artifactsErr = errMsg(e);
      }
    })();
  });

  async function run() {
    if (!artifacts || query.trim() === '') {
      matches = [];
      total = 0;
      return;
    }
    searching = true;
    firstRun = false;
    searchErr = '';
    try {
      const r = await search({
        query,
        index: artifacts.index,
        rules: artifacts.rules,
        lookup: artifacts.lookup,
        limit,
        // all ticked → null (no filter); otherwise the ticked set ([] = none)
        categories: allSelected ? null : selectedCats
      });
      matches = r.matches;
      total = r.total;
      embedderReady = true;
    } catch (e) {
      searchErr = errMsg(e);
      matches = [];
      total = 0;
    } finally {
      searching = false;
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    run();
  }

  // Examples span the input styles the search handles well, to show none is
  // privileged: a natural-language question, a plain topic description, and a
  // canonical identifier (resolver-routed via the lookup map). The first two go
  // through the embedder + ranker and need no exact identifier knowledge.
  const examples = [
    { hint: 'a question', q: 'how do I make globbing case-insensitive?' },
    { hint: 'a description', q: 'run a command before each prompt' },
    { hint: 'an identifier', q: 'AUTO_CD' }
  ] as const;

  function runExample(q: string) {
    query = q;
    run();
  }
</script>

<svelte:window onpointerdown={onDocPointerDown} />

<section>
  <form onsubmit={handleSubmit}>
    <input
      type="search"
      placeholder="Ask or describe what you're looking for…"
      bind:value={query}
    />
    <div class="examples">
      <span class="examples-label">try:</span>
      {#each examples as ex (ex.q)}
        <button
          type="button"
          class="example"
          disabled={!artifacts || searching}
          onclick={() => runExample(ex.q)}
          title={ex.hint}
        >
          {ex.q}
        </button>
      {/each}
    </div>
    <div class="controls">
      <details class="catfilter" bind:open={catOpen} bind:this={catDetails}>
        <summary><span class="cat-tag">categories</span> {catSummary}</summary>
        <div class="cat-panel">
          <div class="cat-panel-head">
            <span class="muted">filter by category</span>
            <span class="cat-actions">
              <button
                type="button"
                class="linkish"
                disabled={allSelected}
                onclick={() => (selectedCats = allCatIds)}
              >
                all
              </button>
              <button
                type="button"
                class="linkish"
                disabled={selectedCats.length === 0}
                onclick={() => (selectedCats = [])}
              >
                none
              </button>
            </span>
          </div>
          <div class="cat-grid">
            {#if artifacts}
              {#each artifacts.categories as c (c.id)}
                <label class="cat-opt" class:off={!selectedCats.includes(c.id)}>
                  <input type="checkbox" value={c.id} bind:group={selectedCats} />
                  <span class="cat-name">{c.label}</span>
                  <span class="cat-count">{catCounts.get(c.id) ?? 0}</span>
                </label>
              {/each}
            {/if}
          </div>
        </div>
      </details>
      <label class="limit">
        limit
        <input type="number" min="1" max="50" bind:value={limit} />
      </label>
      <button type="submit" disabled={!artifacts || searching}>
        {searching ? 'searching…' : 'search'}
      </button>
    </div>
  </form>

  {#if view.kind === 'artifacts-error'}
    <p class="err">artifacts failed to load: <code>{view.message}</code></p>
    <p>run <code>./scripts/fetch-artifacts</code> to stage them.</p>
  {:else if view.kind === 'loading-artifacts'}
    <p class="muted">loading artifacts…</p>
  {:else if view.kind === 'searching-cold'}
    <p class="muted">{coldMsg}</p>
  {:else if view.kind === 'searching'}
    <p class="muted">searching…</p>
  {:else if view.kind === 'search-error'}
    <p class="err">search failed: <code>{view.message}</code></p>
  {:else if view.kind === 'prompt'}
    <p class="hint">
      Your first search loads the embedding model that powers natural-language search — about
      130&nbsp;MB, kept for next time.
    </p>
  {:else if view.kind === 'empty'}
    <p class="muted">no matches.</p>
  {:else}
    <p class="meta">{summaryLine(matches.length, total)}</p>
    <ul class="hits">
      {#each matches as m (recordKey(m.rec))}
        <ResultCard match={m} label={categoryLabel(m.rec.category)} />
      {/each}
    </ul>
  {/if}
</section>

<style>
  form { margin-bottom: 1.5rem; }
  .controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .examples {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.6rem;
    flex-wrap: wrap;
    align-items: center;
    font-size: 0.85rem;
  }
  .examples-label {
    color: var(--fg-mute);
  }
  .example {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.2rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--fg-mute);
    cursor: pointer;
  }
  .example:hover:not(:disabled) {
    border-color: var(--fg-mute);
    color: var(--fg);
  }
  .example:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .limit {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    color: var(--fg-mute);
  }
  .controls input[type='number'] {
    width: 4rem;
    padding: 0.3rem 0.4rem;
  }

  /* category filter — collapsed by default; multi-select with per-cat counts.
     Panel floats so opening it never reflows the limit/search controls. */
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
  .meta { color: var(--fg-mute); font-size: 0.85rem; }
  .muted { color: var(--fg-mute); }
  /* first-run note: a polished sentence, not a status line — smaller than the
     doc body, constrained so it wraps to a tidy block rather than one long row */
  .hint {
    color: var(--fg-mute);
    font-size: 0.9rem;
    line-height: 1.5;
    max-width: 36rem;
  }
  .err { color: var(--danger); }
  .hits {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
</style>
