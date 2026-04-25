import {
  type DocCategory,
  type DocCorpus,
  type DocRecordMap,
  docCategories,
  docSubKind,
} from "@carlwr/zsh-core"
import { display } from "./doc-display.ts"

export interface Entry {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  readonly subKind?: string
}

const validCategories = new Set<string>(docCategories)

/**
 * Flat list of candidate entries from the corpus. Cheap: iterates
 * `corpus[cat].keys()` + `docDisplay(cat, rec)`; no markdown rendering.
 * Shared by `search` and `list`.
 */
export function entries(corpus: DocCorpus, cat?: DocCategory): Entry[] {
  if (cat !== undefined && !validCategories.has(cat)) return []
  const cats = cat ? [cat] : docCategories
  const out: Entry[] = []
  for (const c of cats) {
    const map = corpus[c] as ReadonlyMap<string, DocRecordMap[DocCategory]>
    const getSubKind = docSubKind[c] as (
      d: DocRecordMap[DocCategory],
    ) => string | undefined
    for (const [id, rec] of map) {
      const subKind = getSubKind(rec)
      out.push(
        subKind === undefined
          ? { category: c, id, display: display(c, rec) }
          : { category: c, id, display: display(c, rec), subKind },
      )
    }
  }
  return out
}
