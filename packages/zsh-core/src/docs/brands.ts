import { trim } from "@carlwr/typescript-extra"

import { normalizeOptName } from "./normalize-option.ts"
import type { DocCategory } from "./taxonomy.ts"
import type { DocRecordBase, Documented } from "./types.ts"

// Per-category normalization. Default is `trim`; categories below the default
// are listed as overrides. `option` normalizes case and strips underscores,
// but does NOT strip `no_` prefixes — negation is a corpus-aware parse
// concern (the "NOTIFY" vs "NO_NOTIFY" ambiguity can only be resolved against
// the actual corpus) and lives in the option resolver, which reports it as
// `input-negated` feedback.
const normOverrides: {
  readonly [K in DocCategory]?: (s: string) => string
} = {
  option: normalizeOptName,
}
const norm = (cat: DocCategory, raw: string) =>
  (normOverrides[cat] ?? trim)(raw)

/**
 * Smart constructor for a corpus-identity brand. Normalizes `raw` per
 * category and casts to `Documented<K>`.
 *
 * **Trusted** path — no corpus check. Calling it claims the result is a key
 * in `corpus[K]`. For corpus construction (Yodl extractors) and test-corpus
 * builders. For untrusted input, go through `resolve(corpus, cat, raw)`.
 */
export const mkDocumented = <K extends DocCategory>(
  cat: K,
  raw: string,
): Documented<K> => norm(cat, raw) as Documented<K>

/**
 * A record's identity fields — `category`, `id`, `display`, in that order,
 * so a spread puts them first. `display` defaults to the id — the rule for
 * every category whose manual form is shell-safe; the others pass the
 * manual's form explicitly (see `DocRecordBase.display`).
 */
export function identity<K extends DocCategory>(
  cat: K,
  raw: string,
  display?: string,
): DocRecordBase<K> {
  const id = mkDocumented(cat, raw)
  return { category: cat, id, display: display ?? id }
}

// MIRRORED-IN: zshref-rs/src/tools/schema.rs
/** `DocRecordBase.id`: printable ASCII, no whitespace, non-empty. */
export const idPattern = /^[\x21-\x7E]+$/
/** `DocRecordBase.display`: printable ASCII, non-empty. */
export const displayPattern = /^[\x20-\x7E]+$/

/** A redirection's `id` from its sig (whitespace → `_`). See `RedirDoc`. */
export const redirSlugFromSig = (sig: string): string =>
  sig.replace(/\s+/g, "_")
