// The Node floor is one decision spelled in files that cannot reference each
// other — manifests, the CI action, user-facing prose — so only a test keeps
// them on one major. It pins agreement, not a value: moving the floor means
// moving every site below at once.
//
// Deliberately not sites:
// - the TS `target`/`lib`: a syntax level, not a runtime floor
// - the crate's npm launcher `engines`: generated, with a floor of its own

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { test } from "node:test"

import yaml from "yaml"

import { packageDirs, repoRoot } from "./upstream-graph.mjs"

const read = rel => readFileSync(join(repoRoot, rel), "utf8")
const readJson = rel => JSON.parse(read(rel))
const readYaml = rel => yaml.parse(read(rel))

const manifests = [
  "package.json",
  ...[...packageDirs().values()].map(dir =>
    relative(repoRoot, join(dir, "package.json")),
  ),
]
const action = ".github/actions/setup-node-pnpm/action.yml"
const readme = "packages/zsh-lexicon/README.md"

const { catalog } = readYaml("pnpm-workspace.yaml")

/** A manifest may omit either site; one it declares must resolve. */
const manifestSites = rel => {
  const pkg = readJson(rel)
  const types = { ...pkg.dependencies, ...pkg.devDependencies }["@types/node"]
  const out = []
  if (pkg.engines?.node !== undefined)
    out.push([`${rel} engines.node`, pkg.engines.node])
  if (types !== undefined)
    out.push([
      `${rel} @types/node`,
      /^catalog:(default)?$/.test(types) ? catalog?.["@types/node"] : types,
    ])
  return out
}

/** `[site, value]` per place naming the floor. */
const sites = () => [
  ...manifests.flatMap(manifestSites),
  [
    `${action} node-version`,
    readYaml(action)?.runs?.steps?.find(step =>
      step.uses?.startsWith("actions/setup-node@"),
    )?.with?.["node-version"],
  ],
  [`${readme} "Node ≥ N"`, /Node ≥ (\d+)/.exec(read(readme))?.[1]],
]

const major = v => /\d+/.exec(String(v ?? ""))?.[0]

test("every Node-floor site names the same major", () => {
  const all = sites()
  // a site the test cannot read guards nothing
  assert.deepEqual(
    all.filter(([, v]) => major(v) === undefined),
    [],
  )
  assert.equal(
    new Set(all.map(([, v]) => major(v))).size,
    1,
    all.map(([site, v]) => `${site}: ${v}`).join("\n"),
  )
})
