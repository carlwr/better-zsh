import type { DocCorpus } from "../docs/corpus.ts"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docId,
} from "../docs/taxonomy.ts"
import type { Proven, ZshOption } from "../docs/types.ts"
import { type MdCtx, mdRenderer, mkMdCtx } from "./md.ts"

export interface RefDocBase<K extends DocCategory, I extends string> {
  readonly kind: K
  readonly id: I
  /** Display heading used in dump output; may differ from the typed `id`. */
  readonly heading: string
  readonly md: string
}

/** Rendered reference markdown for one logical zsh item. */
export type RefDoc = {
  [K in DocCategory]: RefDocBase<K, Proven<K>>
}[DocCategory]

function docHeading<K extends DocCategory>(
  kind: K,
  doc: DocRecordMap[K],
): string {
  if (kind === "option") return (doc as ZshOption).display
  return docId[kind](doc) as string
}

// Keep corpus assembly separate from markdown rendering so consumers can compose
// the rendered reference corpus independently.
function mkRefDocs<K extends DocCategory>(
  kind: K,
  docs: readonly DocRecordMap[K][],
  ctx: MdCtx,
): RefDocBase<K, Proven<K>>[] {
  return docs.map((doc) => ({
    kind,
    id: docId[kind](doc),
    heading: docHeading(kind, doc),
    md: mdRenderer[kind](doc, ctx),
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
  if (kind !== "shell_param") return vals
  return [...vals].sort((a, b) =>
    (a as { name: string }).name.localeCompare((b as { name: string }).name),
  )
}

/** Generate the full static reference corpus from a `DocCorpus`. */
export function refDocs(corpus: DocCorpus): readonly RefDoc[] {
  const ctx = mkMdCtx([...corpus.option.values()])
  const out: RefDoc[] = []
  for (const kind of docCategories) {
    out.push(...(mkRefDocs(kind, corpusDocs(corpus, kind), ctx) as RefDoc[]))
  }
  return out
}
