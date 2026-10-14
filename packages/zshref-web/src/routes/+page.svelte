<script lang="ts">
  // The one page: a record link (`recordHref`) shows that record, anything
  // else the search. Links change only the query, so navigating between the
  // two swaps the view without leaving the page.
  import { page } from "$app/state"
  import RecordDoc from "$lib/components/RecordDoc.svelte"
  import SearchView from "$lib/components/SearchView.svelte"
  import { recordParam } from "$lib/view"

  let want = $derived(recordParam(page.url))
</script>

<!-- never both: the search's mount downloads the vectors, a record needs none -->
{#if want}
  <RecordDoc {want} />
{:else}
  <SearchView />
{/if}
