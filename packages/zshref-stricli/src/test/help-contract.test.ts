/**
 * CLI CONTRACT TESTS
 *
 * Stream routing, exit codes, and machine-readable output. Downstream
 * tooling (`jq` pipes, CI scripts, agent harnesses) depends on these.
 * See `help-visual.test.ts` for the parallel suite on presentation.
 */

import { expect, test } from "vitest"
import { describeIfBuilt, runBin } from "./bin-util.ts"

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

  test("invoked with no args prints help to stderr", async () => {
    const { code, stdout, stderr } = await runBin([])
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr).toMatch(/Usage:/)
  })
})

describeIfBuilt("ANSI colors auto-disabled when output isn't a TTY", () => {
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

  test("JSON stdout contains no ANSI escapes", async () => {
    const { stdout } = await runBin(["classify", "--raw", "echo"])
    expect(stdout).not.toMatch(ANSI_RE)
  })
})

describeIfBuilt("exit-code mapping", () => {
  test("missing required flag exits 2", async () => {
    const { code } = await runBin(["classify"])
    expect(code).toBe(2)
  })

  test("bad enum value exits 2", async () => {
    const { code } = await runBin(["search", "--category", "not_a_real"])
    expect(code).toBe(2)
  })

  test("unknown subcommand exits 2", async () => {
    const { code } = await runBin(["bogus"])
    expect(code).toBe(2)
  })

  test("successful command exits 0", async () => {
    const { code } = await runBin(["classify", "--raw", "echo"])
    expect(code).toBe(0)
  })
})

describeIfBuilt("JSON output on stdout", () => {
  test("successful invocation writes pretty-printed parseable JSON", async () => {
    const { code, stdout } = await runBin(["classify", "--raw", "echo"])
    expect(code).toBe(0)
    // Pretty-printed → indented two-space JSON with a "match" key
    expect(stdout).toMatch(/\n {2}"match":/)
    expect(() => JSON.parse(stdout)).not.toThrow()
  })

  test("{match:null} for unknown token is still a success (exit 0)", async () => {
    const { code, stdout } = await runBin(["classify", "--raw", "__no_such__"])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual({ match: null })
  })
})
