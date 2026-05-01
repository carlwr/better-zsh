#!/usr/bin/env node

/**
 * @packageDocumentation
 *
 * Stdio executable entrypoint for `zshref-mcp`. Handles `--help`,
 * `--version`, and TTY hints; otherwise loads the bundled corpus and serves
 * the shared zshref tools over MCP stdio.
 */

import process from "node:process"
import { loadCorpus } from "@carlwr/zsh-core"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { decide, helpText, type PkgIdentity, ttyHintText } from "./src/cli.ts"
import {
  MCP_BIN_NAME,
  PKG_NAME,
  PKG_REPO_URL,
  PKG_VERSION,
} from "./src/meta/pkg-info.ts"
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
      process.stdout.write(
        `${PKG_VERSION} (${ZSH_UPSTREAM.tag}, ${ZSH_UPSTREAM.commit.slice(0, 7)})\n`,
      )
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
