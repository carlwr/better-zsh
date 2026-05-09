import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const script = resolve(dirname(fileURLToPath(import.meta.url)), "quiet-run.mjs")

function run(args, env = {}) {
  return spawnSync("node", [script, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  })
}

function linesOf(s) {
  return s ? s.replace(/\n$/, "").split(/\r?\n/) : []
}

const seq = (n, prefix = "L") =>
  `for i in $(seq 1 ${n}); do echo ${prefix}$i; done`

test("success: exactly one stdout line, no stderr", () => {
  const r = run(["ok", "true"])
  assert.equal(r.status, 0)
  assert.equal(r.stderr, "")
  assert.equal(linesOf(r.stdout).length, 1)
  assert.match(r.stdout, /^ok: OK \(\d+\.\d+s\)\n$/)
})

test("failure under cap: full output + 2 status lines, no trim header", () => {
  const r = run(["f", "sh", "-c", `${seq(30)}; exit 1`])
  assert.equal(r.status, 1)
  assert.equal(r.stdout, "")
  const ls = linesOf(r.stderr)
  assert.equal(ls.length, 32)
  assert.equal(ls[0], "L1")
  assert.equal(ls[29], "L30")
  assert.match(ls[30], /^f: failed \(exit 1, /)
  assert.match(ls[31], /^f: full output: /)
  assert.ok(!r.stderr.includes("showing last"))
})

test("failure over cap: emits cap lines + trim header + 2 status lines", () => {
  const r = run(["b", "sh", "-c", `${seq(200)}; exit 1`])
  assert.equal(r.status, 1)
  const ls = linesOf(r.stderr)
  assert.equal(ls.length, 123)
  assert.equal(ls[0], "b: showing last 120 of 200 lines")
  assert.equal(ls[1], "L81")
  assert.equal(ls[120], "L200")
})

test("BZ_QUIET_RUN_LINES override caps captured tail", () => {
  const r = run(["o", "sh", "-c", `${seq(30)}; exit 1`], {
    BZ_QUIET_RUN_LINES: "10",
  })
  assert.equal(r.status, 1)
  const ls = linesOf(r.stderr)
  assert.equal(ls.length, 13)
  assert.equal(ls[0], "o: showing last 10 of 30 lines")
  assert.equal(ls[1], "L21")
  assert.equal(ls[10], "L30")
})

test("verbose: stdout passes through and OK line still emitted", () => {
  const r = run(["v", "--verbose", "sh", "-c", "echo hi"])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /^hi\n/)
  assert.match(r.stdout, /v: OK \(/)
})

test("unknown label without inline command exits 2", () => {
  const r = run(["no-such-task"])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /unknown quiet task/)
})

test("missing label exits 2 with usage", () => {
  const r = run([])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /usage: /)
})

// Smoke: front-facing pnpm scripts that must stay silent on success.
// Drift here means quiet-run wrapping has regressed, or a child script
// (lint, verify-upstream-contract, etc.) started emitting unexpectedly.
// When adding a new front-facing pnpm script: add [name, max-stdout-lines].
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const smokeScripts = [
  ["verify:upstream", 0],
  ["format:check", 1],
  ["lint:md", 0],
]

for (const [script, maxStdoutLines] of smokeScripts) {
  test(`smoke: pnpm --silent ${script} stays quiet`, () => {
    const r = spawnSync("pnpm", ["--silent", "run", script], {
      cwd: repoRoot,
      encoding: "utf8",
    })
    assert.equal(
      r.status,
      0,
      `failed:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    )
    assert.ok(
      linesOf(r.stdout).length <= maxStdoutLines,
      `stdout > ${maxStdoutLines} lines:\n${r.stdout}`,
    )
    assert.equal(r.stderr, "", `stderr non-empty:\n${r.stderr}`)
  })
}
