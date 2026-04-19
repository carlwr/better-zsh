import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  PKG_LICENSE,
  PKG_NAME,
  PKG_NAME_JSR,
  PKG_REPO_URL,
  PKG_VERSION,
} from "../pkg-info.ts"
import { ZSH_UPSTREAM } from "../zsh-upstream.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const readJson = (file: string) =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))
const readText = (file: string) => readFileSync(join(pkgDir, file), "utf8")

const pkg = readJson("package.json")
const deno = readJson("deno.json")

// Shared-surface subpaths: must appear in both manifests.
// `./data/*`, `./schema/*`, `./internal`, `./package.json` are npm-only.
const SHARED_EXPORTS = [".", "./render", "./exec", "./assets"] as const

describe("pkg-info constants stay in sync with manifests", () => {
  test("PKG_NAME matches package.json.name", () => {
    expect(PKG_NAME).toBe(pkg.name)
  })
  test("PKG_NAME_JSR matches deno.json.name", () => {
    expect(PKG_NAME_JSR).toBe(deno.name)
  })
  test("PKG_VERSION matches package.json.version and deno.json.version", () => {
    expect(PKG_VERSION).toBe(pkg.version)
    expect(PKG_VERSION).toBe(deno.version)
  })
  test("PKG_REPO_URL matches package.json.repository.url", () => {
    expect(PKG_REPO_URL).toBe(pkg.repository?.url)
  })
  test("PKG_LICENSE matches package.json.license and deno.json.license", () => {
    expect(PKG_LICENSE).toBe(pkg.license)
    expect(PKG_LICENSE).toBe(deno.license)
  })
})

describe("shared-surface exports stay in sync", () => {
  test("every shared subpath appears in package.json.exports", () => {
    for (const key of SHARED_EXPORTS) {
      expect(Object.keys(pkg.exports)).toContain(key)
    }
  })
  test("deno.json.exports is exactly the shared subpaths", () => {
    expect(Object.keys(deno.exports).sort()).toEqual([...SHARED_EXPORTS].sort())
  })
})

describe("ZSH_UPSTREAM stays in sync with vendored markdown", () => {
  // The vendored docs carry the tag/commit/date in two places: a plain
  // `Key: value` block (SOURCE.md) and a `- Key: \`value\`` bullet list
  // (THIRD_PARTY_NOTICES.md). This pattern matches both.
  const pick = (text: string, key: string): string | undefined =>
    text.match(new RegExp(`${key}:\\s*\`?([^\`\\n]+)\`?`))?.[1]?.trim()

  const source = readText("src/data/zsh-docs/SOURCE.md")
  const notices = readText("src/data/zsh-docs/THIRD_PARTY_NOTICES.md")

  test.each([
    "tag",
    "commit",
    "date",
  ] as const)("ZSH_UPSTREAM.%s matches SOURCE.md and THIRD_PARTY_NOTICES.md", field => {
    const key = field === "tag" ? "Tag" : field === "commit" ? "Commit" : "Date"
    // THIRD_PARTY_NOTICES.md uses "Vendored tag/commit/date"
    const notKey = `Vendored ${key.toLowerCase()}`
    expect(pick(source, key)).toBe(ZSH_UPSTREAM[field])
    expect(pick(notices, notKey)).toBe(ZSH_UPSTREAM[field])
  })
})
