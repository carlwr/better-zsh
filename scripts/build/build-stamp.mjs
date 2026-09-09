#!/usr/bin/env node

// Lets a caller decide whether a package's `dist/` still matches its sources,
// so a rebuild can be skipped and a "skip upstream" claim can be checked rather
// than believed.

import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { packageDirs, repoRoot, upstreamOf } from "./upstream-graph.mjs"

export const STAMP_REL = join(".aux", "build-stamp.json")

const generatedDirs = new Set(["node_modules", "dist", "out"])

// Exclusion, never enumeration: an input this misses would leave `dist/` stale
// with nothing to notice it, while a generated tree it misses costs only a
// spurious rebuild. Dot-directories are scratch and tool state throughout.
//
// Excluded by location, never by file type: prose extensions are vendored data
// here, so carving those out would skip the rebuild on a shipped-asset edit.
const generated = name => name.startsWith(".") || generatedDirs.has(name)

function filesUnder(dir, skip = () => false) {
  const out = []
  const walk = at => {
    for (const ent of readdirSync(at, { withFileTypes: true })) {
      if (skip(ent.name)) continue
      const path = join(at, ent.name)
      const stat = statSync(path, { throwIfNoEntry: false })
      if (!stat) continue
      if (stat.isDirectory()) walk(path)
      else out.push(path)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

/**
 * Repo-relative sources a build of `pkgDir` reads. Installed dependencies ride
 * on the lockfile instead of `node_modules`, which no build edits.
 */
export function inputFiles(pkgDir) {
  return [
    ...filesUnder(pkgDir, generated),
    // Shared: any edit here, prose included, rebuilds every package — accepted.
    ...filesUnder(join(repoRoot, "scripts"), generated),
    join(repoRoot, "pnpm-lock.yaml"),
    join(repoRoot, "package.json"),
  ]
    .filter(existsSync)
    .map(path => relative(repoRoot, path))
    .sort()
}

const producedFiles = pkgDir =>
  filesUnder(join(pkgDir, "dist"))
    .map(path => relative(pkgDir, path))
    .sort()

export function inputHash(pkgName, dirs = packageDirs()) {
  const h = createHash("sha256")
  // A package compiles against its upstream's `dist/`, so an upstream edit has
  // to move this hash too.
  for (const up of upstreamOf(pkgName)) {
    h.update(`${up}\0${readStamp(dirs.get(up))?.hash ?? "unbuilt"}\0`)
  }
  for (const rel of inputFiles(dirs.get(pkgName))) {
    const bytes = readFileSync(join(repoRoot, rel))
    h.update(`${rel}\0${bytes.length}\0`)
    h.update(bytes)
    h.update("\0")
  }
  return h.digest("hex")
}

export function readStamp(pkgDir) {
  const path = join(pkgDir, STAMP_REL)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return undefined
  }
}

export function isFresh(pkgName, dirs = packageDirs()) {
  const pkgDir = dirs.get(pkgName)
  const stamp = readStamp(pkgDir)
  if (!stamp?.hash || stamp.hash !== inputHash(pkgName, dirs)) return false
  // Recorded outputs rather than manifest-declared ones: a build emits
  // artifacts no manifest names, and a wiped `dist/` must read as stale.
  return (stamp.outputs ?? []).every(rel => existsSync(join(pkgDir, rel)))
}

function save(pkgDir, data) {
  const path = join(pkgDir, STAMP_REL)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, path)
}

function pkgFromCwd(dirs) {
  const cwd = resolve(process.cwd())
  for (const [name, dir] of dirs) if (resolve(dir) === cwd) return name
  console.error(`build-stamp: ${cwd} is not a workspace package`)
  process.exit(1)
}

// Dispatch only when run as a script: importing must never exit the process.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dirs = packageDirs()
  const pkgName = pkgFromCwd(dirs)
  const pkgDir = dirs.get(pkgName)
  switch (process.argv[2]) {
    // `clear` before the build, `write` after: an interrupted build leaves no
    // stamp and rebuilds next time.
    case "clear":
      rmSync(join(pkgDir, STAMP_REL), { force: true })
      break
    case "write":
      save(pkgDir, {
        hash: inputHash(pkgName, dirs),
        outputs: producedFiles(pkgDir),
      })
      break
    default:
      console.error("usage: node scripts/build/build-stamp.mjs <clear|write>")
      process.exit(1)
  }
}
