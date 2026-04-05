import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeHoverDump } from "../hover-dump"
import { hoverDocs } from "../hover-md"
import { getCondOps, getOptions, initZshData } from "../zsh-data"
import { runZsh, runZshScript, ZSH_VERSION_ARGS } from "../zsh-exec"

const PARAMS_SCRIPT =
  'zmodload zsh/parameter; for k v in ${(kv)parameters}; do [[ $v == *special* && $v != *hide* ]] && print "$k=$v"; done'

async function getParams() {
  const ver = await runZsh("zsh", { args: ZSH_VERSION_ARGS })
  if (ver.code !== 0) return new Map<string, string>()

  const r = await runZshScript("zsh", PARAMS_SCRIPT)
  if (r.code !== 0) return new Map<string, string>()

  const out = new Map<string, string>()
  for (const line of r.stdout.split("\n")) {
    const eq = line.indexOf("=")
    if (eq > 0) out.set(line.slice(0, eq), line.slice(eq + 1))
  }
  return out
}

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/hover")

  initZshData(root)
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
