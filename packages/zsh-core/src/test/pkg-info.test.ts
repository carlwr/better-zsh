import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { escapeRegExp } from "@carlwr/typescript-extra"
import { describe, expect, test } from "vitest"
import {
  PKG_LICENSE,
  PKG_NAME,
  PKG_NAME_JSR,
  PKG_REPO_URL,
  PKG_VERSION,
} from "../meta/pkg-info.ts"
import { ZSH_UPSTREAM } from "../meta/zsh-upstream.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const readJson = (file: string) =>
  JSON.parse(readFileSync(join(pkgDir, file), "utf8"))
const readText = (file: string) => readFileSync(join(pkgDir, file), "utf8")

const pkg = readJson("package.json")
const deno = readJson("deno.json")
const typedoc = readJson("typedoc.json")
const tsconfigBuild = readJson("tsconfig.build.json")

// Shared surface: every non-glob `exports` subpath. Derived from the npm
// manifest rather than restated, so a new subpath cannot silently skip the
// JSR manifest, the docs build, or the build tsconfig. `./data/*`,
// `./schema/*` and `./package.json` are npm-only.
const sharedExports: string[] = Object.keys(pkg.exports)
  .filter(sub => !sub.includes("*") && sub !== "./package.json")
  .sort()

// Package-root facade behind each shared subpath, e.g. "./render.ts" — the
// layout rule `scripts/build/module-layout.test.mjs` enforces repo-wide.
const entryModules: string[] = sharedExports
  .map(sub => (sub === "." ? "./index.ts" : `${sub}.ts`))
  .sort()

describe("pkg-info constants stay in sync with manifests", () => {
  test.each([
    ["PKG_NAME", PKG_NAME, pkg.name],
    ["PKG_NAME_JSR", PKG_NAME_JSR, deno.name],
    ["PKG_VERSION (npm)", PKG_VERSION, pkg.version],
    ["PKG_VERSION (jsr)", PKG_VERSION, deno.version],
    ["PKG_REPO_URL", PKG_REPO_URL, pkg.repository?.url],
    ["PKG_LICENSE (npm)", PKG_LICENSE, pkg.license],
    ["PKG_LICENSE (jsr)", PKG_LICENSE, deno.license],
  ])("%s matches manifest", (_label, constant, manifest) => {
    expect(constant).toBe(manifest)
  })
})

describe("shared-surface exports stay in sync", () => {
  test("deno.json.exports is exactly the shared subpaths", () => {
    expect(Object.keys(deno.exports).sort()).toEqual(sharedExports)
  })
  test("typedoc entryPoints are exactly the shared entry modules", () => {
    expect([...typedoc.entryPoints].sort()).toEqual(entryModules)
  })
  // Hand-listed and read by tsc, so nothing can derive it and a missing entry
  // fails silently: the module is simply never built.
  test.each([
    ["tsconfig.build.json include", tsconfigBuild.include],
    ["deno.json publish.include", deno.publish.include],
    ["deno.json lint.include", deno.lint.include],
  ])("%s lists every shared entry module", (_label, listed) => {
    const bare = entryModules.map(mod => mod.replace(/^\.\//, ""))
    expect(bare.filter(mod => !listed.includes(mod))).toEqual([])
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
