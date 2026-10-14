<script lang="ts">
  // The one page: a record link (`recordHref`) shows that record, anything
  // else the search. Links change only the query, so navigating between the
  // two swaps the view without leaving the page.
  import type { Snapshot } from "@sveltejs/kit"
  import { page } from "$app/state"
  import RecordDoc from "$lib/components/RecordDoc.svelte"
  import SearchView from "$lib/components/SearchView.svelte"
  import { recordParam, type SavedSearch } from "$lib/view"

  let want = $derived(recordParam(page.url))
  let searchView = $state.raw<ReturnType<typeof SearchView>>()

  // Only pages and layouts take part in snapshots, so the page relays the
  // search's: Back from a record finds the search as it was left.
  export const snapshot: Snapshot<SavedSearch | undefined> = {
    capture: () => searchView?.capture(),
    restore: s => searchView?.restore(s),
  }
</script>

<!-- never both: the search's mount downloads the vectors, a record needs none -->
{#if want}
  <RecordDoc {want} />
{:else}
  <SearchView bind:this={searchView} />
{/if}
