import type { DocCorpus } from "../docs/corpus.ts"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docDisplay,
  docId,
} from "../docs/taxonomy.ts"
import type { Documented } from "../docs/types.ts"
import { renderRecord } from "./md.ts"

export interface RefDocBase<K extends DocCategory, I extends string> {
  readonly kind: K
  readonly id: I
  /** Display heading used in dump output; may differ from the typed `id`. */
  readonly heading: string
  readonly md: string
}

/** Rendered reference markdown for one logical zsh item. */
export type RefDoc = {
  [K in DocCategory]: RefDocBase<K, Documented<K>>
}[DocCategory]

function mkRefDocs<K extends DocCategory>(
  kind: K,
  docs: readonly DocRecordMap[K][],
  corpus: DocCorpus,
): RefDocBase<K, Documented<K>>[] {
  return docs.map(doc => ({
    kind,
    id: docId[kind](doc),
    heading: docDisplay(kind, doc),
    md: renderRecord(corpus, kind, doc),
  }))
}

function corpusDocs<K extends DocCategory>(
  corpus: DocCorpus,
  kind: K,
): readonly DocRecordMap[K][] {
  // The ReadonlyMap value type for each category is exactly DocRecordMap[K];
  // spreading Map.values() erases the specific key so we re-assert here.
  const vals = [
    ...(corpus[kind] as ReadonlyMap<unknown, DocRecordMap[K]>).values(),
  ]
  // `special_param` records arrive grouped by source file (shell-set →
  // zle-widget → completion-widget); alphabetize for a stable, predictable
  // consumer-visible ordering.
  if (kind === "special_param") {
    const name = (d: DocRecordMap[K]) => (d as { name: string }).name
    vals.sort((a, b) => name(a).localeCompare(name(b)))
  }
  return vals
}

/** Generate the full static reference corpus from a `DocCorpus`. */
export function refDocs(corpus: DocCorpus): readonly RefDoc[] {
  return docCategories.flatMap(
    kind => mkRefDocs(kind, corpusDocs(corpus, kind), corpus) as RefDoc[],
  )
}
