/**
 * VISUAL-PRESENTATION TESTS
 *
 * These assertions are about how `--help` renders to a human reader, not
 * about the CLI's behavioral contract (that lives in
 * `help-contract.test.ts`). Failures here mean the output *looks wrong*:
 * a line too wide for an 80-col terminal, a brief that became a sentence,
 * a placeholder that regressed from `[QUERY]` to `[query]`, etc.
 *
 * Regressions in this file are less severe than contract regressions —
 * nothing is broken, it just looks off — but they accumulate, so we gate
 * them.
 *
 * The rules asserted here are the concrete instances of the project-wide
 * guidelines in `CLI-VISUAL-POLICY.md` (repo root). If you change a rule,
 * update the policy doc too.
 */

import { expect, test } from "vitest"
import { describeIfBuilt, renderHelp } from "./bin-util.ts"

const subs = ["classify", "search", "describe", "lookup_option"] as const
const allHelp = ["<root>", ...subs] as const

function maxLineLen(s: string): number {
  return s.split("\n").reduce((max, l) => Math.max(max, l.length), 0)
}

async function getHelp(target: (typeof allHelp)[number]): Promise<string> {
  return target === "<root>"
    ? renderHelp(["--help"])
    : renderHelp([target, "--help"])
}

describeIfBuilt("line width", () => {
  test.each(allHelp)("%s --help: every line ≤ 80 cols", async target => {
    const out = await getHelp(target)
    expect(maxLineLen(out)).toBeLessThanOrEqual(80)
  })
})

describeIfBuilt("blank-line hygiene", () => {
  // Three+ consecutive blank lines usually mean a paragraph-break bug
  // (description text joined to an Examples block with an extra gap, etc.)
  test.each(allHelp)("%s --help: no run of 3+ blank lines", async target => {
    const out = await getHelp(target)
    expect(out).not.toMatch(/\n\s*\n\s*\n\s*\n/)
  })
})

describeIfBuilt("root --help rendering", () => {
  test("Usage line includes <command> placeholder (not bare)", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/Usage:\s+zshref <command> \[options\]/)
  })

  test("Description mentions JSON-stdout / stderr / exit codes", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/stdout is valid JSON/i)
    expect(out).toMatch(/stderr/i)
    expect(out).toMatch(/Exit codes:/)
    expect(out).toMatch(/^\s*0\s+success/m)
    expect(out).toMatch(/^\s*1\s+unexpected/m)
    expect(out).toMatch(/^\s*2\s+invalid/m)
  })

  test("Description mentions NO_COLOR under Environment", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/Environment:/)
    expect(out).toMatch(/NO_COLOR/)
  })

  test("Examples section is present with at least 3 entries", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/Examples:/)
    const m = out.match(
      /zshref\s+(classify|search|describe|lookup_option|<command>)/g,
    )
    expect(m?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  test("briefs render as single lines (no wrap) in Commands column", async () => {
    const out = await getHelp("<root>")
    // Each sub's brief is expected on one physical line next to the name.
    for (const sub of subs) {
      const re = new RegExp(`^\\s*${sub}\\s+-\\s+\\S.*$`, "m")
      expect(out).toMatch(re)
    }
  })

  test("Commands column briefs: lowercase start, no trailing period", async () => {
    const out = await getHelp("<root>")
    // Anchor on "classify" specifically — other sub briefs are asserted
    // shape-wise by the ToolDef `brief` invariant test.
    expect(out).toMatch(/classify\s+-\s+classify a raw zsh token/)
    expect(out).not.toMatch(/classify a raw zsh token, return its doc\./)
  })
})

// Guards against the "silent visual compromise" class: output that passes
// the ≤80-col check but has become vertically bloated or otherwise hard
// to read. Thresholds are deliberately loose — a regression has to be
// clearly runaway-scale to fail, so normal growth doesn't churn the test.
describeIfBuilt("silent visual compromise guards", () => {
  const MAX_LINES_PER_OPTION = 6

  test.each(
    subs,
  )(`%s: no single option renders in > ${MAX_LINES_PER_OPTION} lines`, async sub => {
    const out = await renderHelp([sub, "--help"])
    const optsStart = out.indexOf("Options:")
    expect(optsStart).toBeGreaterThanOrEqual(0)
    const rest = out.slice(optsStart).split(/\n\s*\n\s*\n/)[0] ?? ""
    const lines = rest.split("\n").slice(2) // drop "Options:" + blank
    // Each option's block starts at "  --" or "  -h,"; continuation
    // rows of a description accumulate under the current group.
    const FLAG_ROW = /^ {2}-/
    const groups: string[][] = []
    for (const line of lines) {
      if (FLAG_ROW.test(line)) groups.push([line])
      else if (groups.length > 0) groups.at(-1)?.push(line)
    }
    for (const g of groups) {
      while (g.length > 0 && g.at(-1)?.trim() === "") g.pop()
      expect(g.length).toBeLessThanOrEqual(MAX_LINES_PER_OPTION)
    }
  })

  test.each(subs)("%s: Description body has ≥ 2 non-blank lines", async sub => {
    const out = await renderHelp([sub, "--help"])
    const m = out.match(/Description:\n\n([\s\S]+?)\nOptions:/)
    expect(m).not.toBeNull()
    const body = m?.[1] ?? ""
    const nonBlank = body.split("\n").filter(l => l.trim() !== "")
    expect(nonBlank.length).toBeGreaterThanOrEqual(2)
  })
})

describeIfBuilt("sub --help rendering (uniform)", () => {
  test.each(subs)("%s: Usage line has UPPERCASE placeholder", async sub => {
    const out = await renderHelp([sub, "--help"])
    expect(out).toMatch(/--[a-z_]+=[A-Z_]+/)
    expect(out).not.toMatch(/--[a-z_]+=[a-z]+(?![A-Z_])/)
  })

  test.each(
    subs,
  )("%s: Options column renders UPPERCASE placeholder", async sub => {
    const out = await renderHelp([sub, "--help"])
    expect(out).toMatch(/[<[][A-Z][A-Z_]*[\]>]/)
  })

  test.each(subs)("%s: no Version: line (clutter-suppressed)", async sub => {
    const out = await renderHelp([sub, "--help"])
    expect(out).not.toMatch(/^Version:/m)
  })
})
