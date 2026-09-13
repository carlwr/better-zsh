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
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv, { type AnySchema } from "ajv"
import {
  hashRecordFiles,
  jsonDataFiles,
  resolverFixture,
  schemaFile,
} from "../src/docs/json-artifacts.ts"
import { PKG_VERSION } from "../src/meta/pkg-info.ts"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifactsDir = join(rootDir, "artifacts")
// Scratch, not a build output: `artifacts/` holds what consumers read, and a
// tarball recorded as a build product would make its absence read as stale.
const outDir = join(rootDir, ".aux", "release")

type Fail = (msg: string) => void

/**
 * One release asset: a tarball `zsh-core-<name>.tar.gz` unpacking to
 * `zsh-core-<name>-<version>/`. The asset name is deliberately version-free —
 * the release tag in the download URL carries the version; the unpacked dir
 * keeps it.
 */
interface Asset {
  readonly name: string
  readonly stage: (root: string) => void
  /**
   * Checks the unpacked tree as a consumer sees it — nothing from the build
   * tree in scope — and returns the corpus identity it carries.
   */
  readonly verify: (root: string, fail: Fail) => string
}

const baseOf = (asset: Asset) => `zsh-core-${asset.name}`
const stemOf = (asset: Asset) => `${baseOf(asset)}-${PKG_VERSION}`

const read = (path: string) => readFileSync(path, "utf8")
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(read(path))
const jsonNames = (dir: string) =>
  readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()

function validateWithSchema(json: string, schema: string, fail: Fail) {
  const ajv = new Ajv({ allErrors: true, strict: true })
  const validate = ajv.compile(readJson(schema) as AnySchema)
  if (!validate(readJson(json))) {
    fail(`${basename(json)}: ${ajv.errorsText(validate.errors)}`)
  }
}

const jsonAsset: Asset = {
  name: "json",
  stage(root) {
    cpSync(join(artifactsDir, "json"), join(root, "json"), { recursive: true })
    cpSync(join(artifactsDir, "schema"), join(root, "schema"), {
      recursive: true,
    })
  },
  verify(root, fail) {
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

    for (const name of ["index.json", ...dataFiles]) {
      validateWithSchema(
        join(root, "json", name),
        join(root, "schema", schemaFile(name)),
        fail,
      )
    }
    return String(index.dataHash)
  },
}

const fixtureAsset: Asset = {
  name: resolverFixture.dir,
  stage(root) {
    cpSync(join(artifactsDir, resolverFixture.dir), root, { recursive: true })
  },
  verify(root, fail) {
    const file = join(root, resolverFixture.file)
    validateWithSchema(file, schemaFile(file), fail)
    const fixture = readJson(file)
    if (fixture.packageVersion !== PKG_VERSION) {
      fail(
        `fixture.packageVersion ${String(fixture.packageVersion)} != ${PKG_VERSION}`,
      )
    }
    return String(fixture.dataHash)
  },
}

function stage(asset: Asset, into: string): string {
  const root = join(into, stemOf(asset))
  mkdirSync(root, { recursive: true })
  asset.stage(root)
  cpSync(join(rootDir, "LICENSE"), join(root, "LICENSE"))
  // Every asset derives from the vendored zsh docs, so a standalone tarball
  // has to carry the notice that holds the upstream licence text — not the
  // package-root pointer file of the same name.
  cpSync(
    join(rootDir, "src", "data", "zsh-docs", "THIRD_PARTY_NOTICES.md"),
    join(root, "THIRD_PARTY_NOTICES.md"),
  )
  return root
}

function verify(asset: Asset, root: string): string {
  const problems: string[] = []
  const fail: Fail = msg => problems.push(msg)

  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    if (!read(join(root, name)).trim()) fail(`${name} is empty`)
  }
  const dataHash = asset.verify(root, fail)

  if (problems.length) {
    throw new Error(
      `packed ${asset.name} asset is invalid:\n- ${problems.join("\n- ")}`,
    )
  }
  return dataHash
}

/** Stage → tar → unpack → verify → checksum; returns the verified corpus identity. */
function pack(asset: Asset): string {
  const tarball = join(outDir, `${baseOf(asset)}.tar.gz`)
  const tmp = mkdtempSync(join(tmpdir(), `${baseOf(asset)}-`))
  try {
    stage(asset, tmp)
    execFileSync("tar", ["-czf", tarball, "-C", tmp, stemOf(asset)])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  const unpacked = mkdtempSync(join(tmpdir(), `${baseOf(asset)}-verify-`))
  let dataHash: string
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", unpacked])
    dataHash = verify(asset, join(unpacked, stemOf(asset)))
  } finally {
    rmSync(unpacked, { recursive: true, force: true })
  }

  const digest = createHash("sha256")
    .update(readFileSync(tarball))
    .digest("hex")
  writeFileSync(`${tarball}.sha256`, `${digest}  ${basename(tarball)}\n`)
  return dataHash
}

const assets = [jsonAsset, fixtureAsset]

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const dataHashes = new Set(assets.map(pack))
if (dataHashes.size !== 1) {
  throw new Error("release assets disagree on dataHash — rebuild and repack")
}

process.stdout.write(
  `zsh-core pack:release: OK (${assets.map(stemOf).join(", ")})\n`,
)
