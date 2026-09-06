// Dual-registry drift: a dependency shared by the npm manifest and the JSR
// import map must name the same version on both sides. The two are edited
// independently, and only the `*REGISTRY*` scripts ever resolve the JSR side,
// so a stale range there survives every ordinary gate.

import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const pkgsDir = new URL("../../packages/", import.meta.url).pathname

const readJson = path => JSON.parse(readFileSync(path, "utf8"))

/** `jsr:@scope/name@range` or `jsr:@scope/name@range/subpath` -> name + range. */
const parseJsr = spec => {
  const m = /^jsr:((?:@[^/]+\/)?[^@/][^@]*)@([^/]+)/.exec(spec)
  return m ? { name: m[1], range: m[2] } : undefined
}

const baseVersion = range => range.replace(/^[\^~]/, "")

const pairs = readdirSync(pkgsDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .flatMap(e => {
    const dir = join(pkgsDir, e.name)
    let deno
    try {
      deno = readJson(join(dir, "deno.json"))
    } catch {
      return []
    }
    const npmDeps = readJson(join(dir, "package.json")).dependencies ?? {}
    return Object.values(deno.imports ?? {}).flatMap(spec => {
      const jsr = parseJsr(spec)
      if (!jsr) return []
      const npm = npmDeps[jsr.name]
      // workspace protocol has no published version to agree with
      if (npm === undefined || npm.startsWith("workspace:")) return []
      return [{ pkg: e.name, ...jsr, npm }]
    })
  })

test("deno.json and package.json agree on shared dependency versions", () => {
  const mismatched = pairs.filter(
    p => baseVersion(p.range) !== baseVersion(p.npm),
  )
  assert.deepEqual(
    mismatched.map(p => `${p.pkg}: ${p.name} jsr=${p.range} npm=${p.npm}`),
    [],
  )
})
