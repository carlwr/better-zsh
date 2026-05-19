import { resolve } from "node:path"
import { loadCorpus } from "../src/docs/corpus.ts"
import { docCategories, docCategoryLabels } from "../src/docs/taxonomy.ts"
import { writeRefDump } from "../src/render/dump.ts"
import { refDocs } from "../src/render/refs.ts"

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/refs")

  const corpus = loadCorpus()
  const docs = refDocs(corpus)

  await writeRefDump(outDir, docs)

  const counts = docCategories
    .map(cat => `${corpus[cat].size} ${docCategoryLabels[cat]}`)
    .join(", ")
  process.stdout.write(`wrote reference markdown to ${outDir} (${counts})\n`)
}

void main()
