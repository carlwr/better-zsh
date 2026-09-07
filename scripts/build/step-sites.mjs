// A *step site* is any file that contributes `steps:` to a run: a workflow
// file, or a composite action spliced in wherever a job `uses:` it. Scanners
// that reason about what a run can reach must walk both, so the discovery —
// and its tolerance for a repo carrying neither — lives in one place.

import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const workflowDir = join(".github", "workflows")
const actionDir = join(".github", "actions")

const entries = (repoRoot, dir, opts) => {
  const abs = join(repoRoot, dir)
  return existsSync(abs)
    ? readdirSync(abs, { withFileTypes: true, ...opts })
    : []
}

/** Repo-relative path of every workflow file. */
export const workflowFiles = repoRoot =>
  entries(repoRoot, workflowDir)
    .filter(ent => ent.isFile())
    .map(ent => join(workflowDir, ent.name))

/**
 * Repo-relative path of every action manifest under `.github/actions`. Nested
 * and `.yaml`-spelled ones included: GitHub accepts both, so skipping one is a
 * scanner blind spot rather than a repo error.
 */
export const actionFiles = repoRoot =>
  entries(repoRoot, actionDir, { recursive: true })
    .filter(ent => ent.isFile() && /^action\.ya?ml$/.test(ent.name))
    .map(ent => relative(repoRoot, join(ent.parentPath, ent.name)))
