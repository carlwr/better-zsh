/**
 * VISUAL-PRESENTATION TESTS
 *
 * Assertions about how `--help` renders to a human reader — not the
 * behavioral contract (that lives in `help-contract.test.ts`).
 *
 * Policy reference: see `CLI-VISUAL-POLICY.md` at the repo root. This
 * file is stricli-specific: some policy SHOULDs that cliffy can satisfy
 * with hand-patching (e.g. uppercase placeholder in the FLAGS column)
 * cannot be expressed in stricli without forking, so the assertions
 * here are calibrated to what stricli's rendering engine permits.
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
  // Root help is ours; we pre-wrap.
  test("<root> --help: every line ≤ 80 cols", async () => {
    const out = await getHelp("<root>")
    expect(maxLineLen(out)).toBeLessThanOrEqual(80)
  })

  // Sub-help FLAGS-column briefs must fit 80 cols — stricli doesn't
  // word-wrap, and soft-wrap at terminal width would land continuations
  // at COL=0 (the pressure point `flagBriefs` was added to avoid).
  test.each(subs)("%s --help: every FLAGS-column row ≤ 80 cols", async sub => {
    const out = await getHelp(sub)
    const start = out.indexOf("Flags:")
    expect(start).toBeGreaterThanOrEqual(0)
    const flagsSection = out.slice(start)
    expect(maxLineLen(flagsSection)).toBeLessThanOrEqual(80)
  })

  // Sub-help description body sits at COL=1 but is source-hardwrapped
  // at 70 (see tooldef's DESCRIPTION_LINE_MAX_LEN). Regression here
  // usually means a source string grew past the cap; enforcement lives
  // in tooldef's `description wrap discipline` suite.
  test.each(subs)("%s --help: body lines ≤ 80 cols", async sub => {
    const out = await getHelp(sub)
    const usageEnd = out.indexOf("\n\n")
    const flagsStart = out.indexOf("Flags:")
    expect(usageEnd).toBeGreaterThan(0)
    expect(flagsStart).toBeGreaterThan(usageEnd)
    const body = out.slice(usageEnd, flagsStart)
    expect(maxLineLen(body)).toBeLessThanOrEqual(80)
  })
})

describeIfBuilt("blank-line hygiene", () => {
  test.each(allHelp)("%s --help: no run of 3+ blank lines", async target => {
    const out = await getHelp(target)
    expect(out).not.toMatch(/\n\s*\n\s*\n\s*\n/)
  })
})

describeIfBuilt("root --help rendering", () => {
  test("Usage line includes <command> placeholder (not bare)", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/Usage:\s+zshref-stricli <command> \[options\]/)
  })

  test("top-level sections present in scan-order", async () => {
    const out = await getHelp("<root>")
    const order = [
      "Description:",
      "Exit codes:",
      "Environment:",
      "Commands:",
      "Flags:",
      "Examples:",
    ]
    let cursor = 0
    for (const h of order) {
      const idx = out.indexOf(h, cursor)
      expect(idx, `heading "${h}" missing or out of order`).toBeGreaterThan(
        cursor,
      )
      cursor = idx
    }
  })

  test("Description body mentions JSON-stdout / stderr", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/stdout is valid JSON/i)
    expect(out).toMatch(/stderr/i)
  })

  test("Exit codes section enumerates 0/1/2", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/^\s*0\s+success/m)
    expect(out).toMatch(/^\s*1\s+unexpected/m)
    expect(out).toMatch(/^\s*2\s+invalid/m)
  })

  test("Environment section documents NO_COLOR", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/NO_COLOR/)
  })

  test("top-level --help advertises the sub-level --help form", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/zshref-stricli\s+<command>\s+--help/)
  })

  test("Examples section present with ≥3 command invocations", async () => {
    const out = await getHelp("<root>")
    const m = out.match(
      /zshref-stricli\s+(classify|search|describe|lookup_option)\b/g,
    )
    expect(m?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  test("briefs render as single lines in the Commands column", async () => {
    const out = await getHelp("<root>")
    for (const sub of subs) {
      const re = new RegExp(`^\\s*${sub}\\s+\\S.*$`, "m")
      expect(out).toMatch(re)
    }
  })

  test("Commands column briefs: lowercase start, no trailing period", async () => {
    const out = await getHelp("<root>")
    expect(out).toMatch(/classify\s+classify a raw zsh token/)
    expect(out).not.toMatch(/classify a raw zsh token, return its doc\./)
  })
})

describeIfBuilt("sub --help rendering", () => {
  test.each(subs)("%s: Usage synopsis has UPPERCASE placeholder", async sub => {
    const out = await renderHelp([sub, "--help"])
    // Our customUsage writes `--flag=FLAG` with uppercase placeholder.
    expect(out).toMatch(/--[a-z_]+=[A-Z_]+/)
  })

  test.each(subs)("%s: body starts with brief on its own line", async sub => {
    // Stricli emits: USAGE block, blank line, fullDescription. Our
    // fullDescription begins with `td.brief\n\n…` — so the first
    // non-Usage, non-blank line should be a short phrase (no trailing
    // period, not a sentence).
    const out = await renderHelp([sub, "--help"])
    const afterUsage = out.split(/\n\s*\n/).find(p => !/^Usage:/.test(p))
    expect(afterUsage).toBeDefined()
    const firstLine = (afterUsage ?? "").split("\n")[0] ?? ""
    expect(firstLine.length).toBeGreaterThan(0)
    expect(firstLine).not.toMatch(/\.$/)
    expect(firstLine.length).toBeLessThanOrEqual(80)
  })

  test.each(
    subs,
  )("%s: no duplicated built-in 'Version:' line from sub-level help", async sub => {
    const out = await renderHelp([sub, "--help"])
    expect(out).not.toMatch(/^Version:/m)
  })
})

describeIfBuilt("(required) markers match schema", () => {
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
