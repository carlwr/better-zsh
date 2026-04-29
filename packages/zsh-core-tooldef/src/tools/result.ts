import {
  type DocCategory,
  docCategories,
  docCategoryLabels,
} from "@carlwr/zsh-core"

const VALID_CATEGORIES: ReadonlySet<string> = new Set(docCategories)

/** Runtime guard for adapter-supplied strings claiming to be a category. */
export function isValidCategory(cat: unknown): cat is DocCategory {
  return typeof cat === "string" && VALID_CATEGORIES.has(cat)
}

/**
 * Build the `{ matches, matchesReturned, matchesTotal }` envelope every tool
 * returns. `matchesReturned` is always `matches.length`; `total` is the
 * pre-truncation count — for tools that don't truncate (`docs`), omit
 * (defaults to `matches.length`). Mirror of `mk_envelope` in
 * `zshref-rs/src/tools/shared.rs`.
 */
export function mkEnvelope<T>(
  matches: readonly T[],
  total: number = matches.length,
): {
  readonly matches: readonly T[]
  readonly matchesReturned: number
  readonly matchesTotal: number
} {
  return { matches, matchesReturned: matches.length, matchesTotal: total }
}

/** `  - 'name'` lines, one per category. Order = caller-supplied. */
export function brandedCategoryList(
  cats: readonly DocCategory[] = docCategories,
): string {
  return cats.map(c => `  - '${c}'`).join("\n")
}

/** `  - 'name'  (Label)` lines, one per category. Order = caller-supplied. */
export function humanCategoryList(cats: readonly DocCategory[]): string {
  return cats.map(c => `  - '${c}'  (${docCategoryLabels[c]})`).join("\n")
}
