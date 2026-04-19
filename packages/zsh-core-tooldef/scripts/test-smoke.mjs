import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "zsh-core-tooldef-pack-"))

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
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    "deno.json",
    "dist/index.js",
    "dist/index.js.map",
    "dist/index.mjs",
    "dist/index.mjs.map",
    "dist/api/index.api.json",
    "dist/types/index.d.ts",
  ]

  const forbidden = [
    [/^src\//, "source file"],
    [/^scripts\//, "script file"],
    [/^(?:index|build)\.ts$/, "top-level TypeScript source"],
    [/\.test\./, "test artifact"],
    [/^node_modules\//, "node_modules content"],
  ]

  const missing = required.filter(file => !paths.includes(file))
  const hits = forbidden.flatMap(([pat, desc]) =>
    paths.filter(file => pat.test(file)).map(file => ({ desc, file })),
  )

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
    engineIssues.push("engines.node missing")
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

  process.stdout.write("zsh-core-tooldef smoke: OK\n")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
