import type { Documented } from "@carlwr/zsh-core/types"

export interface OptionMatch {
  /** What to insert / display. */
  readonly label: string
  readonly canonical: Documented<"option">
}

// [canonical prefix, label prefix]: the plain form, then the negated form.
const forms = [
  ["", ""],
  ["no", "no_"],
] as const

/** Options whose plain or `no_`-negated name starts with `typed`, ignoring case and underscores. */
export function matchOptions(
  options: readonly Documented<"option">[],
  typed: string,
): readonly OptionMatch[] {
  const norm = typed.toLowerCase().replaceAll("_", "")
  return forms.flatMap(([canonicalPrefix, labelPrefix]) =>
    options
      .filter(opt => `${canonicalPrefix}${opt}`.startsWith(norm))
      .map(opt => ({ label: `${labelPrefix}${opt}`, canonical: opt })),
  )
}
