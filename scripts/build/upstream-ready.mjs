#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { upstreamPkgs } from "./upstream-graph.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const args = process.argv.slice(2)

const dirOf = new Map(
  readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter(ent => ent.isDirectory())
    .map(ent => join(repoRoot, "packages", ent.name))
    .map(dir => [
      JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name,
      dir,
    ]),
)

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

// The skip var asserts "upstream is already fresh". Honouring a false assertion
// silently is the worst outcome: consumers then read a missing or half-written
// `dist/` and fail somewhere far away, as an unresolved-types error. Readiness
// is either established or verified — never assumed.
function assertReady() {
  const missing = upstreamPkgs.filter(
    name => !existsSync(join(dirOf.get(name), "dist")),
  )
  if (missing.length)
    die(
      `BZ_SKIP_UPSTREAM is set but not built: ${missing.join(", ")}\nunset it, or run pnpm bootstrap:upstream first`,
    )
}

function bootstrap() {
  if (process.env.BZ_SKIP_UPSTREAM) return assertReady()
  // Topological order: every build after the first can trust its own upstream
  // is already fresh, so its `pre*` hook has nothing left to do.
  for (const [i, name] of upstreamPkgs.entries()) {
    const upstreamFresh = i > 0
    runOk(
      ["pnpm", "--filter", name, "build"],
      upstreamFresh ? { BZ_SKIP_UPSTREAM: "1" } : {},
    )
  }
}

switch (args[0]) {
  case "bootstrap":
    bootstrap()
    break
  case "run":
    if (args.length < 2)
      die("usage: node scripts/build/upstream-ready.mjs run <cmd> [args...]")
    bootstrap()
    run(args.slice(1), { BZ_SKIP_UPSTREAM: "1" })
    break
  default:
    die("usage: node scripts/build/upstream-ready.mjs <bootstrap|run>")
}
