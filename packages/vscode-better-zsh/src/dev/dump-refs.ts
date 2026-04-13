import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  getBuiltins,
  getCondOps,
  getGlobbingFlags,
  getGlobOps,
  getHistoryDocs,
  getOptions,
  getParamFlags,
  getPrecmds,
  getProcessSubsts,
  getRedirections,
  getReservedWords,
  getShellParams,
  getSubscriptFlags,
} from "zsh-core"
import { refDocs, writeRefDump } from "zsh-core/render"

async function main() {
  const root = process.cwd()
  const outDir = resolve(root, process.argv[2] ?? ".aux/refs")

  const data = {
    options: getOptions(),
    condOps: getCondOps(),
    shellParams: getShellParams(),
    builtins: getBuiltins(),
    precmds: getPrecmds(),
    redirs: getRedirections(),
    processSubsts: getProcessSubsts(),
    reservedWords: getReservedWords(),
    subscriptFlags: getSubscriptFlags(),
    paramFlags: getParamFlags(),
    history: getHistoryDocs(),
    globOps: getGlobOps(),
    globFlags: getGlobbingFlags(),
  }
  const docs = refDocs(data)

  await writeRefDump(outDir, docs)
  const suspicious = (await readFile(resolve(outDir, "suspicious.md"), "utf8"))
    .split("\n")
    .filter(Boolean).length

  const counts = [
    `${data.options.length} options`,
    `${data.condOps.length} cond ops`,
    `${data.shellParams.length} shell params`,
    `${data.builtins.length} builtins`,
    `${data.precmds.length} precmds`,
    `${data.redirs.length} redirs`,
    `${data.processSubsts.length} process substs`,
    `${data.reservedWords.length} reserved words`,
    `${data.subscriptFlags.length} subscript flags`,
    `${data.paramFlags.length} param flags`,
    `${data.history.length} history`,
    `${data.globOps.length} glob ops`,
    `${data.globFlags.length} glob flags`,
    `${suspicious} suspicious`,
  ].join(", ")
  process.stdout.write(`wrote reference markdown to ${outDir} (${counts})\n`)
}

void main()
