import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { DocCategory } from "zsh-core"
import { docCategories, loadCorpus } from "zsh-core"
import { refDocs, writeRefDump } from "zsh-core/render"

const categoryLabel: Record<DocCategory, string> = {
  option: "options",
  cond_op: "cond ops",
  builtin: "builtins",
  precmd: "precmds",
  shell_param: "shell params",
  reserved_word: "reserved words",
  redir: "redirs",
  process_subst: "process substs",
  subscript_flag: "subscript flags",
  param_flag: "param flags",
  history: "history",
  glob_op: "glob ops",
  glob_flag: "glob flags",
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
    ...docCategories.map((cat) => `${corpus[cat].size} ${categoryLabel[cat]}`),
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote reference markdown to ${outDir} (${counts})\n`)
}

void main()
