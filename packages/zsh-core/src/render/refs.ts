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

interface RefDocK<K extends DocCategory> {
  readonly kind: K
  readonly id: Documented<K>
  /** Display heading used in dump output; may differ from the typed `id`. */
  readonly heading: string
  readonly md: string
}

/** Rendered reference markdown for one logical zsh item. */
export type RefDoc = { [K in DocCategory]: RefDocK<K> }[DocCategory]

function mkRefDocs<K extends DocCategory>(
  kind: K,
  docs: readonly DocRecordMap[K][],
  corpus: DocCorpus,
): RefDocK<K>[] {
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
  const vals = [...corpus[kind].values()]
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
