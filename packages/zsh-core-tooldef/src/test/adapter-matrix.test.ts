import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  carlwrBraceImports,
  carlwrFromSpecifiers,
  THIN_TOOLDEF_PKG,
  THIN_ZSH_CORE_PKG,
  thinAdapters,
} from "./adapter-matrix.ts"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..", "..", "..")

describe("thin adapter import matrix", () => {
  for (const a of thinAdapters) {
    describe(a.id, () => {
      const pathAbs = join(repoRoot, a.file)
      const src = readFileSync(pathAbs, "utf8")

      test("every @carlwr specifier is exactly the root packages (no subpaths)", () => {
        const allowed = [THIN_ZSH_CORE_PKG, THIN_TOOLDEF_PKG]
        for (const spec of carlwrFromSpecifiers(src)) {
          expect(allowed, a.file).toContain(spec)
        }
      })

      test("named imports from @carlwr packages match the declared allow-list", () => {
        for (const row of carlwrBraceImports(src)) {
          const { module: mod, names } = row
          if (mod === THIN_ZSH_CORE_PKG) {
            for (const n of names) {
              expect(
                a.zshCoreSymbols.has(n),
                `${a.file}: zsh-core symbol ${n} not allowed for ${a.id}`,
              ).toBe(true)
            }
          } else if (mod === THIN_TOOLDEF_PKG) {
            for (const n of names) {
              expect(
                a.tooldefSymbols.has(n),
                `${a.file}: tooldef symbol ${n} not allowed for ${a.id}`,
              ).toBe(true)
            }
          } else {
            throw new Error(
              `${a.file}: unexpected @carlwr brace-import module ${mod}`,
            )
          }
        }
      })

      test("@carlwr imports are named brace imports only (sets match)", () => {
        const fromSpecs = new Set(carlwrFromSpecifiers(src))
        const braceMods = new Set(carlwrBraceImports(src).map(r => r.module))
        expect([...fromSpecs].sort()).toEqual([...braceMods].sort())
      })
    })
  }
})
