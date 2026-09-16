// Shared fixtures. Pure (no IO); excluded from the test glob (not *.test.ts).

import {
  DIMS,
  type IndexedRecord,
  type RecordText,
  type VectorIndex,
  type ViewVectors,
} from "../nlp/core/types"
import { syntheticVec } from "../nlp/node/fixtures"
import { INDEX_VERSION, viewVectors } from "../nlp/node/index-build"

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
  viewVectors(view => syntheticVec([category, id, view]))

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
