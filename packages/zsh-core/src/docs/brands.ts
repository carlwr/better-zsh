import { normalizeOptName } from "./normalize-option.ts"
import type { DocCategory } from "./taxonomy.ts"
import type { Documented, Observed } from "./types.ts"

export { normalizeOptName }

// Per-category normalization. Default is `trim`; categories below the default
// are listed as overrides. `option` normalizes case and strips underscores,
// but does NOT strip `no_` prefixes — negation is a corpus-aware parse
// concern (the "NOTIFY" vs "NO_NOTIFY" ambiguity can only be resolved against
// the actual corpus) and lives in the option resolver / `resolverFeedback`.
const trim = (s: string) => s.trim()
const normOverrides: {
  readonly [K in DocCategory]?: (s: string) => string
} = {
  option: s => normalizeOptName(s.trim()),
}
const norm = (cat: DocCategory, raw: string) =>
  (normOverrides[cat] ?? trim)(raw)

/**
 * Smart constructor for a corpus-identity brand. Normalizes `raw` per category
 * and casts to `Documented<K>`.
 *
 * This is the **trusted** path — it performs no corpus check. Calling it is a
 * claim that the resulting string is a key in `corpus[K]`. Intended for
 * corpus construction (Yodl extractors) and test-corpus builders. For
 * untrusted input (user code etc.), go through `resolve(corpus, cat, raw)`.
 */
export const mkDocumented = <K extends DocCategory>(
  cat: K,
  raw: string,
): Documented<K> => norm(cat, raw) as Documented<K>

/**
 * Smart constructor for an observed-in-user-code brand. Normalizes `raw` per
 * category and casts to `Observed<K>`. Used by fact extraction.
 *
 * This does NOT perform corpus-aware parsing; for that, call the resolver
 * layer (`resolve(corpus, cat, raw)`); for lossy-resolution feedback (e.g.
 * option negation), call `resolverFeedback`.
 */
export const mkObserved = <K extends DocCategory>(
  cat: K,
  raw: string,
): Observed<K> => norm(cat, raw) as Observed<K>
