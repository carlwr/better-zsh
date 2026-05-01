// MIRRORED-IN: zshref-rs/src/tools/envelope.rs

import type { DocCorpus } from "@carlwr/zsh-core"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docSubKind,
} from "@carlwr/zsh-core/taxonomy"
import { display } from "./doc-display.ts"
import { isValidCategory } from "./result.ts"

export interface BaseMatch {
  readonly category: DocCategory
  readonly id: string
  readonly display: string
  readonly subKind?: string
}

/**
 * Flat list of corpus entries (display strings; no markdown). Shared by
 * `search` and `list`.
 */
export function entries(corpus: DocCorpus, cat?: DocCategory): BaseMatch[] {
  if (cat !== undefined && !isValidCategory(cat)) return []
  const cats = cat ? [cat] : docCategories
  const out: BaseMatch[] = []
  for (const c of cats) {
    const map = corpus[c] as ReadonlyMap<string, DocRecordMap[DocCategory]>
    const getSubKind = docSubKind[c] as (
      d: DocRecordMap[DocCategory],
    ) => string | undefined
    for (const [id, rec] of map) {
      const subKind = getSubKind(rec)
      out.push({
        category: c,
        id,
        display: display(c, rec),
        ...(subKind !== undefined ? { subKind } : {}),
      })
    }
  }
  return out
}
