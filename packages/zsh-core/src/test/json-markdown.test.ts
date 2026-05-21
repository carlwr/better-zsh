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

const loadRecs = <T>(file: string): T[] =>
  JSON.parse(readFileSync(join(jsonDir, file), "utf8")) as T[]

describe.runIf(existsSync(jsonDir))(
  "emitted JSON records carry rendered markdown body",
  () => {
    interface MdRec {
      readonly mdBody: string
    }
    interface NamedMdRec extends MdRec {
      readonly name: string
    }

    test.each(
      jsonDataFiles,
    )("%s records have a non-empty mdBody string", file => {
      // Stub categories (e.g. mathfuncs.json) have zero records during
      // development; skip the non-empty guard for them.
      const recs = loadRecs<MdRec>(file)
      if (recs.length === 0) return
      for (const r of recs) {
        expect(typeof r.mdBody).toBe("string")
        expect(r.mdBody.length).toBeGreaterThan(0)
      }
    })

    test.each([
      ["options.json", "autocd", 100, ["AUTO_CD", "setopt"]],
      ["builtins.json", "echo", 50, []],
    ] as const)("%s:%s mdBody contains rendered content", (file, name, minLen, parts) => {
      const rec = loadRecs<NamedMdRec>(file).find(r => r.name === name)
      expect(rec).toBeDefined()
      const md = rec?.mdBody ?? ""
      expect(md.length).toBeGreaterThan(minLen)
      for (const p of parts) expect(md).toContain(p)
    })
  },
)
