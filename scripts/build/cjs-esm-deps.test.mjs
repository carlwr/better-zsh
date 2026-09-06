// A CJS entry that `require()`s an ESM-only dependency loads only where
// `require(esm)` is available (Node >=22.12). Nothing else notices: the
// bundler is happy, and a modern dev machine resolves it fine — the failure
// lands on a consumer whose Node the package still claims to support.

import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"

// Node version that unflagged `require(esm)`.
const REQUIRE_ESM_SINCE = [22, 12]

const pkgsDir = new URL("../../packages/", import.meta.url).pathname
const readJson = p => JSON.parse(readFileSync(p, "utf8"))

const minNode = engines => {
  const m = /(\d+)(?:\.(\d+))?/.exec(engines?.node ?? "")
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : undefined
}

const atLeast = (v, min) =>
  v !== undefined && (v[0] > min[0] || (v[0] === min[0] && v[1] >= min[1]))

/** Any `require` condition anywhere in an exports subtree makes it loadable. */
const hasRequireCondition = node => {
  if (node === null || typeof node !== "object") return false
  return Object.entries(node).some(
    ([k, v]) => k === "require" || hasRequireCondition(v),
  )
}

/** ESM-only = `require()` cannot load it: module type, and no CJS on offer. */
const isEsmOnly = meta => {
  if (meta.type !== "module") return false
  if (meta.exports !== undefined) return !hasRequireCondition(meta.exports)
  return true // no exports map: `main` is resolved as ESM under type:module
}

/** deps `require()`d by a built CJS entry that ship no CJS themselves. */
const esmOnlyRequires = (dir, cjsEntry) => {
  const src = readFileSync(cjsEntry, "utf8")
  const req = createRequire(join(dir, "package.json"))
  const deps = Object.keys(
    readJson(join(dir, "package.json")).dependencies ?? {},
  )
  return deps.filter(d => {
    if (!src.includes(`require("${d}")`)) return false
    // `<dep>/package.json` is often not an exported subpath, so resolve the
    // entry and walk up to the manifest that names the dep.
    let cur
    try {
      cur = dirname(req.resolve(d))
    } catch {
      return false // not resolvable here; nothing to assert
    }
    for (; cur !== dirname(cur); cur = dirname(cur)) {
      const manifest = join(cur, "package.json")
      if (!existsSync(manifest)) continue
      const meta = readJson(manifest)
      if (meta.name === d) return isEsmOnly(meta)
    }
    return false
  })
}

const offenders = []
for (const name of ["zsh-core", "zsh-core-tooldef", "zshref-mcp"]) {
  const dir = join(pkgsDir, name)
  const pkg = readJson(join(dir, "package.json"))
  const cjs = pkg.exports?.["."]?.require
  if (cjs === undefined) continue
  const entry = join(dir, cjs)
  if (!existsSync(entry)) continue // not built; other gates cover that
  for (const dep of esmOnlyRequires(dir, entry)) {
    if (!atLeast(minNode(pkg.engines), REQUIRE_ESM_SINCE)) {
      offenders.push(
        `${name}: CJS entry requires ESM-only ${dep}, but engines.node is ` +
          `${pkg.engines?.node ?? "unset"} (needs >=22.12)`,
      )
    }
  }
}

test("CJS entries requiring ESM-only deps declare a require(esm)-capable engines.node", () => {
  assert.deepEqual(offenders, [])
})
