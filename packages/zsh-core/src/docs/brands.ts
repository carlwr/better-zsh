import type { DocCategory } from "./taxonomy.ts"
import type { Documented, Observed } from "./types.ts"

/** Lowercase, strip all underscores. Idempotent. */
export function normalizeOptName(raw: string): string {
  return raw.replace(/_/g, "").toLowerCase()
}

// Per-category normalization. Shared by `mkObserved` and `mkDocumented`.
//
// Note: `option` normalizes case and strips underscores, but does NOT strip
// `no_` prefixes. Negation is a corpus-aware parse concern (the "NOTIFY" vs
// "NO_NOTIFY" ambiguity can only be resolved against the actual corpus) and
// lives in `resolveOption` / `resolvers.option`, not here.
const norm: { [K in DocCategory]: (s: string) => string } = {
  option: s => normalizeOptName(s.trim()),
  cond_op: s => s.trim(),
  builtin: s => s.trim(),
  precmd: s => s.trim(),
  shell_param: s => s.trim(),
  complex_command: s => s.trim(),
  reserved_word: s => s.trim(),
  redir: s => s.trim(),
  process_subst: s => s.trim(),
  param_expn: s => s.trim(),
  subscript_flag: s => s.trim(),
  param_flag: s => s.trim(),
  history: s => s.trim(),
  glob_op: s => s.trim(),
  glob_flag: s => s.trim(),
  glob_qualifier: s => s.trim(),
  prompt_escape: s => s.trim(),
  zle_widget: s => s.trim(),
  keymap: s => s.trim(),
  job_spec: s => s.trim(),
  arith_op: s => s.trim(),
  special_function: s => s.trim(),
}

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
): Documented<K> => norm[cat](raw) as Documented<K>

/**
 * Smart constructor for an observed-in-user-code brand. Normalizes `raw` per
 * category and casts to `Observed<K>`. Used by fact extraction.
 *
 * This does NOT perform corpus-aware parsing; for that, call the resolver
 * layer (`resolve(corpus, cat, raw)` or a category-specific resolver like
 * `resolveOption`).
 */
export const mkObserved = <K extends DocCategory>(
  cat: K,
  raw: string,
): Observed<K> => norm[cat](raw) as Observed<K>
