#!/usr/bin/env node

import process from "node:process"
import { loadCorpus } from "@carlwr/zsh-core"
import { toolDefs } from "@carlwr/zsh-core-tooldef"
import { run } from "@stricli/core"
import { buildApp } from "./src/adapter.ts"
import { CLI_BIN_NAME, PKG_VERSION } from "./src/pkg-info.ts"

async function main(): Promise<void> {
  const corpus = loadCorpus()
  const app = buildApp({
    corpus,
    toolDefs,
    name: CLI_BIN_NAME,
    version: PKG_VERSION,
  })
  await run(app, process.argv.slice(2), { process })
}

main().catch(err => {
  process.stderr.write(
    `${CLI_BIN_NAME}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exit(1)
})
