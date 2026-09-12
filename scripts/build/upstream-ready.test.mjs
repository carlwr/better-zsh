// The readiness script is what stands between a false skip-upstream claim and
// a build against a half-written `dist/`. These pin the paths that resolve a
// caller or refuse to, none of which may build anything.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import {
  packageDirs,
  repoRoot,
  upstreamOf,
  upstreamPkgs,
} from "./upstream-graph.mjs"

const script = join(repoRoot, "scripts", "build", "upstream-ready.mjs")

// BZ_SKIP_UPSTREAM throughout: a regression that starts building must fail the
// assertion, never spend a build doing it.
const call = (args, env = {}) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_package_name: undefined,
      BZ_SKIP_UPSTREAM: "1",
      ...env,
    },
  })

for (const [label, args] of [
  ["no command", []],
  ["an unknown command", ["nope"]],
  ["run without a command", ["run"]],
]) {
  test(`${label} exits 1 with usage`, () => {
    const { status, stderr } = call(args)
    assert.equal(status, 1)
    assert.match(stderr, /usage: node scripts\/build\/upstream-ready\.mjs/)
  })
}

for (const [label, name] of [
  ["unset", undefined],
  ["not a workspace member", "better-zsh-workspace"],
]) {
  test(`ensure refuses a caller that is ${label}`, () => {
    const { status, stderr } = call(["ensure"], { npm_package_name: name })
    assert.equal(status, 1)
    assert.match(stderr, /npm_package_name/)
  })
}

test("ensure demands nothing of a package with no upstream", () => {
  // The dependency-free upstream package. A fallback to the whole workspace
  // would demand freshness of siblings it does not compile against.
  const root = upstreamPkgs[0]
  assert.deepEqual(upstreamOf(root), [])
  const { status, stdout, stderr } = call(["ensure"], {
    npm_package_name: root,
  })
  assert.equal(status, 0, stderr)
  assert.equal(stdout + stderr, "")
})

test("every package with upstream routes its pre* hooks through ensure", () => {
  for (const [name, dir] of packageDirs()) {
    if (!upstreamOf(name).length) continue
    const scripts = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ).scripts
    for (const [hook, cmd] of Object.entries(scripts ?? {})) {
      // pnpm's rule: `pre<x>` is a hook only when a script `x` exists
      // (`preview` is a script, not a hook of `view`).
      if (!hook.startsWith("pre") || !(hook.slice(3) in scripts)) continue
      assert.match(cmd, /upstream-ready\.mjs ensure/, `${name}:${hook}`)
    }
  }
})
