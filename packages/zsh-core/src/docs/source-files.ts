/** Yodl source files required by the corpus loader. */
export const corpusYodlFiles = [
  "arith.yo",
  "builtins.yo",
  "cond.yo",
  "expn.yo",
  "func.yo",
  "grammar.yo",
  "jobs.yo",
  "options.yo",
  "params.yo",
  "prompt.yo",
  "redirect.yo",
  "zle.yo",
] as const

export type CorpusYodlFile = (typeof corpusYodlFiles)[number]
