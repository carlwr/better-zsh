// The built search artifact: two files, one index.
//
// - the JSON half, `search-index.json` — the header and every record's text
// - the vector half, `search-vectors.bin` — the float matrix
//
// Two files rather than one container because static hosts gzip JSON and
// not binary types, so a merged file would lose compression on its text
// half — and because the record page wants the text alone. A stale half
// would rank against the wrong records in silence, so both carry the same
// `corpus_hash` and joining them checks it. That catches a pair from two
// corpora, not two builds of one corpus under different rules; against
// those, `writeIndex` orders its renames so an interrupted build fails
// validation, and a deploy must ship the two together.

import { z } from "zod"

import {
  type IndexedRecord,
  indexHeaderShape,
  RecordTextSchema,
  type VectorIndex,
} from "./types"
import { decodeVectorBlob } from "./vector-blob"

/** Bumped when either half's shape changes; the JSON half pins it, so a
 * cached artifact of an older build is rejected rather than ranked with. */
export const INDEX_VERSION = 3

export const SearchIndexTextSchema = z.object({
  version: z.literal(INDEX_VERSION),
  ...indexHeaderShape,
  records: z.array(RecordTextSchema),
})
export type SearchIndexText = z.infer<typeof SearchIndexTextSchema>

const disagree = (why: string): Error =>
  new Error(`search index halves disagree: ${why}`)

export function joinSearchIndex(
  text: SearchIndexText,
  vectors: ArrayBuffer,
): VectorIndex {
  const { records, ...header } = text
  const blob = decodeVectorBlob(vectors)
  if (blob.corpusHash !== header.corpus_hash) {
    throw disagree(
      `vectors of corpus ${blob.corpusHash}, text of ${header.corpus_hash}`,
    )
  }
  if (blob.dims !== header.dims)
    throw disagree(`${blob.dims}-dim vectors, text declares ${header.dims}`)
  if (blob.vectors.length !== records.length) {
    throw disagree(
      `${blob.vectors.length} vector records, ${records.length} texts`,
    )
  }
  return {
    ...header,
    records: records.map((text, at): IndexedRecord => {
      const vectors = blob.vectors[at]
      if (!vectors) throw new Error("record count checked")
      return { text, vectors }
    }),
  }
}

/** Both halves from the wire: parse the JSON, then join. A caller holding a
 * parsed half — the browser, which fetched it for the record page — calls
 * `joinSearchIndex` and is type-checked instead of parsed twice. */
export const loadSearchIndex = (
  json: unknown,
  vectors: ArrayBuffer,
): VectorIndex => joinSearchIndex(SearchIndexTextSchema.parse(json), vectors)
