<script lang="ts">
  // The search: mounting it loads the full artifacts, vectors included.
  import { tick } from "svelte"
  import { errMsg } from "$lib/errors"
  import {
    allTicked,
    coldMessage,
    DEFAULT_LIMIT,
    effectiveLimit,
    type Hit,
    parseSavedSearch,
    restoreSearch,
    type SavedSearch,
    type SearchResult,
    saveSearch,
    summaryLine,
    viewState,
  } from "$lib/view"
  import {
    type Artifacts,
    categoryCounts,
    categoryLabel,
    getArtifacts,
    type ModelProgress,
    onModelProgress,
    recordKey,
    search,
  } from "$nlp"
  import CategoryFilter from "./CategoryFilter.svelte"
  import ResultCard from "./ResultCard.svelte"

  let artifacts = $state<Artifacts | null>(null)
  let artifactsErr = $state("")
  let searchErr = $state("")
  let query = $state("")
  let selectedCats = $state<string[]>([]) // ticked categories; initialised to all on load
  let limit = $state<number | null>(DEFAULT_LIMIT) // null once cleared
  let matches = $state<Hit[]>([])
  let total = $state(0)
  let searching = $state(false)
  let firstRun = $state(true)
  let embedderReady = $state(false) // gates the first-run download hint
  let modelProgress = $state<ModelProgress | null>(null) // live one-time download
  let section: HTMLElement | undefined = $state()

  // What a snapshot saves: the last completed search, never one in flight —
  // its results are still the previous one's until it settles.
  let done: SearchResult | undefined
  // A snapshot restored before the artifacts it rebuilds from have loaded.
  let pending: SavedSearch | undefined

  // The embedder's one listener slot: taken for this view's life, released
  // on leave so a stale view never receives progress.
  $effect(() => {
    onModelProgress(p => (modelProgress = p))
    return () => onModelProgress(null)
  })

  // what to show; precedence lives in viewState
  let view = $derived(
    viewState({
      artifactsErr,
      hasArtifacts: artifacts !== null,
      searching,
      embedderReady,
      searchErr,
      firstRun,
      matchCount: matches.length,
    }),
  )

  let categories = $derived(artifacts?.categories ?? [])
  let catCounts = $derived(
    artifacts ? categoryCounts(artifacts.index) : new Map<string, number>(),
  )
  let allSelected = $derived(allTicked(selectedCats.length, categories.length))

  $effect(() => {
    void (async () => {
      try {
        artifacts = await getArtifacts()
        // A restored search brings its own filter: applied instead, never
        // after, or the default would overwrite it.
        if (pending) apply(pending)
        // Start with every category ticked; filtering is by un-ticking.
        else selectedCats = artifacts.categories.map(c => c.id)
      } catch (e) {
        artifactsErr = errMsg(e)
      }
    })()
  })

  async function run() {
    if (!artifacts || query.trim() === "") {
      matches = []
      total = 0
      done = undefined
      return
    }
    searching = true
    firstRun = false
    searchErr = ""
    const asked = { query, cats: [...selectedCats], limit }
    try {
      const r = await search({
        query,
        index: artifacts.index,
        rules: artifacts.rules,
        lookup: artifacts.lookup,
        limit: effectiveLimit(limit),
        // all ticked → null (no filter); otherwise the ticked set ([] = none)
        categories: allSelected ? null : selectedCats,
      })
      matches = r.matches
      total = r.total
      embedderReady = true
      done = { ...asked, total: r.total, matches: r.matches }
    } catch (e) {
      searchErr = errMsg(e)
      matches = []
      total = 0
      done = undefined
    } finally {
      searching = false
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    run()
  }

  // Examples span the input styles the search handles well, to show none is
  // privileged: a natural-language question, a plain topic description, and a
  // canonical identifier (resolver-routed via the lookup map). The first two go
  // through the embedder + ranker and need no exact identifier knowledge.
  const examples = [
    { hint: "a question", q: "how do I make globbing case-insensitive?" },
    { hint: "a description", q: "run a command before each prompt" },
    { hint: "an identifier", q: "AUTO_CD" },
  ] as const

  function runExample(q: string) {
    query = q
    run()
  }

  /** For the page's snapshot; nothing when no search has completed. */
  export function capture(): SavedSearch | undefined {
    return done && saveSearch(done, scrollY)
  }

  /** For the page's snapshot: the saved value is untrusted, a malformed one
   * leaves the view as is. */
  export function restore(raw: unknown) {
    pending = parseSavedSearch(raw)
    if (pending && artifacts) apply(pending)
  }

  // Rebuilt from the index by key: no embedding, no model download.
  function apply(s: SavedSearch) {
    if (!artifacts) return
    pending = undefined
    done = restoreSearch(s, {
      records: artifacts.index.records.map(r => r.text),
      categories: artifacts.categories,
    })
    query = done.query
    selectedCats = [...done.cats] // the filter mutates its own copy
    limit = done.limit
    total = done.total
    matches = done.matches
    firstRun = false
    void tick().then(() => holdScroll(s.scrollY))
  }

  // SvelteKit's own scroll restore ran on a page still short of results, and
  // result bodies render async — a cold highlighter late, once the page is
  // already tall — so re-apply on every growth until the user takes over or
  // a deadline. Tall enough is no stop: bodies rendering above would carry
  // the view off (scroll anchoring).
  let stopHold: (() => void) | undefined
  $effect(() => () => stopHold?.()) // leaving mid-hold must not scroll the next view

  function holdScroll(y: number) {
    if (!section) return
    stopHold?.()
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const
    const stop = () => {
      ro.disconnect()
      clearTimeout(timer)
      for (const ev of inputs) removeEventListener(ev, stop)
      stopHold = undefined
    }
    stopHold = stop
    const ro = new ResizeObserver(() => scrollTo(0, y))
    const timer = setTimeout(stop, 5000)
    for (const ev of inputs) addEventListener(ev, stop, { passive: true })
    ro.observe(section)
  }
</script>

<section bind:this={section}>
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
      <CategoryFilter {categories} counts={catCounts} bind:selected={selectedCats} />
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
    <p>run <code>pnpm build:index</code> to build them.</p>
  {:else if view.kind === 'loading-artifacts'}
    <p class="muted">loading artifacts…</p>
  {:else if view.kind === 'searching-cold'}
    <p class="muted">{coldMessage(modelProgress)}</p>
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
        <ResultCard match={m} label={categoryLabel(categories, m.rec.category)} />
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
