import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Smoke test: every emitted corpus JSON record carries a `markdown` string.
 * Rendered-markdown embedding is the seam between TS (renderer) and the
 * out-of-process Rust CLI; this test guards against accidental drift in the
 * JSON-emit path.
 *
 * Stub renderers legitimately emit "TBD", so "non-empty string" is the only
 * universal invariant. For categories with real renderers we spot-check a
 * known id has substantive content.
 */

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const jsonDir = join(pkgDir, "dist", "json")

describe.runIf(existsSync(jsonDir))(
  "emitted JSON records carry rendered markdown",
  () => {
    const files = [
      "options.json",
      "builtins.json",
      "cond-ops.json",
      "precmds.json",
      "shell-params.json",
      "reserved-words.json",
      "redirections.json",
      "process-substs.json",
      "param-expns.json",
      "subscript-flags.json",
      "param-flags.json",
      "history.json",
      "glob-operators.json",
      "glob-flags.json",
      "prompt-escapes.json",
      "zle-widgets.json",
    ] as const
    type Rec = { readonly markdown?: unknown } & Record<string, unknown>

    test.each(files)("%s records have a non-empty markdown string", file => {
      const recs = JSON.parse(
        readFileSync(join(jsonDir, file), "utf8"),
      ) as Rec[]
      expect(recs.length).toBeGreaterThan(0)
      for (const r of recs) {
        expect(typeof r.markdown).toBe("string")
        expect((r.markdown as string).length).toBeGreaterThan(0)
      }
    })

    test("options.json:autocd markdown contains real rendered content", () => {
      const recs = JSON.parse(
        readFileSync(join(jsonDir, "options.json"), "utf8"),
      ) as { name: string; markdown: string }[]
      const autocd = recs.find(r => r.name === "autocd")
      expect(autocd).toBeDefined()
      const md = autocd?.markdown ?? ""
      expect(md).toContain("AUTO_CD")
      expect(md).toContain("setopt")
      expect(md.length).toBeGreaterThan(100)
    })

    test("builtins.json:echo markdown contains synopsis + description", () => {
      const recs = JSON.parse(
        readFileSync(join(jsonDir, "builtins.json"), "utf8"),
      ) as { name: string; markdown: string }[]
      const echo = recs.find(r => r.name === "echo")
      expect(echo).toBeDefined()
      expect((echo?.markdown ?? "").length).toBeGreaterThan(50)
    })
  },
)
