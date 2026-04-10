import { mkOptName, type OptName } from "./types/brand.ts"

export interface OptionMatch {
  /** What to insert / display. */
  label: string
  /** Canonical form (lowercase, no underscores, no no-prefix for negated). */
  canonical: OptName
}

/**
 * Match zsh option names against user input, ignoring underscores and case.
 * Returns both base and `no_`-prefixed forms.
 */
export function matchOptions(
  options: readonly OptName[],
  typed: string,
): OptionMatch[] {
  const norm = mkOptName(typed)
  const out: OptionMatch[] = []
  pushMatches(
    out,
    options,
    norm,
    (opt) => opt,
    (opt) => opt,
  )
  pushMatches(
    out,
    options,
    norm,
    (opt) => `no${opt}`,
    (opt) => `no_${opt}`,
  )
  return out
}

function pushMatches(
  out: OptionMatch[],
  options: readonly OptName[],
  typed: OptName,
  canonicalOf: (option: string) => string,
  labelOf: (option: string) => string,
): void {
  for (const option of options) {
    const canonical = canonicalOf(option)
    if (canonical.startsWith(typed)) {
      // `canonical` stores the base option name (no `no-`/`no_` prefix), not
      // `canonicalOf(option)` — `canonicalOf` is used only for prefix-match comparison.
      // The asymmetry is intentional: callers need the base name for lookup, not the
      // possibly-prefixed form used during matching.
      out.push({ label: labelOf(option), canonical: option })
    }
  }
}
