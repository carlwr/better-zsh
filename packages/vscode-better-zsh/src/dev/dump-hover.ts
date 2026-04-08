import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  getBuiltins,
  getCondOps,
  getOptions,
  getPrecmds,
  getShellParams,
} from "zsh-core"
import { hoverDocs, writeHoverDump } from "zsh-core/render"

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/hover")

  const options = getOptions()
  const condOps = getCondOps()
  const builtins = getBuiltins()
  const precmds = getPrecmds()
  const params = getShellParams()
  const docs = hoverDocs({ options, condOps, params, builtins, precmds })

  await writeHoverDump(outDir, docs)
  const suspicious = (await readFile(resolve(outDir, "suspicious.md"), "utf8"))
    .split("\n")
    .filter(Boolean).length

  const counts = [
    `${options.length} options`,
    `${condOps.length} cond ops`,
    `${params.length} params`,
    `${builtins.length} builtins`,
    `${precmds.length} precmds`,
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote hover markdown to ${outDir} (${counts})\n`)
}

void main()
