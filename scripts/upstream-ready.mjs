#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)

function die(msg) {
  console.error(msg)
  process.exit(1)
}

function run(cmd, env = {}) {
  const [file, ...argv] = cmd
  const { error, status, signal } = spawnSync(file, argv, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
  if (error) throw error
  if (signal) process.kill(process.pid, signal)
  process.exit(status ?? 1)
}

function runOk(cmd, env = {}) {
  const [file, ...argv] = cmd
  const { error, status, signal } = spawnSync(file, argv, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
  if (error) throw error
  if (signal) process.kill(process.pid, signal)
  if (status !== 0) process.exit(status ?? 1)
}

function bootstrap() {
  if (process.env.BZ_SKIP_UPSTREAM) return
  runOk(["pnpm", "--filter", "@carlwr/zsh-core", "build"])
  runOk(["pnpm", "--filter", "@carlwr/zsh-core-tooldef", "build"], {
    BZ_SKIP_UPSTREAM: "1",
  })
}

switch (args[0]) {
  case "bootstrap":
    bootstrap()
    break
  case "run":
    if (args.length < 2)
      die("usage: node scripts/upstream-ready.mjs run <cmd> [args...]")
    bootstrap()
    run(args.slice(1), { BZ_SKIP_UPSTREAM: "1" })
    break
  default:
    die("usage: node scripts/upstream-ready.mjs <bootstrap|run>")
}
