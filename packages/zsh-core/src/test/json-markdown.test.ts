import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cached } from "@carlwr/typescript-extra"
import { describe, expect, test } from "vitest"
import { recordsFile } from "../docs/json-artifacts"
import { type DocCategory, docCategories } from "../docs/taxonomy"

/**
 * Smoke test: every emitted corpus JSON record carries an `_mdBody` string —
 * non-empty except for the records without prose (the desc-less reserved
 * words, documented as complex commands). Rendered-markdown embedding is the
 * seam between TS (renderer) and the out-of-process Rust crate; this test
 * guards against accidental drift in the JSON-emit path.
 *
 * Every category has a renderer; this checks the generated record file over
 * the canonical category list so new categories join the guard automatically.
 */

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const jsonDir = join(pkgDir, "artifacts", "json")

const allRecs = cached(
  () =>
    JSON.parse(readFileSync(join(jsonDir, recordsFile), "utf8")) as Record<
      DocCategory,
      unknown[]
    >,
)
const loadRecs = <T>(cat: DocCategory): T[] => allRecs()[cat] as T[]

describe.runIf(existsSync(jsonDir))(
  "emitted JSON records carry rendered markdown body",
  () => {
    interface MdRec {
      readonly id: string
      readonly _mdBody: string
      readonly _title: string
      readonly desc?: string
    }

    test.each(docCategories)("%s records have an _mdBody string", cat => {
      const recs = loadRecs<MdRec>(cat)
      expect(recs.length).toBeGreaterThan(0)
      const proseless = (r: MdRec) =>
        cat === "reserved_word" && r.desc === undefined
      for (const r of recs) {
        expect(typeof r._mdBody).toBe("string")
        if (!proseless(r)) expect(r._mdBody.length).toBeGreaterThan(0)
        // The title travels as its own field, split out of `_mdBody`.
        expect(typeof r._title).toBe("string")
        expect(r._title.length).toBeGreaterThan(0)
      }
    })

    test.each([
      ["option", "autocd", 100, ["AUTO_CD"], ["setopt"]],
      ["builtin", "echo", 50, ["echo"], ["echo"]],
    ] as const)(
      "%s:%s splits title from body",
      (cat, id, minLen, titleParts, bodyParts) => {
        const rec = loadRecs<MdRec>(cat).find(r => r.id === id)
        expect(rec).toBeDefined()
        const md = rec?._mdBody ?? ""
        const title = rec?._title ?? ""
        expect(md.length).toBeGreaterThan(minLen)
        // Title text (e.g. the option name) now lives in `_title`, not `_mdBody`.
        for (const p of titleParts) expect(title).toContain(p)
        for (const p of bodyParts) expect(md).toContain(p)
      },
    )
  },
)
