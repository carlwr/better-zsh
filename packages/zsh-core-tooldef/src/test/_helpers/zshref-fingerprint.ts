/**
 * Recomputes the `zshref` binary's embedded build-input fingerprint so
 * `parity.test.ts` can tell a stale binary from a fresh one. The hash
 * algorithm is a hand mirror of the crate's; divergence reads as a permanent
 * "binary stale" verdict, which `BZ_REQUIRE_PARITY=1` turns into a failure.
 *
 * The tooldef entry hashes source, not the built JSON artifact — an unbuilt
 * artifact tree must read as stale, not fresh.
 */

import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fmtToolDefsJson } from "../../export-json.ts"
import { TOOL_SUITE_PREAMBLE, toolDefs } from "../../tool-defs.ts"

interface HashEntry {
  readonly label: string
  readonly path?: string
  readonly bytes?: Buffer
}

export interface ZshrefFingerprint {
  readonly ok: boolean
  readonly current?: string
  readonly embedded?: string
  readonly banner?: string
}

export function currentZshrefBuildInputHash(repoRoot: string): string {
  const crateRoot = join(repoRoot, "zshref-rs")
  const manifest = join(crateRoot, "build-inputs.txt")
  const entries: HashEntry[] = []
  for (const raw of readFileSync(manifest, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const [kind, arg, ...exts] = line.split(/\s+/)
    if (kind === "file") {
      const rel = needArg(kind, arg)
      entries.push({ label: rel, path: join(crateRoot, rel) })
    } else if (kind === "src-tree") {
      const rel = needArg(kind, arg)
      if (!exts.length)
        throw new Error("zshref build input src-tree entry needs extensions")
      collectSrcTree(entries, join(crateRoot, rel), rel, exts)
    } else if (kind === "json-data") {
      collectJsonDir(
        entries,
        join(repoRoot, "packages/zsh-core/artifacts/json"),
      )
      entries.push({
        label: "json/tooldef.json",
        bytes: Buffer.from(fmtToolDefsJson(toolDefs, TOOL_SUITE_PREAMBLE)),
      })
    } else {
      throw new Error(`unknown zshref build input kind: ${kind}`)
    }
  }
  return hashEntries(entries)
}

function needArg(kind: string, arg: string | undefined): string {
  if (!arg) throw new Error(`zshref build input ${kind} entry needs path`)
  return arg
}

export function compareZshrefFingerprint(
  repoRoot: string,
  info: unknown,
): ZshrefFingerprint {
  const current = currentZshrefBuildInputHash(repoRoot)
  const embedded =
    info && typeof info === "object"
      ? (info as Record<string, unknown>).buildInputHash
      : undefined
  if (typeof embedded !== "string") {
    return {
      ok: false,
      current,
      banner: "zshref info did not report buildInputHash — run `make cli`",
    }
  }
  if (embedded !== current) {
    return {
      ok: false,
      current,
      embedded,
      banner: `zshref binary stale — run \`make cli\` (expected ${current.slice(0, 12)}, got ${embedded.slice(0, 12)})`,
    }
  }
  return { ok: true, current, embedded }
}

function hasExt(name: string, exts: readonly string[]): boolean {
  return exts.some(ext => name.endsWith(`.${ext}`))
}

/**
 * `statSync`, not the `readdirSync` Dirent: Dirent kinds are lstat-flavoured
 * and would skip symlinks, while the crate's `is_dir`/`read` follow them — as
 * `include_str!` does. A dangling link falls through to the extension test and
 * is reported by `hashEntries` as a missing input, matching the crate's IO error.
 */
function collectSrcTree(
  entries: HashEntry[],
  dir: string,
  labelDir: string,
  exts: readonly string[],
) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const label = `${labelDir}/${name}`
    if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
      collectSrcTree(entries, path, label, exts)
    } else if (hasExt(name, exts)) {
      entries.push({ label, path })
    }
  }
}

function collectJsonDir(entries: HashEntry[], dir: string) {
  for (const name of readdirSync(dir)) {
    if (hasExt(name, ["json"])) {
      entries.push({ label: `json/${name}`, path: join(dir, name) })
    }
  }
}

function hashEntries(entries: readonly HashEntry[]): string {
  const h = createHash("sha256")
  for (const e of [...entries].sort((a, b) =>
    a.label < b.label ? -1 : a.label > b.label ? 1 : 0,
  )) {
    if (e.bytes) {
      hashEntry(h, e.label, e.bytes)
      continue
    }
    if (!e.path || !existsSync(e.path)) {
      throw new Error(`missing zshref build input ${e.label}: ${e.path}`)
    }
    hashEntry(h, e.label, readFileSync(e.path))
  }
  return h.digest("hex")
}

function hashEntry(
  h: ReturnType<typeof createHash>,
  label: string,
  bytes: Buffer,
) {
  h.update(label)
  h.update("\0")
  h.update(String(bytes.length))
  h.update("\0")
  h.update(bytes)
  h.update("\0")
}
