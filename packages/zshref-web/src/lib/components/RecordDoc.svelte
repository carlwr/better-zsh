<script lang="ts">
  // One record, whole: the permalink's view.
  import { afterNavigate } from "$app/navigation"
  import { resolve } from "$app/paths"
  import { errMsg } from "$lib/errors"
  import { renderInline } from "$lib/markdown"
  import { findRecord, plainClick, recordView, searchIsBehind } from "$lib/view"
  import { getTextArtifacts, type RecordId, type TextArtifacts } from "$nlp"
  import Md from "./Md.svelte"

  let { want }: { want: RecordId } = $props()

  let artifacts = $state<TextArtifacts | null>(null)
  let loadError = $state("")

  // Back to a search entry restores it (the page's snapshot); the href, a
  // fresh search, is the fallback when none is just behind.
  let traverse = $state(false)
  afterNavigate(nav => (traverse = searchIsBehind(nav)))

  function back(e: MouseEvent) {
    if (!traverse || !plainClick(e)) return
    e.preventDefault()
    history.back()
  }

  // Load once (record-independent, memoized); the lookup is the synchronous
  // derivation below, so navigation needs no out-of-order guard.
  // The text half only — showing a record needs no vectors.
  $effect(() => {
    void (async () => {
      try {
        artifacts = await getTextArtifacts()
      } catch (e) {
        loadError = errMsg(e)
      }
    })()
  })

  let view = $derived(
    recordView({
      loadError,
      ready: artifacts !== null,
      found: artifacts ? findRecord(artifacts.index.records, want) : undefined,
      categories: artifacts?.categories ?? [],
      want,
    }),
  )
</script>

<section>
  <a class="back" href={resolve("/")} onclick={back}>← search</a>
  {#if view.kind === 'load-error'}
    <p class="err">{view.message}</p>
  {:else if view.kind === 'loading'}
    <p class="muted">loading…</p>
  {:else if view.kind === 'not-found'}
    <p class="muted">{view.message}</p>
  {:else}
    <header>
      <span class="cat">{view.label}</span>
      <!-- title split out of md_body upstream; body no longer repeats it -->
      <h1>{@html renderInline(view.record.title)}</h1>
      {#if view.record.sub_kind}<span class="sub">— {view.record.sub_kind}</span>{/if}
    </header>
    <Md source={view.record.md_body} />
  {/if}
</section>

<style>
  .back { color: var(--fg-mute); font-size: 0.9rem; }
  header { margin: 1rem 0 1.5rem; }
  .cat { color: var(--fg-mute); font-size: 0.9rem; }
  h1 { margin: 0.1em 0; font-family: var(--font-mono); }
  .sub { color: var(--fg-mute); font-size: 0.9rem; }
  .muted { color: var(--fg-mute); }
  .err { color: var(--danger); }
</style>
