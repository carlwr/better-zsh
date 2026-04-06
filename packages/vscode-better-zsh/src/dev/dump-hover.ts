import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { getBuiltins, getCondOps, getOptions, getPrecmds } from "zsh-core"
import { zshParameters } from "zsh-core/exec"
import { hoverDocs, writeHoverDump } from "zsh-core/render"
import { makeExecZshRunner } from "../zsh-exec"

async function getParams() {
  return (await zshParameters(makeExecZshRunner("zsh"))) ?? new Map()
}

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/hover")

  const options = getOptions()
  const condOps = getCondOps()
  const builtins = getBuiltins()
  const precmds = getPrecmds()
  const params = await getParams()
  const docs = hoverDocs({ options, condOps, params, builtins, precmds })

  await writeHoverDump(outDir, docs)
  const suspicious = (await readFile(resolve(outDir, "suspicious.md"), "utf8"))
    .split("\n")
    .filter(Boolean).length

  const counts = [
    `${options.length} options`,
    `${condOps.length} cond ops`,
    `${params.size} params`,
    `${builtins.length} builtins`,
    `${precmds.length} precmds`,
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote hover markdown to ${outDir} (${counts})\n`)
}

void main()
