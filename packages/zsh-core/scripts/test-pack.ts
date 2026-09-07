import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { escapeRegExp } from "@carlwr/typescript-extra"
import Ajv, { type AnySchema } from "ajv"
import { jsonFiles, schemaFile } from "../src/docs/json-artifacts.ts"
import { corpusYodlFiles } from "../src/docs/source-files.ts"

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const tmp = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-pack-"))

const pkgJson = JSON.parse(
  readFileSync(join(pkgDir, "package.json"), "utf8"),
) as { exports: Record<string, unknown> }

/**
 * Entry name behind every non-glob `exports` subpath, read from the manifest
 * rather than restated, so a new subpath cannot be added without the pack
 * assertions following it. `.` -> `index`, `./foo` -> `foo` is the package-root
 * facade rule `scripts/build/module-layout.test.mjs` enforces repo-wide. Glob
 * subpaths (`./data/*.json`, `./schema/*.json`) carry no entry and are covered
 * by the `jsonFiles` assertions instead.
 */
const publicEntries = Object.keys(pkgJson.exports)
  .filter(sub => !sub.includes("*") && sub !== "./package.json")
  .map(sub => (sub === "." ? "index" : sub.slice(2)))
  .sort()
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
  const packed = new Set(paths)

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
      new RegExp(
        `^(?:${[...publicEntries, "build"].map(escapeRegExp).join("|")})\\.ts$`,
      ),
      "top-level TypeScript source",
    ],
    [/\.test\./, "test artifact"],
    [/^dist\/docs\//, "docs-site artifact"],
    [/^node_modules\//, "node_modules content"],
  ] as const

  const missing = required.filter(file => !packed.has(file))
  const hits = forbidden.flatMap(([pat, desc]) =>
    paths.filter(file => pat.test(file)).map(file => ({ desc, file })),
  )

  // Published-shape: every path the package.json points at (main, types,
  // exports subpaths) must resolve to a file actually in the tarball. This
  // catches the class of bug where `tsc` builds and `vitest` passes but a
  // published consumer gets `MODULE_NOT_FOUND` -- e.g. an `exports` subpath
  // added without a matching API Extractor entry, so its `types` rollup is
  // never generated. Glob subpaths carry no single path to resolve.
  const packedPkg = JSON.parse(
    execFileSync(
      "tar",
      ["-xzOf", resolve(tmp, filename), "package/package.json"],
      {
        encoding: "utf8",
      },
    ),
  ) as {
    main?: string
    types?: string
    engines?: { node?: string }
    exports?: Record<string, unknown>
  }
  const refIssues: string[] = []
  const claim = (label: string, ref: unknown): void => {
    if (typeof ref !== "string") return
    if (!packed.has(ref.replace(/^\.\//, ""))) {
      refIssues.push(`${label} -> ${ref} (not in tarball)`)
    }
  }
  claim("main", packedPkg.main)
  claim("types", packedPkg.types)
  for (const [sub, entry] of Object.entries(packedPkg.exports ?? {})) {
    if (sub === "./package.json" || sub.includes("*")) continue
    if (typeof entry === "string") {
      claim(`exports["${sub}"]`, entry)
      continue
    }
    for (const [cond, path] of Object.entries(
      (entry ?? {}) as Record<string, unknown>,
    )) {
      claim(`exports["${sub}"].${cond}`, path)
    }
  }

  const engineIssues: string[] = []
  if (typeof packedPkg.engines?.node !== "string") {
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

  process.stdout.write("zsh-core pack: OK\n")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
