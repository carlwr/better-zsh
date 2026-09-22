// Shared fixtures. Pure (no IO); excluded from the test glob (not *.test.ts).

import { lookupIndex } from "../nlp/core/lookup-map"
import { INDEX_VERSION } from "../nlp/core/search-index"
import {
  DIMS,
  type IndexedRecord,
  perView,
  type RecordText,
  type VectorIndex,
  type ViewVectors,
} from "../nlp/core/types"
import { syntheticVec } from "../nlp/core/vec"

export function makeRecordText(over: Partial<RecordText> = {}): RecordText {
  return {
    category: "builtin",
    category_label: "Builtins",
    id: "echo",
    display: "echo",
    title: "`echo`",
    md_body: "irrelevant",
    structured: "",
    body: "",
    expanded: "",
    ...over,
  }
}

/** A record's view vectors, synthetic: a function of its identity and the view. */
export const syntheticVectors = (category: string, id: string): ViewVectors =>
  perView(view => syntheticVec([category, id, view]))

/** The index envelope around `records` (synthetic vectors expected). */
export const syntheticIndexOf = (records: IndexedRecord[]): VectorIndex => ({
  version: INDEX_VERSION,
  model: "synthetic",
  dims: DIMS,
  normalized: true,
  corpus_hash: "synthetic",
  records,
})

/** A minimal index over `(category, id)` pairs. */
export const syntheticIndex = (
  records: readonly (readonly [category: string, id: string])[],
): VectorIndex =>
  syntheticIndexOf(
    records.map(([category, id]) => ({
      text: makeRecordText({ category, id, display: id }),
      vectors: syntheticVectors(category, id),
    })),
  )

/** A lookup that hits nothing: the ranker alone decides the order. */
export const emptyLookup = () => lookupIndex({ version: 1, entries: [] })
