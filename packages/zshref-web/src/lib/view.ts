// Pure page-presentation logic: testable without a DOM, templates are thin
// switches over it. Same posture as markdown.ts.

import { z } from "zod"
import {
  type Category,
  categoryLabel,
  type ModelProgress,
  type RankedMatch,
  type RecordId,
  type RecordText,
  recordKey,
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

const RECORD_PARAM = "r"

// The permalink: a query on the one page, a relative reference, so it holds
// under any host and base path. Ids are zsh syntax — `?`, `#`, `%`, `/`, `+`,
// `&` and spaces among them — so each part is percent-encoded in full.
export function recordHref(rec: RecordId): string {
  const enc = encodeURIComponent
  return `?${RECORD_PARAM}=${enc(rec.category)}/${enc(rec.id)}`
}

/** The record a URL links to; null when it links to none (the search). Split
 * at the first `/`: categories never hold one, ids may. A malformed value is
 * still a record wanted — one that matches nothing. */
export function recordParam(url: URL): RecordId | null {
  const r = url.searchParams.get(RECORD_PARAM)
  if (r === null) return null
  const at = r.indexOf("/")
  return at < 0
    ? { category: r, id: "" }
    : { category: r.slice(0, at), id: r.slice(at + 1) }
}

// Match category AND id: an id recurs across categories. Generic over the
// identity alone, so any record shape carrying one can be searched.
export function findRecord<T extends RecordId>(
  records: readonly T[],
  want: RecordId,
): T | undefined {
  return records.find(r => sameRecord(r, want))
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
  /** The linked record (`recordParam`). */
  want: RecordId
}

export function recordView(s: RecordViewInputs): RecordView {
  if (s.loadError) return { kind: "load-error", message: s.loadError }
  if (!s.ready) return { kind: "loading" }
  if (!s.found)
    return {
      kind: "not-found",
      message: `no record "${s.want.id}" in category "${s.want.category}"`,
    }
  return {
    kind: "record",
    record: s.found,
    label: categoryLabel(s.categories, s.found.category),
  }
}

/** What a result card shows of a match. */
export type Hit = Pick<RankedMatch, "rec" | "score">

/** A completed search: its inputs as searched with, and what it found. */
export interface SearchResult {
  query: string
  cats: string[]
  limit: number | null
  total: number
  matches: Hit[]
}

// Search state across a record visit: SvelteKit snapshots it into
// sessionStorage, one blob for all entries, a quota failure losing all — so
// hits travel as keys and come back from the loaded index. Read back as
// untrusted: another build, or anything, may have written it.
const SavedSearchSchema = z.object({
  v: z.literal(1),
  query: z.string(),
  cats: z.array(z.string()),
  limit: z.number().nullable(),
  total: z.number(),
  hits: z.array(
    z.object({ category: z.string(), id: z.string(), score: z.number() }),
  ),
  scrollY: z.number(),
})
export type SavedSearch = z.infer<typeof SavedSearchSchema>

export const saveSearch = (r: SearchResult, scrollY: number): SavedSearch => ({
  v: 1,
  query: r.query,
  cats: r.cats,
  limit: r.limit,
  total: r.total,
  hits: r.matches.map(m => ({
    category: m.rec.category,
    id: m.rec.id,
    score: m.score,
  })),
  scrollY,
})

export const parseSavedSearch = (raw: unknown): SavedSearch | undefined =>
  SavedSearchSchema.safeParse(raw).data

/** A saved search against the loaded artifacts; what they no longer hold
 * (hits, categories) is dropped. */
export function restoreSearch(
  s: SavedSearch,
  a: { records: readonly RecordText[]; categories: readonly Category[] },
): SearchResult {
  const byKey = new Map(a.records.map(r => [recordKey(r), r]))
  const known = new Set(a.categories.map(c => c.id))
  return {
    query: s.query,
    cats: s.cats.filter(c => known.has(c)),
    limit: s.limit,
    total: s.total,
    matches: s.hits.flatMap(h => {
      const rec = byKey.get(recordKey(h))
      return rec ? [{ rec, score: h.score }] : []
    }),
  }
}

/** The navigation that showed a record, as far as the back link cares. */
export interface ArrivalNav {
  // `url` null: the client-rendered first load (`ssr = false`) arrives from
  // `{ url: null }`, not the `null` SvelteKit's types promise
  from: { url: URL | null } | null
  type: string
  delta?: number
}

// The back link can return by traversal (restoring the search's snapshot)
// only when the entry just behind is a search: a push from one, or a
// one-step Forward. Anything else — a deep link, a long history jump, a
// record-to-record hop — and Back would land elsewhere, maybe off-site.
export const searchIsBehind = (nav: ArrivalNav): boolean => {
  const from = nav.from?.url
  return (
    from != null &&
    recordParam(from) === null &&
    (nav.type !== "popstate" || nav.delta === 1)
  )
}

/** A primary click without modifiers: one the page may take over. */
export const plainClick = (e: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
