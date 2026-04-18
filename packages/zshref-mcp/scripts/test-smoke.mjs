import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "better-zshref-mcp-pack-"))

try {
  const out = execFileSync(
    pnpm,
    ["pack", "--json", "--pack-destination", tmp],
    { encoding: "utf8" },
  )
  const { filename } = JSON.parse(out)
  const paths = execFileSync("tar", ["-tzf", filename], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map(file => file.replace(/^package\//, ""))
    .filter(Boolean)

  const required = [
    "LICENSE",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    "deno.json",
    "dist/index.js",
    "dist/index.js.map",
    "dist/index.mjs",
    "dist/index.mjs.map",
    "dist/server.js",
    "dist/server.js.map",
    "dist/server.mjs",
    "dist/server.mjs.map",
    "dist/server.d.ts",
    "dist/api/index.api.json",
    "dist/types/index.d.ts",
  ]

  const forbidden = [
    [/^src\//, "source file"],
    [/^scripts\//, "script file"],
    [/^(?:index|server|build)\.ts$/, "top-level TypeScript source"],
    [/\.test\./, "test artifact"],
    [/^node_modules\//, "node_modules content"],
    [/^DEVELOPMENT\.md$/, "contributor-only doc"],
    [/^EXTRACTION\.md$/, "contributor-only doc"],
  ]

  const missing = required.filter(file => !paths.includes(file))
  const hits = forbidden.flatMap(([pat, desc]) =>
    paths.filter(file => pat.test(file)).map(file => ({ desc, file })),
  )

  // Published-shape: every path the package.json points at (main, types,
  // bin, exports subpaths) must resolve to a file actually in the tarball.
  // This catches the class of bug where `tsc` builds and `vitest` passes
  // but a published consumer gets `MODULE_NOT_FOUND`.
  const pkgText = execFileSync(
    "tar",
    ["-xzOf", filename, "package/package.json"],
    {
      encoding: "utf8",
    },
  )
  const pkg = JSON.parse(pkgText)
  const set = new Set(paths)
  const refIssues = []
  const claim = (label, ref) => {
    if (typeof ref !== "string") return
    const norm = ref.replace(/^\.\//, "")
    if (!set.has(norm)) refIssues.push(`${label} → ${ref} (not in tarball)`)
  }
  claim("main", pkg.main)
  claim("types", pkg.types)
  for (const [binName, binPath] of Object.entries(pkg.bin ?? {})) {
    claim(`bin[${binName}]`, binPath)
  }
  for (const [sub, entry] of Object.entries(pkg.exports ?? {})) {
    if (sub === "./package.json") continue
    if (typeof entry === "string") {
      claim(`exports["${sub}"]`, entry)
      continue
    }
    for (const [cond, p] of Object.entries(entry ?? {})) {
      claim(`exports["${sub}"].${cond}`, p)
    }
  }

  const engineIssues = []
  if (typeof pkg.engines?.node !== "string") {
    engineIssues.push("engines.node missing (see README baseline)")
  }

  if (
    missing.length > 0 ||
    hits.length > 0 ||
    refIssues.length > 0 ||
    engineIssues.length > 0
  ) {
    const parts = []
    if (missing.length > 0) {
      parts.push(`missing required files:\n- ${missing.join("\n- ")}`)
    }
    if (hits.length > 0) {
      parts.push(
        `found forbidden files:\n- ${hits.map(({ file, desc }) => `${file} (${desc})`).join("\n- ")}`,
      )
    }
    if (refIssues.length > 0) {
      parts.push(
        `package.json references a path not in the tarball:\n- ${refIssues.join("\n- ")}`,
      )
    }
    if (engineIssues.length > 0) {
      parts.push(`package.json issues:\n- ${engineIssues.join("\n- ")}`)
    }
    throw new Error(parts.join("\n\n"))
  }

  process.stdout.write("zshref-mcp smoke: OK\n")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
