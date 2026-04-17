import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv, { type AnySchema } from "ajv"
import { jsonFiles, schemaFile } from "../src/docs/json-artifacts.ts"

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-pack-"))

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function validateJson() {
  const ajv = new Ajv({ allErrors: true, strict: true })
  for (const file of jsonFiles) {
    const schema = readJson<AnySchema>(
      join(pkgDir, "dist", "schema", schemaFile(file)),
    )
    const data = readJson<unknown>(join(pkgDir, "dist", "json", file))
    const validate = ajv.compile(schema)
    if (validate(data)) continue
    throw new Error(
      `${file} failed schema validation: ${ajv.errorsText(validate.errors, { separator: "\n" })}`,
    )
  }
}

try {
  validateJson()

  const out = execFileSync(
    pnpm,
    ["pack", "--json", "--pack-destination", tmp],
    { cwd: pkgDir, encoding: "utf8" },
  )
  const { filename } = JSON.parse(out)
  const paths = execFileSync("tar", ["-tzf", resolve(tmp, filename)], {
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
    "dist/assets.d.ts",
    "dist/assets.js",
    "dist/assets.js.map",
    "dist/assets.mjs",
    "dist/assets.mjs.map",
    "dist/api/assets.api.json",
    "dist/api/exec.api.json",
    "dist/api/index.api.json",
    "dist/api/render.api.json",
    "dist/exec.d.ts",
    "dist/exec.js",
    "dist/exec.js.map",
    "dist/exec.mjs",
    "dist/exec.mjs.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/index.mjs",
    "dist/index.mjs.map",
    ...jsonFiles.map(file => `dist/json/${file}`),
    ...jsonFiles.map(file => `dist/schema/${schemaFile(file)}`),
    "dist/render.d.ts",
    "dist/render.js",
    "dist/render.js.map",
    "dist/render.mjs",
    "dist/render.mjs.map",
    "dist/types/assets.d.ts",
    "dist/types/exec.d.ts",
    "dist/types/index.d.ts",
    "dist/types/render.d.ts",
    "dist/data/zsh-docs/SOURCE.md",
    "dist/data/zsh-docs/THIRD_PARTY_NOTICES.md",
    "dist/data/zsh-docs/builtins.yo",
    "dist/data/zsh-docs/cond.yo",
    "dist/data/zsh-docs/expn.yo",
    "dist/data/zsh-docs/grammar.yo",
    "dist/data/zsh-docs/options.yo",
    "dist/data/zsh-docs/params.yo",
    "dist/data/zsh-docs/prompt.yo",
    "dist/data/zsh-docs/redirect.yo",
    "dist/data/zsh-docs/zle.yo",
  ]

  const forbidden = [
    [/^src\//, "source file"],
    [/^scripts\//, "script file"],
    [/^(?:assets|build|index)\.ts$/, "top-level TypeScript source"],
    [/\.test\./, "test artifact"],
    [/^dist\/docs\//, "docs-site artifact"],
    [/^node_modules\//, "node_modules content"],
  ] as const

  const missing = required.filter(file => !paths.includes(file))
  const hits = forbidden.flatMap(([pat, desc]) =>
    paths.filter(file => pat.test(file)).map(file => ({ desc, file })),
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
