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
import { dirname, join } from "node:path"
import { test } from "node:test"

import yaml from "yaml"

import { actionFiles } from "./step-sites.mjs"

const repoRoot = new URL("../../", import.meta.url).pathname
const marked = /REGISTRY|INTERACTIVE/

const read = rel => readFileSync(join(repoRoot, rel), "utf8")
const readJson = rel => JSON.parse(read(rel))
const readYaml = rel => yaml.parse(read(rel))

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
//
// A composite action is a step site too: `uses:` splices its steps into every
// job that names it, so it inherits the reachability of the widest such job
// while carrying no `if:` of its own to narrow the risk back down.
const neutralises = {
  // published state: fails legitimately until an upstream republish lands, so
  // nothing an ordinary run selects may reach it
  REGISTRY: (_step, carrier) => /workflow_dispatch/.test(carrier.if ?? ""),
  // desktop takeover: a virtual display means there is no desktop to take over
  INTERACTIVE: step => /xvfb-run/.test(step.run),
}

/** Every place a ci.yml run reaches a step, named for the failure message. */
const stepCarriers = () => [
  ...Object.entries(readYaml(".github/workflows/ci.yml").jobs),
  ...actionFiles(repoRoot).map(rel => [
    dirname(rel),
    readYaml(rel)?.runs ?? {},
  ]),
]

test("consent-marked steps run only where CI neutralises the risk", () => {
  const exposed = stepCarriers().flatMap(([carrierName, carrier]) =>
    (carrier.steps ?? []).flatMap(step =>
      Object.entries(neutralises)
        .filter(([marker]) => new RegExp(marker).test(step.run ?? ""))
        .filter(([, isNeutralised]) => !isNeutralised(step, carrier))
        .map(([marker]) => `${carrierName}: ${marker} in ${step.run}`),
    ),
  )
  assert.deepEqual(exposed, [])
})
