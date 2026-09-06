// Consent markers in a script name are the whole safety mechanism: they are
// what makes "run all tests" mean "and not the ones that take over the desktop
// or depend on published state". Nothing enforced the isolation until here — a
// single new aggregator could quietly re-attach a marked script to an everyday
// gate.
//
// A marked name is distinctive enough that mentioning it is invoking it, so a
// direct mention check is also a transitive one: an unmarked middleman is
// itself a violation.

import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import yaml from "yaml"

const repoRoot = new URL("../../", import.meta.url).pathname
const marked = /REGISTRY|INTERACTIVE/

const readJson = rel => JSON.parse(readFileSync(join(repoRoot, rel), "utf8"))

const manifests = [
  "package.json",
  ...readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter(ent => ent.isDirectory())
    .map(ent => join("packages", ent.name, "package.json")),
]

test("no unmarked script reaches a consent-marked one", () => {
  const leaks = manifests.flatMap(rel =>
    Object.entries(readJson(rel).scripts ?? {})
      .filter(([name, cmd]) => !marked.test(name) && marked.test(cmd))
      .map(([name]) => `${rel}: ${name}`),
  )
  assert.deepEqual(leaks, [])
})

// `scripts/test-integration-act` runs one job of ci.yml, chosen by ACT_JOB, on
// the default `push` event — so an unguarded marked step there is reachable
// from an everyday local run. Each marker names a distinct risk, and CI may
// carry it only where CI has actually neutralised that risk.
const neutralises = {
  // published state: fails legitimately until an upstream republish lands, so
  // nothing an ordinary run selects may reach it
  REGISTRY: (_step, job) => /workflow_dispatch/.test(job.if ?? ""),
  // desktop takeover: a virtual display means there is no desktop to take over
  INTERACTIVE: step => /xvfb-run/.test(step.run),
}

test("consent-marked ci.yml steps run only where CI neutralises the risk", () => {
  const ci = yaml.parse(
    readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  )
  const exposed = Object.entries(ci.jobs).flatMap(([jobName, job]) =>
    (job.steps ?? []).flatMap(step =>
      Object.entries(neutralises)
        .filter(([marker]) => new RegExp(marker).test(step.run ?? ""))
        .filter(([, isNeutralised]) => !isNeutralised(step, job))
        .map(([marker]) => `${jobName}: ${marker} in ${step.run}`),
    ),
  )
  assert.deepEqual(exposed, [])
})
