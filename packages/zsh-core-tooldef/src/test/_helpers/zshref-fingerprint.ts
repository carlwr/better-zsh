import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
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
    const [kind, arg] = line.split(/\s+/)
    if (kind === "file") {
      const rel = needArg(kind, arg)
      entries.push({ label: rel, path: join(crateRoot, rel) })
    } else if (kind === "rust-src") {
      const rel = needArg(kind, arg)
      collectRustSrc(entries, join(crateRoot, rel), rel)
    } else if (kind === "json-data") {
      collectJsonDir(entries, join(repoRoot, "packages/zsh-core/dist/json"))
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

function collectRustSrc(entries: HashEntry[], dir: string, labelDir: string) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name)
    const label = `${labelDir}/${ent.name}`
    if (ent.isDirectory()) {
      collectRustSrc(entries, path, label)
    } else if (ent.isFile() && ent.name.endsWith(".rs")) {
      entries.push({ label, path })
    }
  }
}

function collectJsonDir(entries: HashEntry[], dir: string) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(".json")) {
      entries.push({ label: `json/${ent.name}`, path: join(dir, ent.name) })
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
