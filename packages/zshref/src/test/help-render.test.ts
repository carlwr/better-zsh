import { expect, test } from "vitest"
import { describeIfBuilt, renderHelp, runBin } from "./_spawn.ts"

function maxLineLen(s: string): number {
  return s.split("\n").reduce((max, l) => Math.max(max, l.length), 0)
}

describeIfBuilt("root --help rendering", () => {
  test("Usage line includes <command> placeholder", async () => {
    const out = await renderHelp(["--help"])
    expect(out).toMatch(/Usage:\s+zshref <command> \[options\]/)
  })

  test("Description mentions JSON-stdout / stderr-for-humans / exit codes", async () => {
    const out = await renderHelp(["--help"])
    expect(out).toMatch(/stdout is always valid JSON/i)
    expect(out).toMatch(/stderr/i)
    expect(out).toMatch(/Exit codes:/)
    expect(out).toMatch(/^\s*0\s+success/m)
    expect(out).toMatch(/^\s*1\s+unexpected/m)
    expect(out).toMatch(/^\s*2\s+invalid/m)
  })

  test("Examples section is present with at least 3 entries", async () => {
    const out = await renderHelp(["--help"])
    expect(out).toMatch(/Examples:/)
    const exampleCount = out.match(
      /zshref\s+(classify|search|describe|lookup_option|<command>)/g,
    )
    expect(exampleCount?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  test("Commands column uses briefs (lowercase, no period)", async () => {
    const out = await renderHelp(["--help"])
    expect(out).toMatch(/classify\s+-\s+classify a raw zsh token/)
    // phrase form, not a sentence — no period at end of the brief phrase
    expect(out).not.toMatch(/classify a raw zsh token, return its doc\./)
  })

  test("line width ≤ 80 chars", async () => {
    const out = await renderHelp(["--help"])
    expect(maxLineLen(out)).toBeLessThanOrEqual(80)
  })
})

describeIfBuilt("sub --help rendering (uniform checks)", () => {
  // Each sub must: have uppercase placeholder in usage+options, no Version
  // line, line width ≤ 80 chars.
  const subs = ["classify", "search", "describe", "lookup_option"] as const

  test.each(subs)("%s: Usage line has UPPERCASE placeholder", async sub => {
    const out = await renderHelp([sub, "--help"])
    // e.g. `--raw=RAW` or `[--query=QUERY]`
    expect(out).toMatch(/--[a-z_]+=[A-Z_]+/)
    // and no lowercase placeholder form
    expect(out).not.toMatch(/--[a-z_]+=[a-z]+(?![A-Z_])/)
  })

  test.each(
    subs,
  )("%s: Options column renders UPPERCASE placeholder", async sub => {
    const out = await renderHelp([sub, "--help"])
    // e.g. `<RAW>` or `[QUERY]`
    expect(out).toMatch(/[<[][A-Z][A-Z_]*[\]>]/)
  })

  test.each(subs)("%s: no Version: line", async sub => {
    const out = await renderHelp([sub, "--help"])
    expect(out).not.toMatch(/^Version:/m)
  })

  test.each(subs)("%s: line width ≤ 80", async sub => {
    const out = await renderHelp([sub, "--help"])
    expect(maxLineLen(out)).toBeLessThanOrEqual(80)
  })
})

describeIfBuilt("required-option enforcement + error exit", () => {
  test("classify without --raw exits 2 and stderr mentions 'required'", async () => {
    const { code, stderr } = await runBin(["classify"])
    expect(code).toBe(2)
    expect(stderr).toMatch(/required/i)
  })

  // One `(required)` marker per required option across the `--help` body.
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

describeIfBuilt("JSON output is pretty-printed", () => {
  test("classify --raw echo emits multi-line indented JSON", async () => {
    const { stdout } = await runBin(["classify", "--raw", "echo"])
    // Pretty-printed JSON contains newlines between fields and indent.
    expect(stdout).toMatch(/\n {2}"match":/)
    // Still parseable.
    expect(() => JSON.parse(stdout)).not.toThrow()
  })
})
