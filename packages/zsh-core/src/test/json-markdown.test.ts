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

    type NamedRec = { name: string; mdBody: string }
    const loadRecs = <T = Rec>(file: string): T[] =>
      JSON.parse(readFileSync(join(jsonDir, file), "utf8")) as T[]

    test.each(
      jsonDataFiles,
    )("%s records have a non-empty mdBody string", file => {
      const recs = loadRecs(file)
      expect(recs.length).toBeGreaterThan(0)
      for (const r of recs) {
        expect(typeof r.mdBody).toBe("string")
        expect((r.mdBody as string).length).toBeGreaterThan(0)
      }
    })

    test.each([
      ["options.json", "autocd", 100, ["AUTO_CD", "setopt"]],
      ["builtins.json", "echo", 50, []],
    ] as const)("%s:%s mdBody contains rendered content", (file, name, minLen, parts) => {
      const rec = loadRecs<NamedRec>(file).find(r => r.name === name)
      expect(rec).toBeDefined()
      const md = rec?.mdBody ?? ""
      expect(md.length).toBeGreaterThan(minLen)
      for (const p of parts) expect(md).toContain(p)
    })
  },
)
