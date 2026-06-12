import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv, { type AnySchema } from "ajv"
import { jsonFiles, schemaFile } from "../src/docs/json-artifacts.ts"
import { corpusYodlFiles } from "../src/docs/source-files.ts"

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-pack-"))

const publicEntries = [
  "analysis",
  "assets",
  "index",
  "meta",
  "render",
  "resolver",
  "taxonomy",
  "types",
] as const
const vendoredDocs = [
  "SOURCE.md",
  "THIRD_PARTY_NOTICES.md",
  ...corpusYodlFiles,
] as const

function bundleFiles(entry: string): readonly string[] {
  return [
    `dist/${entry}.d.ts`,
    `dist/${entry}.js`,
    `dist/${entry}.js.map`,
    `dist/${entry}.mjs`,
    `dist/${entry}.mjs.map`,
  ]
}

function apiFile(entry: string): string {
  return `dist/api/${entry}.api.json`
}

function apiTypesFile(entry: string): string {
  return `dist/types/${entry}.d.ts`
}

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
    ...publicEntries.flatMap(bundleFiles),
    ...publicEntries.map(apiFile),
    ...jsonFiles.map(file => `dist/json/${file}`),
    ...jsonFiles.map(file => `dist/schema/${schemaFile(file)}`),
    ...publicEntries.map(apiTypesFile),
    ...vendoredDocs.map(file => `dist/data/zsh-docs/${file}`),
  ]

  const forbidden = [
    [/^src\//, "source file"],
    [/^scripts\//, "script file"],
    [
      /^(?:analysis|assets|build|index|meta|render|resolver|taxonomy|types)\.ts$/,
      "top-level TypeScript source",
    ],
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
