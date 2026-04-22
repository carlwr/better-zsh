#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const errs = []
const safeRawRecursive = new Set(["format", "lint"])
const helperRun = "node scripts/upstream-ready.mjs run"
const helperBootstrap = "node scripts/upstream-ready.mjs bootstrap"

function read(rel) {
  return readFileSync(join(repoRoot, rel), "utf8")
}

function readJson(rel) {
  return JSON.parse(read(rel))
}

function fail(msg) {
  errs.push(msg)
}

function hasUpstreamBuild(cmd) {
  return (
    cmd.includes("pnpm --filter @carlwr/zsh-core build") ||
    cmd.includes("pnpm --filter @carlwr/zsh-core-tooldef build")
  )
}

const rootPkg = readJson("package.json")
if (rootPkg.scripts["bootstrap:upstream"] !== helperBootstrap) {
  fail(
    "package.json: bootstrap:upstream must delegate to scripts/upstream-ready.mjs",
  )
}

const guardedRootRecursive = []
for (const [name, cmd] of Object.entries(rootPkg.scripts)) {
  if (!cmd.includes("pnpm -r")) continue
  if (safeRawRecursive.has(name)) continue
  guardedRootRecursive.push(name)
  if (!cmd.includes("pnpm verify:upstream") || !cmd.includes(helperRun)) {
    fail(
      `package.json: recursive script "${name}" must run pnpm verify:upstream and scripts/upstream-ready.mjs`,
    )
  }
}

for (const ent of readdirSync(join(repoRoot, "packages"), {
  withFileTypes: true,
})) {
  if (!ent.isDirectory()) continue
  const rel = join("packages", ent.name, "package.json")
  const pkg = readJson(rel)
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
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

const workflowDir = join(repoRoot, ".github", "workflows")
const riskyRootRun = new RegExp(
  String.raw`^\s*-\s*run:\s*pnpm (${guardedRootRecursive.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\b`,
  "m",
)

for (const ent of readdirSync(workflowDir, { withFileTypes: true })) {
  if (!ent.isFile()) continue
  const rel = join(".github", "workflows", ent.name)
  const src = read(rel)
  if (!riskyRootRun.test(src)) continue
  if (rel !== join(".github", "workflows", "ci.yml")) {
    fail(
      `${rel}: root recursive scripts must run only from .github/workflows/ci.yml`,
    )
  }
}

const ciRel = join(".github", "workflows", "ci.yml")
const ci = read(ciRel)
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
    const runIdx = integration.indexOf(`- run: pnpm ${name}`)
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
