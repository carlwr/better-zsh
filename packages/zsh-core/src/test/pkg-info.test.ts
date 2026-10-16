import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { escapeRegExp } from "@carlwr/typescript-extra"
import { describe, expect, test } from "vitest"
import { publicEntries } from "../../scripts/pkg-entries.ts"
import { PKG_VERSION } from "../meta/pkg-info.ts"
import { ZSH_UPSTREAM } from "../meta/zsh-upstream.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const readJson = (file: string) =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))
const readText = (file: string) => readFileSync(join(pkgDir, file), "utf8")

const pkg = readJson("package.json")
const typedoc = readJson("typedoc.json")
const tsconfigBuild = readJson("tsconfig.build.json")

// Public surface, derived from the npm manifest: a new subpath cannot
// silently skip the docs build or the build tsconfig.
const entryModules = publicEntries(pkgDir)
  .map(name => `./${name}.ts`)
  .sort()

test("PKG_VERSION matches package.json", () => {
  expect(PKG_VERSION).toBe(pkg.version)
})

test("repo-derived manifest URLs follow repository.url", () => {
  const repoUrl: string = pkg.repository.url
  expect(pkg.homepage).toMatch(new RegExp(`^${escapeRegExp(repoUrl)}/`))
  expect(pkg.bugs).toBe(`${repoUrl}/issues`)
})

describe("public-surface entries stay in sync", () => {
  test("typedoc entryPoints are exactly the public entry modules", () => {
    expect([...typedoc.entryPoints].sort()).toEqual(entryModules)
  })
  // Hand-listed and read by tsc, so nothing can derive it and a missing entry
  // fails silently: the module is simply never built.
  test("tsconfig.build.json include lists every public entry module", () => {
    const bare = entryModules.map(mod => mod.replace(/^\.\//, ""))
    expect(bare.filter(mod => !tsconfigBuild.include.includes(mod))).toEqual([])
  })
})

describe("ZSH_UPSTREAM stays in sync with vendored markdown", () => {
  // The vendored docs carry the tag/commit/date in two places: a plain
  // `Key: value` block (SOURCE.md) and a `- Key: \`value\`` bullet list
  // (THIRD_PARTY_NOTICES.md). This pattern matches both.
  const pick = (text: string, key: string): string | undefined =>
    text
      .match(new RegExp(`${escapeRegExp(key)}:\\s*\`?([^\`\\n]+)\`?`))?.[1]
      ?.trim()

  const source = readText("src/data/zsh-docs/SOURCE.md")
  const notices = readText("src/data/zsh-docs/THIRD_PARTY_NOTICES.md")

  // SOURCE.md uses Tag/Commit/Date; THIRD_PARTY_NOTICES.md uses "Vendored <lc>".
  const sourceKey = { tag: "Tag", commit: "Commit", date: "Date" } as const

  test.each(Object.keys(sourceKey) as (keyof typeof sourceKey)[])(
    "ZSH_UPSTREAM.%s matches SOURCE.md and THIRD_PARTY_NOTICES.md",
    field => {
      const key = sourceKey[field]
      expect(pick(source, key)).toBe(ZSH_UPSTREAM[field])
      expect(pick(notices, `Vendored ${field}`)).toBe(ZSH_UPSTREAM[field])
    },
  )
})
