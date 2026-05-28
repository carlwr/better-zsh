<script lang="ts">
  import { page } from '$app/state';
  import { getArtifacts, type Artifacts } from '$lib/artifacts';
  import { errMsg } from '$lib/errors';
  import Md from '$lib/components/Md.svelte';
  import { renderInline } from '$lib/markdown';
  import { findRecord, recordView } from '$lib/view';

  let artifacts = $state<Artifacts | null>(null);
  let loadError = $state('');

  // Load once (param-independent, memoized); the param-dependent lookup is the
  // synchronous derivation below, so navigation needs no out-of-order guard.
  $effect(() => {
    void (async () => {
      try {
        artifacts = await getArtifacts();
      } catch (e) {
        loadError = errMsg(e);
      }
    })();
  });

  // Route matches only with both segments, so always strings at runtime;
  // Record<string,string> loses that under noUncheckedIndexedAccess.
  let params = $derived(page.params as { category: string; id: string });

  let view = $derived(
    recordView({
      loadError,
      ready: artifacts !== null,
      found: artifacts
        ? findRecord(artifacts.index.records, params.category, params.id)?.text
        : undefined,
      categories: artifacts?.categories ?? [],
      category: params.category,
      id: params.id
    })
  );
</script>

<section>
  <a class="back" href="/">← search</a>
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
