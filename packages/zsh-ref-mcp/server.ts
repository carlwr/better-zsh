#!/usr/bin/env node

/**
 * @packageDocumentation
 *
 * Stdio MCP server entry. This is the binary installed as `zsh-ref-mcp`
 * via the `bin` field in `package.json`. Reads JSON-RPC frames on stdin,
 * writes frames on stdout, exits on stream close.
 *
 * The server advertises and serves the tools defined in `./src/tool-defs.ts`,
 * backed by a loaded `zsh-core` corpus held in-process.
 *
 * Also handles `--help` / `--version` and a TTY hint for humans who
 * invoke the bin directly; see `./src/cli.ts`.
 */

import { loadCorpus } from "@carlwr/zsh-core"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { decide, helpText, type PkgIdentity, ttyHintText } from "./src/cli.ts"
import {
  MCP_BIN_NAME,
  PKG_NAME,
  PKG_REPO_URL,
  PKG_VERSION,
} from "./src/pkg-info.ts"
import { buildServer } from "./src/server/build-server.ts"

const pkgId: PkgIdentity = {
  bin: MCP_BIN_NAME,
  version: PKG_VERSION,
  pkgName: PKG_NAME,
  repo: PKG_REPO_URL,
}

async function runServer(): Promise<void> {
  const corpus = loadCorpus()
  const server = buildServer({ corpus })
  await server.connect(new StdioServerTransport())
}

async function main(): Promise<void> {
  const action = decide({
    argv: process.argv.slice(2),
    isTTY: Boolean(process.stdin.isTTY),
  })
  switch (action) {
    case "help":
      process.stdout.write(helpText(pkgId))
      return
    case "version":
      process.stdout.write(`${PKG_VERSION}\n`)
      return
    case "tty-hint":
      process.stderr.write(ttyHintText(pkgId))
      return
    case "run":
      await runServer()
      return
  }
}

main().catch(err => {
  process.stderr.write(
    `${MCP_BIN_NAME}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exit(1)
})
