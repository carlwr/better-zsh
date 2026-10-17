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
import { readFileSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"
import { test } from "node:test"

import yaml from "yaml"

import { actionFiles, workflowFiles } from "./step-sites.mjs"
import { packageDirs } from "./upstream-graph.mjs"

const repoRoot = new URL("../../", import.meta.url).pathname
const marked = /REGISTRY|INTERACTIVE/

const read = rel => readFileSync(join(repoRoot, rel), "utf8")
const readJson = rel => JSON.parse(read(rel))
const readYaml = rel => yaml.parse(read(rel))

const manifests = [
  "package.json",
  ...[...packageDirs().values()].map(dir =>
    relative(repoRoot, join(dir, "package.json")),
  ),
]

test("no unmarked script reaches a consent-marked one", () => {
  const leaks = manifests.flatMap(rel =>
    Object.entries(readJson(rel).scripts ?? {})
      .filter(([name, cmd]) => !marked.test(name) && marked.test(cmd))
      .map(([name]) => `${rel}: ${name}`),
  )
  assert.deepEqual(leaks, [])
})

// `scripts/test-integration-act` runs one workflow job — a ci.yml job on the
// default `push` event, a release workflow's dry-run dispatch — so an
// unguarded marked step is reachable from an everyday local run. Each marker
// names a distinct risk, and CI may carry it only where CI has actually
// neutralised that risk.
//
// A composite action is a step site too: `uses:` splices its steps into every
// job that names it, so it inherits the reachability of the widest such job
// while carrying no `if:` of its own to narrow the risk back down.
const neutralises = {
  // published state: fails legitimately until an upstream republish lands, so
  // nothing an ordinary run selects may reach it. Where any trigger but a
  // dispatch or a tag push starts runs, only a dispatch-only job is out of
  // reach; elsewhere the ordinary run is the act rehearsal, which `!env.ACT`
  // skips.
  REGISTRY: (step, carrier, everyday) =>
    everyday
      ? /workflow_dispatch/.test(carrier.if ?? "")
      : /^(\$\{\{\s*)?!env\.ACT(\s*\}\})?$/.test(step.if ?? ""),
  // desktop takeover: a virtual display means there is no desktop to take over
  INTERACTIVE: step => /xvfb-run/.test(step.run),
}

const tagOnlyPush = push =>
  push?.tags && !push.branches && !push["branches-ignore"]

/** Whether any trigger but a dispatch or a tag push starts the workflow. */
const isEveryday = on =>
  Object.entries(on).some(
    ([event, cfg]) =>
      event !== "workflow_dispatch" && !(event === "push" && tagOnlyPush(cfg)),
  )

/**
 * Every place a run reaches a step, named for the failure message, and whether
 * everyday triggers reach it — for a composite action, as any job may.
 */
const stepCarriers = () => [
  ...workflowFiles(repoRoot).flatMap(rel => {
    const { on, jobs } = readYaml(rel)
    return Object.entries(jobs).map(([id, job]) => [
      `${basename(rel)} ${id}`,
      job,
      isEveryday(on),
    ])
  }),
  ...actionFiles(repoRoot).map(rel => [
    dirname(rel),
    readYaml(rel)?.runs ?? {},
    true,
  ]),
]

test("consent-marked steps run only where CI neutralises the risk", () => {
  const exposed = stepCarriers().flatMap(([carrierName, carrier, everyday]) =>
    (carrier.steps ?? []).flatMap(step =>
      Object.entries(neutralises)
        .filter(([marker]) => new RegExp(marker).test(step.run ?? ""))
        .filter(([, isNeutralised]) => !isNeutralised(step, carrier, everyday))
        .map(([marker]) => `${carrierName}: ${marker} in ${step.run}`),
    ),
  )
  assert.deepEqual(exposed, [])
})
