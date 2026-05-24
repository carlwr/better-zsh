import { trim } from "@carlwr/typescript-extra"

import { normalizeOptName } from "./normalize-option.ts"
import type { DocCategory } from "./taxonomy.ts"
import type { Documented, Observed } from "./types.ts"

export { normalizeOptName }

// Per-category normalization. Default is `trim`; categories below the default
// are listed as overrides. `option` normalizes case and strips underscores,
// but does NOT strip `no_` prefixes — negation is a corpus-aware parse
// concern (the "NOTIFY" vs "NO_NOTIFY" ambiguity can only be resolved against
// the actual corpus) and lives in the option resolver / `resolverFeedback`.
const normOverrides: {
  readonly [K in DocCategory]?: (s: string) => string
} = {
  option: s => normalizeOptName(s.trim()),
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
 * Smart constructor for an observed-in-user-code brand. Normalizes `raw` per
 * category and casts to `Observed<K>`. Used by fact extraction.
 *
 * No corpus-aware parsing — call `resolve(corpus, cat, raw)` for that, or
 * `resolverFeedback` for lossy-resolution feedback (e.g. option negation).
 */
export const mkObserved = <K extends DocCategory>(
  cat: K,
  raw: string,
): Observed<K> => norm(cat, raw) as Observed<K>
