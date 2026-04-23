import type { DocCategory } from "./taxonomy.ts"

const historyPreamble = `History expansions compose three parts: \`<event>[:<word>][:<modifier>…]\`. Each record below belongs to exactly one of those three roles, indicated by its \`kind\` field (\`event-designator\`, \`word-designator\`, \`modifier\`).

Many corpus keys are templates, not literals: \`n\` stands for any non-negative integer, \`str\` for a word, and \`[ digits ]\` after a letter is an optional digit run. For example \`!n\` matches user-code tokens like \`!42\`, and \`h [ digits ]\` matches \`:h\` or \`:h3\`. Literal-key entries (\`!!\`, \`!#\`, \`!{...}\`) are also present.

Word-designators and modifiers are only meaningful inside a history expansion (after the event designator); in isolation they are not zsh tokens.`

/**
 * Optional category-level preamble for consumers that surface a category as a
 * whole (e.g. rendered dump files, category overviews in tool descriptions).
 * Empty for most categories; present only where the records cannot be
 * meaningfully interpreted on their own. Composable with per-record markdown;
 * not a substitute for it.
 */
export const docCategoryPreamble: Readonly<
  Record<DocCategory, string | undefined>
> = {
  option: undefined,
  cond_op: undefined,
  builtin: undefined,
  precmd: undefined,
  shell_param: undefined,
  complex_command: undefined,
  reserved_word: undefined,
  redir: undefined,
  process_subst: undefined,
  param_expn: undefined,
  subscript_flag: undefined,
  param_flag: undefined,
  history: historyPreamble,
  glob_op: undefined,
  glob_flag: undefined,
  glob_qualifier: undefined,
  prompt_escape: undefined,
  zle_widget: undefined,
  keymap: undefined,
  job_spec: undefined,
  arith_op: undefined,
  special_function: undefined,
}
