// Discovery going quiet is the failure that matters: both scanners built on it
// then pass by finding nothing. Pin the shapes GitHub accepts but a naive
// directory listing misses, and pin that this repo's own sites are seen.
//
// A path-spelled `uses:` is checked here too: renaming an in-repo action breaks
// every job naming it, and a CI run is otherwise the first thing to notice.

import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { actionFiles, workflowFiles } from "./step-sites.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

const fixture = files => {
  const root = mkdtempSync(join(tmpdir(), "step-sites-"))
  for (const rel of files) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, "name: f\n")
  }
  return root
}

test("this repo's step sites are found", () => {
  assert.ok(
    workflowFiles(repoRoot).includes(join(".github", "workflows", "ci.yml")),
  )
  assert.ok(actionFiles(repoRoot).length)
})

test("nested and `.yaml`-spelled action manifests are found", () => {
  const root = fixture([
    ".github/actions/plain/action.yml",
    ".github/actions/spelled/action.yaml",
    ".github/actions/group/nested/action.yml",
    ".github/actions/group/README.md",
  ])
  assert.deepEqual(actionFiles(root).sort(), [
    join(".github", "actions", "group", "nested", "action.yml"),
    join(".github", "actions", "plain", "action.yml"),
    join(".github", "actions", "spelled", "action.yaml"),
  ])
})

const inRepoUses = rel =>
  [
    ...readFileSync(join(repoRoot, rel), "utf8").matchAll(/uses:\s*\.\/(\S+)/g),
  ].map(([, ref]) => join(ref))

test("every in-repo `uses:` resolves to an action manifest", () => {
  const manifests = new Set(actionFiles(repoRoot).map(rel => dirname(rel)))
  const sites = [...workflowFiles(repoRoot), ...actionFiles(repoRoot)]
  const broken = sites.flatMap(rel =>
    inRepoUses(rel)
      .filter(ref => !manifests.has(ref))
      .map(ref => `${rel}: ./${ref}`),
  )
  assert.deepEqual(broken, [])
})

test("a repo with neither directory yields no sites", () => {
  const root = fixture([])
  assert.deepEqual(workflowFiles(root), [])
  assert.deepEqual(actionFiles(root), [])
})
