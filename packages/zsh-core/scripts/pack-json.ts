import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv, { type AnySchema } from "ajv"
import {
  hashRecordFiles,
  jsonDataFiles,
  schemaFile,
} from "../src/docs/json-artifacts.ts"
import { PKG_VERSION } from "../src/meta/pkg-info.ts"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactsDir = join(rootDir, "artifacts")
// Scratch, not a build output: `artifacts/` holds what consumers read, and a
// tarball recorded as a build product would make its absence read as stale.
const outDir = join(rootDir, ".aux", "release")
const tarball = "zsh-core-json.tar.gz"

/**
 * The asset name is deliberately version-free — the release tag in the download
 * URL carries the version; this keeps an unpacked copy from losing it.
 */
const stem = `zsh-core-json-${PKG_VERSION}`

const read = (path: string) => readFileSync(path, "utf8")
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(read(path))
const jsonNames = (dir: string) =>
  readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()

function stage(into: string) {
  const root = join(into, stem)
  mkdirSync(root, { recursive: true })
  cpSync(join(artifactsDir, "json"), join(root, "json"), { recursive: true })
  cpSync(join(artifactsDir, "schema"), join(root, "schema"), {
    recursive: true,
  })
  cpSync(join(rootDir, "LICENSE"), join(root, "LICENSE"))
  // The corpus is a derived work of the vendored zsh docs, so a standalone
  // tarball has to carry the notice that holds the upstream licence text —
  // not the package-root pointer file of the same name.
  cpSync(
    join(rootDir, "src", "data", "zsh-docs", "THIRD_PARTY_NOTICES.md"),
    join(root, "THIRD_PARTY_NOTICES.md"),
  )
  return root
}

/**
 * The tarball is self-describing, so it is checked as a consumer sees it —
 * unpacked, with nothing from the build tree in scope.
 */
function verify(root: string) {
  const problems: string[] = []
  const fail = (msg: string) => problems.push(msg)

  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    if (!read(join(root, name)).trim()) fail(`${name} is empty`)
  }

  const dataFiles = jsonNames(join(root, "json")).filter(
    name => name !== "index.json",
  )
  if (dataFiles.join() !== [...jsonDataFiles].sort().join()) {
    fail(`packed record files ${dataFiles.join(", ")} != jsonDataFiles`)
  }

  const index = readJson(join(root, "json", "index.json"))
  if (index.packageVersion !== PKG_VERSION) {
    fail(
      `index.packageVersion ${String(index.packageVersion)} != ${PKG_VERSION}`,
    )
  }
  if ((index.files as string[]).join() !== dataFiles.join()) {
    fail("index.files does not match the packed record files")
  }

  const texts = new Map(
    dataFiles.map(name => [name, read(join(root, "json", name))]),
  )
  if (index.dataHash !== hashRecordFiles(texts)) {
    fail("index.dataHash does not match the packed record bytes")
  }

  const ajv = new Ajv({ allErrors: true, strict: true })
  for (const name of ["index.json", ...dataFiles]) {
    const validate = ajv.compile(
      readJson(join(root, "schema", schemaFile(name))) as AnySchema,
    )
    if (!validate(readJson(join(root, "json", name)))) {
      fail(`${name}: ${ajv.errorsText(validate.errors)}`)
    }
  }

  if (problems.length) {
    throw new Error(
      `packed JSON artifacts are invalid:\n- ${problems.join("\n- ")}`,
    )
  }
}

const tmp = mkdtempSync(join(tmpdir(), "zsh-core-json-"))
try {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  stage(tmp)
  execFileSync("tar", ["-czf", join(outDir, tarball), "-C", tmp, stem])

  const unpacked = mkdtempSync(join(tmpdir(), "zsh-core-json-verify-"))
  try {
    execFileSync("tar", ["-xzf", join(outDir, tarball), "-C", unpacked])
    verify(join(unpacked, stem))
  } finally {
    rmSync(unpacked, { recursive: true, force: true })
  }

  const digest = createHash("sha256")
    .update(readFileSync(join(outDir, tarball)))
    .digest("hex")
  writeFileSync(join(outDir, `${tarball}.sha256`), `${digest}  ${tarball}\n`)

  process.stdout.write(`zsh-core pack:json: OK (${stem})\n`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
