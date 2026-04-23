import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { DocCategory } from "@carlwr/zsh-core"
import { docCategories, loadCorpus } from "@carlwr/zsh-core"
import { refDocs, writeRefDump } from "@carlwr/zsh-core/render"

const categoryLabel: Record<DocCategory, string> = {
  option: "options",
  cond_op: "cond ops",
  builtin: "builtins",
  precmd: "precmds",
  shell_param: "shell params",
  complex_command: "complex commands",
  reserved_word: "reserved words",
  redir: "redirs",
  process_subst: "process substs",
  param_expn: "param expansions",
  subscript_flag: "subscript flags",
  param_flag: "param flags",
  history: "history",
  glob_op: "glob ops",
  glob_flag: "glob flags",
  glob_qualifier: "glob qualifiers",
  prompt_escape: "prompt escapes",
  zle_widget: "zle widgets",
  keymap: "keymaps",
  job_spec: "job specs",
  arith_op: "arith ops",
  special_function: "special functions",
}

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/refs")

  const corpus = loadCorpus()
  const docs = refDocs(corpus)

  await writeRefDump(outDir, docs)
  const suspicious = (await readFile(resolve(outDir, "suspicious.md"), "utf8"))
    .split("\n")
    .filter(Boolean).length

  const counts = [
    ...docCategories.map(cat => `${corpus[cat].size} ${categoryLabel[cat]}`),
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote reference markdown to ${outDir} (${counts})\n`)
}

void main()
