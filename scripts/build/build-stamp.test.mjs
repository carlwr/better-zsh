// A freshness stamp that silently over-reports is worse than none: it turns a
// stale artifact into a skipped rebuild. These pin the facts it rests on.

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import {
  inputFiles,
  inputHash,
  isFresh,
  outputDirs,
  readStamp,
  STAMP_REL,
} from "./build-stamp.mjs"
import { packageDirs, repoRoot, upstreamPkgs } from "./upstream-graph.mjs"

const dirs = packageDirs()
const readPkg = name =>
  JSON.parse(readFileSync(join(dirs.get(name), "package.json"), "utf8"))

test("every upstream package clears and writes its stamp", () => {
  for (const name of upstreamPkgs) {
    const build = readPkg(name).scripts.build
    assert.match(
      build,
      /^node \.\.\/\.\.\/scripts\/build\/build-stamp\.mjs clear &&/,
    )
    assert.match(
      build,
      /&& node \.\.\/\.\.\/scripts\/build\/build-stamp\.mjs write$/,
    )
  }
})

// CI primes a fresh checkout by building upstreamPkgs[0] raw, under a job-level
// BZ_SKIP_UPSTREAM. A readiness call there would assert a stamp no build has
// written yet, failing every fresh checkout.
test("the first upstream package asks for no readiness", () => {
  const scripts = readPkg(upstreamPkgs[0]).scripts
  assert.deepEqual(
    Object.keys(scripts).filter(n => scripts[n].includes("upstream-ready")),
    [],
  )
})

test("the stamp path is spelled in exactly one tracked place", () => {
  const hits = execFileSync(
    "git",
    [
      "grep",
      "--untracked",
      "-l",
      STAMP_REL.split("/").pop(),
      "--",
      ".",
      ":!:scripts/build/build-stamp.test.mjs",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
  assert.deepEqual(hits, ["scripts/build/build-stamp.mjs"])
})

test("inputs exclude generated trees", () => {
  const rels = inputFiles(dirs.get("@carlwr/zsh-core"))
  for (const gen of [...outputDirs, "node_modules", ".aux"]) {
    assert.equal(
      rels.some(rel => rel.startsWith(`packages/zsh-core/${gen}/`)),
      false,
      gen,
    )
  }
})

test("inputs cover the whole package tree, plus the shared repo files", () => {
  const rels = inputFiles(dirs.get("@carlwr/zsh-core-tooldef"))
  // Build config that no entry point imports: reachable only because discovery
  // takes everything the exclusion rule leaves.
  assert.ok(
    rels.includes("packages/zsh-core-tooldef/api-extractor.runtime.json"),
  )
  assert.ok(rels.includes("packages/zsh-core-tooldef/scripts/build-api.mjs"))
  assert.ok(rels.includes("scripts/api-extractor.mjs"))
  assert.ok(rels.includes("pnpm-lock.yaml"))
  assert.ok(rels.includes("package.json"))
})

test("a file appearing anywhere in the package tree moves the hash", () => {
  const name = "@carlwr/zsh-core-tooldef"
  const probe = join(dirs.get(name), "src", "build-stamp-probe.tmp")
  const before = inputHash(name)
  writeFileSync(probe, "probe")
  try {
    assert.notEqual(inputHash(name), before)
  } finally {
    rmSync(probe, { force: true })
  }
  assert.equal(inputHash(name), before)
})

test("the hash is stable across calls", () => {
  assert.equal(inputHash("@carlwr/zsh-core"), inputHash("@carlwr/zsh-core"))
})

test("a package that never stamps is never fresh", () => {
  // Downstream packages carry no stamp: an absent stamp must read as stale,
  // which is also the interrupted-build case (`clear` ran, `write` did not).
  assert.equal(readStamp(dirs.get("zshref-web")), undefined)
  assert.equal(isFresh("zshref-web"), false)
})

test("a stamp records the files the build produced", () => {
  const stamp = readStamp(dirs.get(upstreamPkgs[0]))
  if (!stamp) return // unbuilt tree; other tests cover the absent-stamp path
  assert.ok(stamp.outputs.length > 0)
  assert.ok(
    stamp.outputs.every(rel =>
      outputDirs.some(dir => rel.startsWith(`${dir}/`)),
    ),
  )
})
