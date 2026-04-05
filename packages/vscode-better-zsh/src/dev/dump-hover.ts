import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeHoverDump } from "../../../zsh-core/src/hover-dump"
import { hoverDocs } from "../../../zsh-core/src/hover-md"
import { zshParameters } from "../../../zsh-core/src/zsh"
import { getCondOps, getOptions } from "../../../zsh-core/src/zsh-data"
import { makeExecZshRunner } from "../zsh-exec"

async function getParams() {
  return (await zshParameters(makeExecZshRunner("zsh"))) ?? new Map()
}

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/hover")

  const options = getOptions()
  const condOps = getCondOps()
  const params = await getParams()
  const docs = hoverDocs({ options, condOps, params })

  await writeHoverDump(outDir, docs)
  const suspicious = (await readFile(resolve(outDir, "suspicious.md"), "utf8"))
    .split("\n")
    .filter(Boolean).length

  const counts = [
    `${options.length} options`,
    `${condOps.length} cond ops`,
    `${params.size} params`,
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote hover markdown to ${outDir} (${counts})\n`)
}

void main()
