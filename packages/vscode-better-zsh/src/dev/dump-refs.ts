import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { loadCorpus } from "@carlwr/zsh-core"
import { refDocs, writeRefDump } from "@carlwr/zsh-core/render"
import { docCategories, docCategoryLabels } from "@carlwr/zsh-core/taxonomy"

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
    ...docCategories.map(
      cat => `${corpus[cat].size} ${docCategoryLabels[cat]}`,
    ),
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote reference markdown to ${outDir} (${counts})\n`)
}

void main()
