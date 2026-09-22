import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, test } from "vitest"

// `src/analysis/` is a self-contained user-code scanner: editor-neutral and
// corpus-free, so a second host (an LSP, another editor) could lift it out
// as a unit. The two corpus-pinned vocabularies (`precmd-names.ts`,
// `KEYWORD_HEADS`) are the extension's mirrors of the corpus, held equal by
// the lock-in tests beside this file — the modules themselves never load it.
const DIR = resolve(__dirname, "..", "..", "analysis")

const IMPORT_SPEC = /(?:\bfrom|^import)\s+["']([^"']+)["']/gm

const files = readdirSync(DIR)
  .filter(f => f.endsWith(".ts"))
  .sort()

const specsOf = (file: string): string[] =>
  [...readFileSync(join(DIR, file), "utf8").matchAll(IMPORT_SPEC)].map(
    m => m[1] ?? "",
  )

describe("analysis seam", () => {
  test("covers the directory", () => {
    expect(files).toContain("facts.ts")
    expect(files).toContain("precmd-names.ts")
  })

  test("imports stay inside src/analysis/", () => {
    const outside = files.flatMap(f =>
      specsOf(f)
        .filter(spec => !spec.startsWith("./"))
        .map(spec => `${f}: ${spec}`),
    )
    expect(outside).toEqual([])
  })
})
