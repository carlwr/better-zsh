// The precommand modifiers the scanner recognizes: analysis vocabulary, not a
// view of `corpus.precmd_modifier` — this layer imports nothing from the docs
// domain. The two are meant to be equal (unlike the command-position keyword
// set, which is deliberately narrower than the reserved-word category); a
// lock-in test under `src/test/analysis/` pins the equality.
export const precmdNames = [
  "-",
  "builtin",
  "command",
  "exec",
  "nocorrect",
  "noglob",
] as const

export type PrecmdName = (typeof precmdNames)[number]

const precmdNameSet: ReadonlySet<string> = new Set(precmdNames)

/** Type guard over `precmdNames`. */
export const isPrecmdName = (raw: string): raw is PrecmdName =>
  precmdNameSet.has(raw)
