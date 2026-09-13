#!/usr/bin/env node

import { spawnSync } from "node:child_process"

import { isFresh } from "./build-stamp.mjs"
import {
  packageDirs,
  repoRoot,
  upstreamOf,
  upstreamPkgs,
  withUpstream,
} from "./upstream-graph.mjs"

const args = process.argv.slice(2)
const dirOf = packageDirs()

function die(msg) {
  console.error(msg)
  process.exit(1)
}

function runStatus(cmd, env = {}) {
  const [file, ...argv] = cmd
  const { error, status, signal } = spawnSync(file, argv, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })
  if (error) throw error
  if (signal) process.kill(process.pid, signal)
  return status ?? 1
}

function runOk(cmd, env) {
  const status = runStatus(cmd, env)
  if (status !== 0) process.exit(status)
}

function buildUpstream(names) {
  // The skip variable asserts freshness. A false assertion honoured silently
  // resurfaces far from here, as unresolved types against a half-built `dist/`.
  if (process.env.BZ_SKIP_UPSTREAM) {
    const stale = names.filter(name => !isFresh(name))
    if (stale.length)
      die(
        `BZ_SKIP_UPSTREAM is set but not fresh: ${stale.join(", ")}\nunset it, or run pnpm bootstrap:upstream first`,
      )
    return
  }
  for (const [i, name] of names.entries()) {
    if (isFresh(name)) continue
    // Dependency order: everything after the first already has fresh upstream,
    // so its own `pre*` hook has nothing left to do.
    runOk(
      ["pnpm", "--filter", name, "build"],
      i > 0 ? { BZ_SKIP_UPSTREAM: "1" } : {},
    )
  }
}

// A silent fallback to the whole workspace would make an upstream package
// rebuild itself, and would demand freshness of siblings the caller does not
// need — legitimately unbuilt on a fresh clone.
function callerPkg() {
  const name = process.env.npm_package_name
  if (name && dirOf.has(name)) return name
  die(
    "ensure: cannot resolve the calling package (npm_package_name unset or not a workspace member)\nrun it from a package pre* hook, or use bootstrap at the root",
  )
}

// `bootstrap [pkg...]`: the workspace's upstream packages, or the named
// packages with their upstream.
function bootstrapTargets(names) {
  for (const name of names)
    if (!dirOf.has(name)) die(`bootstrap: not a workspace member: ${name}`)
  return names.length ? withUpstream(names) : upstreamPkgs
}

const commands = new Map([
  ["bootstrap", () => buildUpstream(bootstrapTargets(args.slice(1)))],
  ["ensure", () => buildUpstream(upstreamOf(callerPkg()))],
  [
    "run",
    () => {
      if (args.length < 2)
        die("usage: node scripts/build/upstream-ready.mjs run <cmd> [args...]")
      buildUpstream(upstreamPkgs)
      process.exit(runStatus(args.slice(1), { BZ_SKIP_UPSTREAM: "1" }))
    },
  ],
])

const command = commands.get(args[0])
if (!command)
  die(
    `usage: node scripts/build/upstream-ready.mjs <${[...commands.keys()].join("|")}>`,
  )
command()
