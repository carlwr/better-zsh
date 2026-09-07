#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildTasks } from "./build-tasks.mjs"
import { actionFiles, workflowFiles } from "./step-sites.mjs"
import {
  expandRootRefs,
  hasUpstreamBuild,
  reEscape,
  upstreamRebuildSources,
  upstreamTriggering,
} from "./upstream-graph.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const errs = []
const safeRawRecursive = new Set(["format", "lint"])
const helperRun = "node scripts/build/upstream-ready.mjs run"
const helperBootstrap = "node scripts/build/upstream-ready.mjs bootstrap"

function read(rel) {
  return readFileSync(join(repoRoot, rel), "utf8")
}

function readJson(rel) {
  return JSON.parse(read(rel))
}

function fail(msg) {
  errs.push(msg)
}

const rootPkg = readJson("package.json")
if (rootPkg.scripts["bootstrap:upstream"] !== helperBootstrap) {
  fail(
    "package.json: bootstrap:upstream must delegate to scripts/build/upstream-ready.mjs",
  )
}

const rootCommands = {
  ...rootPkg.scripts,
  ...buildTasks,
}

const triggeringByPkg = new Map()
for (const ent of readdirSync(join(repoRoot, "packages"), {
  withFileTypes: true,
})) {
  if (!ent.isDirectory()) continue
  const rel = join("packages", ent.name, "package.json")
  const pkg = readJson(rel)
  const scripts = pkg.scripts ?? {}
  triggeringByPkg.set(pkg.name, upstreamTriggering(scripts))
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!name.startsWith("pre") || !hasUpstreamBuild(cmd)) continue
    if (!cmd.includes("BZ_SKIP_UPSTREAM")) {
      fail(`${rel}: ${name} must guard upstream rebuilds with BZ_SKIP_UPSTREAM`)
    }
    const target = name.slice(3)
    if (safeRawRecursive.has(target)) {
      fail(
        `${rel}: ${name} makes root "${target}" unsafe; remove it from the raw-recursive allowlist`,
      )
    }
  }
}

// A hand-rolled fan-out rebuilds (or races on) shared upstream `dist/` exactly
// like `pnpm -r` does; `pnpm -r` is only its most obvious spelling.
const guardedRootRecursive = []
for (const [name, cmd] of Object.entries(rootCommands)) {
  const recursive = cmd.includes("pnpm -r")
  const reachable = expandRootRefs(cmd, rootCommands, helperRun)
  if (!recursive && upstreamRebuildSources(reachable, triggeringByPkg).size < 2)
    continue
  if (safeRawRecursive.has(name)) continue
  guardedRootRecursive.push(name)
  if (!cmd.includes("pnpm verify:upstream") || !cmd.includes(helperRun)) {
    fail(
      `package.json: fan-out script "${name}" must run pnpm verify:upstream and scripts/build/upstream-ready.mjs`,
    )
  }
}

if (hasUpstreamBuild(read("Makefile"))) {
  fail("Makefile: upstream builds must route through pnpm bootstrap:upstream")
}

// An empty set would build an alternation matching every `run: pnpm …` line.
// It also means detection found no fan-out at all, which this repo always has:
// the detector has stopped matching rather than the risk having gone away.
if (!guardedRootRecursive.length)
  fail("no fan-out root scripts detected — the detector has stopped matching")

/** A step running one of `alt`; the list dash is absent when a `name:` precedes. */
const runsRootScript = alt =>
  new RegExp(
    String.raw`^\s*(?:-\s*)?run:\s*pnpm (?:run )?(?:${alt})(?:[\s&);]|$)`,
    "m",
  )

const riskyRootRun = runsRootScript(
  guardedRootRecursive.map(reEscape).join("|"),
)

// A composite action's steps are spliced into every job that `uses:` it, so it
// is a step site like a workflow file — and never the sanctioned one.
const stepFiles = guardedRootRecursive.length
  ? [...workflowFiles(repoRoot), ...actionFiles(repoRoot)]
  : []

for (const rel of stepFiles) {
  if (!riskyRootRun.test(read(rel))) continue
  if (rel !== join(".github", "workflows", "ci.yml")) {
    fail(
      `${rel}: root recursive scripts must run only from .github/workflows/ci.yml`,
    )
  }
}

const ciRel = join(".github", "workflows", "ci.yml")
const ci = existsSync(join(repoRoot, ciRel)) ? read(ciRel) : ""
const integrationIdx = ci.indexOf("\n  integration:\n")
if (integrationIdx === -1) {
  fail(`${ciRel}: missing integration job`)
} else {
  const integration = ci.slice(integrationIdx)
  const envIdx = integration.indexOf('BZ_SKIP_UPSTREAM: "1"')
  const coreIdx = integration.indexOf("pnpm --filter @carlwr/zsh-core build")
  const tooldefIdx = integration.indexOf(
    "pnpm --filter @carlwr/zsh-core-tooldef build",
  )
  for (const name of guardedRootRecursive) {
    const runIdx = integration.search(runsRootScript(reEscape(name)))
    if (runIdx === -1) continue
    if (envIdx === -1) {
      fail(
        `${ciRel}: integration job must export BZ_SKIP_UPSTREAM=1 before pnpm ${name}`,
      )
      continue
    }
    if (coreIdx === -1 || tooldefIdx === -1) {
      fail(
        `${ciRel}: integration job must bootstrap zsh-core and zsh-core-tooldef before pnpm ${name}`,
      )
      continue
    }
    if (coreIdx > runIdx || tooldefIdx > runIdx) {
      fail(`${ciRel}: integration bootstrap must precede pnpm ${name}`)
    }
  }
}

if (errs.length) {
  for (const err of errs) console.error(`upstream-contract: ${err}`)
  process.exit(1)
}
