export interface OptionMatch {
  /** What to insert / display. */
  label: string
  /** Canonical form (lowercase, no underscores, no no-prefix for negated). */
  canonical: string
}

/**
 * Match zsh option names against user input, ignoring underscores and case.
 * Returns both base and `no_`-prefixed forms.
 */
export function matchOptions(options: string[], typed: string): OptionMatch[] {
  const norm = typed.replace(/_/g, "").toLowerCase()
  const out: OptionMatch[] = []
  for (const o of options) {
    if (o.startsWith(norm)) {
      out.push({ label: o, canonical: o })
    }
  }
  for (const o of options) {
    if (`no${o}`.startsWith(norm)) {
      out.push({ label: `no_${o}`, canonical: o })
    }
  }
  return out
}
