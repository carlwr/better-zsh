import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const packagesDir = join(repoRoot, "packages")

function indexTsUnderSrc(srcDir) {
  const out = []
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === "index.ts") out.push(p)
    }
  }
  walk(srcDir)
  return out
}

test("no src/**/index.ts barrels under packages", () => {
  const hits = []
  for (const pkg of readdirSync(packagesDir)) {
    const src = join(packagesDir, pkg, "src")
    if (existsSync(src)) hits.push(...indexTsUnderSrc(src))
  }
  assert.deepEqual(
    hits,
    [],
    `disallowed barrels:\n${hits.map(h => h.slice(repoRoot.length + 1)).join("\n")}`,
  )
})

test("package.json exports map to package-root facades", () => {
  for (const pkg of readdirSync(packagesDir)) {
    const pkgRoot = join(packagesDir, pkg)
    const pkgJsonPath = join(pkgRoot, "package.json")
    if (!existsSync(pkgJsonPath)) continue
    const { exports: exp } = JSON.parse(readFileSync(pkgJsonPath, "utf8"))
    if (!exp || typeof exp !== "object") continue
    for (const key of Object.keys(exp)) {
      if (key === "./package.json") continue
      if (key.includes("*")) continue
      const base = key === "." ? "index" : key.slice(2)
      const facade = join(pkgRoot, `${base}.ts`)
      assert.ok(
        existsSync(facade),
        `export ${key} in packages/${pkg}/package.json → missing ${facade}`,
      )
    }
  }
})
