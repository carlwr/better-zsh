import type { DocCategory } from "./taxonomy.ts"

const historyPreamble = `History expansions compose three parts: \`<event>[:<word>][:<modifier>…]\`. Each record below belongs to exactly one of those three roles, indicated by its \`subKind\` field (\`event-designator\`, \`word-designator\`, \`modifier\`).

Many corpus keys are templates, not literals: \`n\` stands for any non-negative integer, \`str\` for a word, and \`[ digits ]\` after a letter is an optional digit run. For example \`!n\` matches user-code tokens like \`!42\`, and \`h [ digits ]\` matches \`:h\` or \`:h3\`. Literal-key entries (\`!!\`, \`!#\`, \`!{...}\`) are also present.

Word-designators and modifiers are only meaningful inside a history expansion (after the event designator); in isolation they are not zsh tokens.`

// Kept though no in-repo consumer shows it: neither has a natural,
// consistent slot for category-level prose. The mechanism is the corpus'
// to offer; showing it is each consumer's call.

/**
 * Per-category reading key: metadata on how to interpret a category's
 * record fields, for a category whose records are not intelligible without
 * it — e.g. `history_expn`, whose records are the parts of one composed
 * expansion, told apart by `subKind`. Absent for most categories; composes
 * with per-record markdown, never replaces it.
 */
export const docCategoryPreamble: Readonly<
  Partial<Record<DocCategory, string>>
> = {
  history_expn: historyPreamble,
}
