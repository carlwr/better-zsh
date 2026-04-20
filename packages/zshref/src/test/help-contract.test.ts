/**
 * CLI CONTRACT TESTS
 *
 * Behavioral guarantees about streams, exit codes, and machine-readable
 * output — the things downstream tooling (`jq` pipes, CI scripts, agent
 * harnesses) depend on. See `help-visual.test.ts` for the parallel suite
 * that gates human-facing presentation.
 */

import { expect, test } from "vitest"
import { describeIfBuilt, renderHelp, runBin } from "./bin-util.ts"

const subs = ["classify", "search", "describe", "lookup_option"] as const

describeIfBuilt("stream routing: stdout reserved for JSON", () => {
  test("--help writes to stderr; stdout is empty", async () => {
    const { code, stdout, stderr } = await runBin(["--help"])
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr.length).toBeGreaterThan(0)
  })

  test.each(subs)("%s --help writes to stderr; stdout is empty", async sub => {
    const { code, stdout, stderr } = await runBin([sub, "--help"])
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr.length).toBeGreaterThan(0)
  })

  test("--version writes to stderr; stdout is empty", async () => {
    const { code, stdout, stderr } = await runBin(["--version"])
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr.trim().length).toBeGreaterThan(0)
  })
})

describeIfBuilt("ANSI colors auto-disabled when output isn't a TTY", () => {
  // execFile pipes stdout/stderr, so neither is a TTY → no color.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC
  const ANSI_RE = /\x1b\[/

  test("--help output contains no ANSI escape sequences", async () => {
    const { stderr } = await runBin(["--help"])
    expect(stderr).not.toMatch(ANSI_RE)
  })

  test.each(subs)("%s --help: no ANSI escapes", async sub => {
    const { stderr } = await runBin([sub, "--help"])
    expect(stderr).not.toMatch(ANSI_RE)
  })
})

describeIfBuilt("exit-code mapping", () => {
  test("missing required option exits 2 and mentions 'required'", async () => {
    const { code, stderr } = await runBin(["classify"])
    expect(code).toBe(2)
    expect(stderr).toMatch(/required/i)
  })

  test("bad enum value exits 2", async () => {
    const { code } = await runBin([
      "search",
      "--category",
      "not_a_real_category",
    ])
    expect(code).toBe(2)
  })
})

describeIfBuilt("(required) markers match schema", () => {
  // The visual surfacing is in help-visual.test.ts; here we assert the
  // count is wired correctly end-to-end from the JSON-schema `required`
  // list through cliffy's option registration.
  test.each([
    ["classify", 1],
    ["lookup_option", 1],
    ["describe", 2],
    ["search", 0],
  ] as const)("%s has %d (required) markers", async (sub, count) => {
    const out = await renderHelp([sub, "--help"])
    const markers = out.match(/\(required\)/g) ?? []
    expect(markers.length).toBe(count)
  })
})

describeIfBuilt("JSON output on stdout", () => {
  test("successful invocation writes pretty-printed parseable JSON", async () => {
    const { code, stdout } = await runBin(["classify", "--raw", "echo"])
    expect(code).toBe(0)
    expect(stdout).toMatch(/\n {2}"match":/)
    expect(() => JSON.parse(stdout)).not.toThrow()
  })

  test("no ANSI on the JSON stream either", async () => {
    const { stdout } = await runBin(["classify", "--raw", "echo"])
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC
    expect(stdout).not.toMatch(/\x1b\[/)
  })
})
