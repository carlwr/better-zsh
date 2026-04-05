import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { hoverDocs } from "../core/hover-md"
import { zshParameters } from "../core/zsh"
import { getCondOps, getOptions } from "../core/zsh-data"
import { writeHoverDump } from "../hover-dump"
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
