import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { jsonDataFiles } from "../docs/json-artifacts"

/**
 * Smoke test: every emitted corpus JSON record carries an `mdBody` string.
 * Rendered-markdown embedding is the seam between TS (renderer) and the
 * out-of-process Rust CLI; this test guards against accidental drift in the
 * JSON-emit path.
 *
 * Every category has a renderer; this checks the generated JSON files using
 * the canonical artifact list so new categories join the guard automatically.
 */

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const jsonDir = join(pkgDir, "dist", "json")

describe.runIf(existsSync(jsonDir))(
  "emitted JSON records carry rendered markdown body",
  () => {
    type Rec = { readonly mdBody?: unknown } & Record<string, unknown>

    test.each(
      jsonDataFiles,
    )("%s records have a non-empty mdBody string", file => {
      const recs = JSON.parse(
        readFileSync(join(jsonDir, file), "utf8"),
      ) as Rec[]
      expect(recs.length).toBeGreaterThan(0)
      for (const r of recs) {
        expect(typeof r.mdBody).toBe("string")
        expect((r.mdBody as string).length).toBeGreaterThan(0)
      }
    })

    test("options.json:autocd mdBody contains real rendered content", () => {
      const recs = JSON.parse(
        readFileSync(join(jsonDir, "options.json"), "utf8"),
      ) as { name: string; mdBody: string }[]
      const autocd = recs.find(r => r.name === "autocd")
      expect(autocd).toBeDefined()
      const md = autocd?.mdBody ?? ""
      expect(md).toContain("AUTO_CD")
      expect(md).toContain("setopt")
      expect(md.length).toBeGreaterThan(100)
    })

    test("builtins.json:echo mdBody contains synopsis + description", () => {
      const recs = JSON.parse(
        readFileSync(join(jsonDir, "builtins.json"), "utf8"),
      ) as { name: string; mdBody: string }[]
      const echo = recs.find(r => r.name === "echo")
      expect(echo).toBeDefined()
      expect((echo?.mdBody ?? "").length).toBeGreaterThan(50)
    })
  },
)
