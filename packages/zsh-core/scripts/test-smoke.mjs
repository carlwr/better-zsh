import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-pack-"))

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
    .map((file) => file.replace(/^package\//, ""))
    .filter(Boolean)

  const required = [
    "LICENSE",
    "package.json",
    "dist/assets.d.ts",
    "dist/assets.js",
    "dist/assets.js.map",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/index.js.map",
    "dist/data/zsh-docs/SOURCE.md",
    "dist/data/zsh-docs/builtins.yo",
    "dist/data/zsh-docs/cond.yo",
    "dist/data/zsh-docs/grammar.yo",
    "dist/data/zsh-docs/options.yo",
  ]

  const forbidden = [
    [/^src\//, "source file"],
    [/^scripts\//, "script file"],
    [/^(?:assets|build|index)\.ts$/, "top-level TypeScript source"],
    [/\.test\./, "test artifact"],
    [/^node_modules\//, "node_modules content"],
  ]

  const missing = required.filter((file) => !paths.includes(file))
  const hits = forbidden.flatMap(([pat, desc]) =>
    paths.filter((file) => pat.test(file)).map((file) => ({ desc, file })),
  )

  if (missing.length > 0 || hits.length > 0) {
    const parts = []
    if (missing.length > 0) {
      parts.push(`missing required files:\n- ${missing.join("\n- ")}`)
    }
    if (hits.length > 0) {
      parts.push(
        `found forbidden files:\n- ${hits.map(({ file, desc }) => `${file} (${desc})`).join("\n- ")}`,
      )
    }
    throw new Error(parts.join("\n\n"))
  }

  process.stdout.write("zsh-core smoke: OK\n")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
