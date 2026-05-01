// MIRRORED-IN: zshref-rs/src/tools/envelope.rs

import {
  type DocCategory,
  docCategories,
  docCategoryLabels,
} from "@carlwr/zsh-core/taxonomy"

const VALID_CATEGORIES: ReadonlySet<string> = new Set(docCategories)

/** Runtime guard for adapter-supplied strings claiming to be a category. */
export function isValidCategory(cat: unknown): cat is DocCategory {
  return typeof cat === "string" && VALID_CATEGORIES.has(cat)
}

/** Result envelope: match list + returned/total counts. Rust CLI emits the same shape. */
export interface Envelope<M> {
  readonly matches: readonly M[]
  readonly matchesReturned: number
  readonly matchesTotal: number
}

export function mkEnvelope<M>(
  matches: readonly M[],
  total: number = matches.length,
): Envelope<M> {
  return { matches, matchesReturned: matches.length, matchesTotal: total }
}

export function categoryList(
  cats: readonly DocCategory[] = docCategories,
  opts: { readonly withLabel?: boolean } = {},
): string {
  const fmt = opts.withLabel
    ? (c: DocCategory) => `  - '${c}'  (${docCategoryLabels[c]})`
    : (c: DocCategory) => `  - '${c}'`
  return cats.map(fmt).join("\n")
}
