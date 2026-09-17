// Pure page-presentation logic: testable without a DOM, templates are thin
// switches over it. Same posture as markdown.ts.

import {
  type Category,
  categoryLabel,
  type ModelProgress,
  type RecordId,
  type RecordText,
  sameRecord,
} from "$nlp"

// Check order is the contract: earlier wins, so an error or cold embedder is
// never masked by a later results/empty branch.
export type ViewState =
  | { kind: "artifacts-error"; message: string }
  | { kind: "loading-artifacts" }
  | { kind: "searching-cold" } // model still downloading
  | { kind: "searching" }
  | { kind: "search-error"; message: string }
  | { kind: "prompt" }
  | { kind: "empty" }
  | { kind: "results" }

export interface ViewInputs {
  artifactsErr: string
  hasArtifacts: boolean
  searching: boolean
  embedderReady: boolean
  searchErr: string
  firstRun: boolean
  matchCount: number
}

export function viewState(s: ViewInputs): ViewState {
  if (s.artifactsErr)
    return { kind: "artifacts-error", message: s.artifactsErr }
  if (!s.hasArtifacts) return { kind: "loading-artifacts" }
  if (s.searching && !s.embedderReady) return { kind: "searching-cold" }
  if (s.searching) return { kind: "searching" }
  if (s.searchErr) return { kind: "search-error", message: s.searchErr }
  if (s.firstRun) return { kind: "prompt" }
  if (s.matchCount === 0) return { kind: "empty" }
  return { kind: "results" }
}

// Every record is scored, so `total` is the corpus/category size, not a hit
// count — a truncated list reads as a ranking, a full list as a count.
export function summaryLine(shown: number, total: number): string {
  if (shown < total) return `top ${shown} of ${total} records`
  return `${total} ${total === 1 ? "record" : "records"}`
}

export const DEFAULT_LIMIT = 20

/** The limit input as searched with: cleared (null) or below 1, the default. */
export const effectiveLimit = (input: number | null): number =>
  input !== null && input >= 1 ? input : DEFAULT_LIMIT

const mb = (bytes: number): number => Math.round(bytes / 1_000_000)

/** The cold-search note: real MB while the model downloads, neutral once the bytes are in. */
export function coldMessage(p: ModelProgress | null): string {
  if (p && p.totalBytes > 0 && p.loadedBytes < p.totalBytes)
    return `loading the embedding model… ${mb(p.loadedBytes)} / ${mb(p.totalBytes)} MB`
  return "preparing the embedding model…"
}

/** Every category ticked; false before the categories are known. */
export const allTicked = (selected: number, all: number): boolean =>
  all > 0 && selected === all

/** The category filter's collapsed summary. */
export const categorySummary = (selected: number, all: number): string =>
  allTicked(selected, all)
    ? "all"
    : selected === 0
      ? "none"
      : `${selected} selected`

// The permalink. Ids are zsh syntax — `?`, `#`, `%`, `/` and spaces among
// them — so each segment is percent-encoded; the route decodes its params.
export function recordHref(rec: RecordId): string {
  return `/r/${encodeURIComponent(rec.category)}/${encodeURIComponent(rec.id)}`
}

// Match category AND id: an id recurs across categories. Generic so tests pass
// {text:{category,id}}, not full index vectors.
export function findRecord<T extends { text: RecordId }>(
  records: readonly T[],
  want: RecordId,
): T | undefined {
  return records.find(r => sameRecord(r.text, want))
}

// not-found is distinct from load-error: a stale deep link is expected (render
// calmly), a load failure is a fault. Load failure outranks all, as on search.
export type RecordView =
  | { kind: "loading" }
  | { kind: "load-error"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "record"; record: RecordText; label: string }

export interface RecordViewInputs {
  loadError: string
  ready: boolean // artifacts resolved
  found: RecordText | undefined
  categories: readonly Category[]
  /** The route's (decoded) params. */
  want: RecordId
}

export function recordView(s: RecordViewInputs): RecordView {
  if (s.loadError) return { kind: "load-error", message: s.loadError }
  if (!s.ready) return { kind: "loading" }
  if (!s.found)
    return { kind: "not-found", message: `no record at ${recordHref(s.want)}` }
  return {
    kind: "record",
    record: s.found,
    label: categoryLabel(s.categories, s.found.category),
  }
}
