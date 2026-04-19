#!/usr/bin/env node

/**
 * @packageDocumentation
 *
 * CLI bin. Loads the corpus, builds the cliffy tree from the declarative
 * tool defs, and parses argv. Shebang preserved through tsup.
 */

import process from "node:process"
import { loadCorpus } from "@carlwr/zsh-core"
import { toolDefs } from "@carlwr/zsh-core-tooldef"
import { buildCli, runCli } from "./src/adapter.ts"
import { CLI_BIN_NAME, PKG_VERSION } from "./src/pkg-info.ts"

async function main(): Promise<void> {
  const corpus = loadCorpus()
  const cli = buildCli({
    corpus,
    toolDefs,
    name: CLI_BIN_NAME,
    version: PKG_VERSION,
  })
  await runCli(cli, process.argv.slice(2))
}

main().catch(err => {
  process.stderr.write(
    `${CLI_BIN_NAME}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exit(1)
})
