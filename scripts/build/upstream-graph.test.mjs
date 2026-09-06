// The fan-out guard fails silently when it stops matching: a detector that
// matches nothing still exits 0. These fixtures pin the shapes it must catch.

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  hasUpstreamBuild,
  upstreamRebuildSources,
  upstreamTriggering,
} from "./upstream-graph.mjs"

// An upstream build the detector cannot see is an unguarded `pre*` hook that
// reports clean. Every spelling `pnpm` accepts has to read as the same build.
const spellings = [
  ["plain", "pnpm --filter @carlwr/zsh-core build", true],
  ["`run`", "pnpm --filter @carlwr/zsh-core run build", true],
  ["`-F`", "pnpm -F @carlwr/zsh-core build", true],
  ["`-F` + `run`", "pnpm -F @carlwr/zsh-core run build", true],
  ["parenthesized", "(pnpm --filter @carlwr/zsh-core-tooldef build)", true],
  ["longer script name", "pnpm --filter @carlwr/zsh-core build:docs", false],
  ["downstream package", "pnpm --filter @carlwr/zshref-mcp build", false],
]

for (const [name, cmd, expected] of spellings) {
  test(`upstream build, ${name}`, () => {
    assert.equal(hasUpstreamBuild(cmd), expected)
  })
}

const downstream = {
  prebuild:
    '[ -n "$BZ_SKIP_UPSTREAM" ] || pnpm --filter @carlwr/zsh-core build',
  build: "tsx build.ts",
  "test:pack": "pnpm build && node scripts/test-pack.mjs",
  test: "vitest run",
  lint: "biome check .",
}

test("upstream-triggering: the pre-hook's target, and what calls it", () => {
  const triggering = upstreamTriggering(downstream)
  assert.deepEqual([...triggering], ["build", "test:pack"])
})

test("upstream-triggering: a `run`-spelled pre-hook counts the same", () => {
  const triggering = upstreamTriggering({
    ...downstream,
    prebuild:
      '[ -n "$BZ_SKIP_UPSTREAM" ] || pnpm --filter @carlwr/zsh-core run build',
  })
  assert.deepEqual([...triggering], ["build", "test:pack"])
})

const triggeringByPkg = new Map([
  ["@carlwr/zsh-core", new Set()],
  ["@carlwr/zsh-core-tooldef", upstreamTriggering(downstream)],
  ["@carlwr/zshref-mcp", upstreamTriggering(downstream)],
  ["better-zsh", upstreamTriggering(downstream)],
])

const cases = [
  ["one package", "pnpm --filter better-zsh test:pack", 1],
  [
    "hand-rolled fan-out",
    "pnpm --filter @carlwr/zsh-core-tooldef test:pack && pnpm --filter @carlwr/zshref-mcp test:pack && pnpm --filter better-zsh test:pack",
    3,
  ],
  [
    "`run` spelling",
    "pnpm --filter @carlwr/zsh-core-tooldef run test:pack && pnpm --filter better-zsh run test:pack",
    2,
  ],
  [
    "raw upstream builds",
    "pnpm --filter @carlwr/zsh-core build && pnpm --filter @carlwr/zsh-core-tooldef build",
    2,
  ],
  [
    "raw upstream builds, `-F` and `run` spellings",
    "pnpm -F @carlwr/zsh-core run build && pnpm --filter @carlwr/zsh-core-tooldef build",
    2,
  ],
  [
    "non-triggering scripts",
    "pnpm --filter @carlwr/zsh-core-tooldef lint && pnpm --filter better-zsh lint",
    0,
  ],
  [
    "one package, two of its scripts",
    "pnpm --filter better-zsh build && pnpm --filter better-zsh test:pack",
    1,
  ],
]

for (const [name, cmd, expected] of cases) {
  test(`rebuild sources: ${name}`, () => {
    assert.equal(upstreamRebuildSources(cmd, triggeringByPkg).size, expected)
  })
}
