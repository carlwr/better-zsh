import { trim } from "@carlwr/typescript-extra"

import { normalizeOptName } from "./normalize-option.ts"
import type { DocCategory } from "./taxonomy.ts"
import type {
  Documented,
  OptFlag,
  RedirOp,
  ShellParamKeyName,
} from "./types.ts"

// Per-category normalization. Default is `trim`; categories below the default
// are listed as overrides. `option` normalizes case and strips underscores,
// but does NOT strip `no_` prefixes — negation is a corpus-aware parse
// concern (the "NOTIFY" vs "NO_NOTIFY" ambiguity can only be resolved against
// the actual corpus) and lives in the option resolver, which reports it as
// `input-negated` feedback.
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

// --- Secondary-index brands -------------------------------------------------

export const mkOptFlag = (raw: string): OptFlag => raw.trim() as OptFlag

export const mkRedirOp = (raw: string): RedirOp => raw.trim() as RedirOp

export const mkShellParamKeyName = (raw: string): ShellParamKeyName =>
  raw.trim() as ShellParamKeyName

/** Shell-safe redirection slug from a sig (whitespace → `_`). See `RedirDoc.slug`. */
export const redirSlugFromSig = (sig: string): string =>
  sig.replace(/\s+/g, "_")
