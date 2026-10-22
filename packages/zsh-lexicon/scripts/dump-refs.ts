import { resolve } from "node:path"
import { loadLexicon } from "../src/docs/lexicon.ts"
import { docCategories, docCategoryLabels } from "../src/docs/taxonomy.ts"
import { refDocs, writeRefDump } from "./ref-dump.ts"

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/refs")

  const lexicon = loadLexicon()
  const docs = refDocs(lexicon)

  await writeRefDump(outDir, docs)

  const counts = docCategories
    .map(cat => `${lexicon[cat].size} ${docCategoryLabels[cat]}`)
    .join(", ")
  process.stdout.write(`wrote reference markdown to ${outDir} (${counts})\n`)
}

void main()
