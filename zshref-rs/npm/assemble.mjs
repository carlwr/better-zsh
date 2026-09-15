// assemble.mjs [--archives DIR] [--out DIR]: stage the two npm packages from
// the per-target release archives `archive-bins` writes.
//
//   <out>/zshref/       @carlwr/zshref — every platform's binaries + launcher
//   <out>/zshref-mcp/   @carlwr/zshref-mcp — one bin over the fat package
//
// Packages whatever archives it finds (a subset serves local checks and act
// rehearsals); package identity comes from the crate manifest.

import { execFileSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const here = dirname(fileURLToPath(import.meta.url))
const crate = dirname(here)
const { values: opts } = parseArgs({
  options: {
    archives: { type: "string", default: join(crate, ".aux/dist") },
    out: { type: "string", default: join(crate, ".aux/npm") },
  },
})

const scope = "@carlwr"
const meta = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--no-deps",
      "--format-version",
      "1",
      "--manifest-path",
      join(crate, "Cargo.toml"),
    ],
    { encoding: "utf8" },
  ),
).packages[0]
const bins = meta.targets.filter(t => t.kind.includes("bin")).map(t => t.name)
const fat = { name: `${scope}/${meta.name}`, dir: join(opts.out, meta.name) }
const thin = {
  name: `${scope}/${meta.name}-mcp`,
  dir: join(opts.out, `${meta.name}-mcp`),
  bin: `${meta.name}-mcp`,
}
if (!bins.includes(thin.bin))
  throw new Error(`no bin ${thin.bin} in ${meta.name}`)

// npm's platform key for a target triple
const arches = { aarch64: "arm64", x86_64: "x64" }
const oses = { darwin: "darwin", linux: "linux", windows: "win32" }
const keyOf = triple => {
  const [arch, , os] = triple.split("-")
  if (!(arch in arches) || !(os in oses))
    throw new Error(`unknown target ${triple}`)
  return `${oses[os]}-${arches[arch]}`
}
// recursive: `gh run download` nests each artifact in a directory of its own
const archives = readdirSync(opts.archives, { recursive: true })
  .map(f => ({
    file: join(opts.archives, f),
    m: /^zshref-(.+?)\.(tar\.gz|zip)$/.exec(basename(f)),
  }))
  .filter(a => a.m)
if (archives.length === 0)
  throw new Error(`no zshref-<target> archives in ${opts.archives}`)

const stub = (mod, bin) =>
  `#!/usr/bin/env node\nrequire(${JSON.stringify(mod)})(${JSON.stringify(bin)})\n`
const shared = {
  version: meta.version,
  description: meta.description,
  license: meta.license,
  // the form npm normalizes to; anything else draws a publish warning
  repository: { type: "git", url: `git+${meta.repository}.git` },
  homepage: meta.homepage,
  keywords: meta.keywords,
  // Ancient API surface only; MCP clients ship old Nodes. Not tied to the
  // repo's own Node major — nothing here is built on Node.
  engines: { node: ">=18" },
}
const write = (dir, rel, text, mode) => {
  mkdirSync(join(dir, dirname(rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
  if (mode) chmodSync(join(dir, rel), mode)
}
const copy = (dir, rel, from, mode) => {
  mkdirSync(join(dir, dirname(rel)), { recursive: true })
  copyFileSync(from, join(dir, rel))
  if (mode) chmodSync(join(dir, rel), mode)
}

// --- fat ---
rmSync(fat.dir, { recursive: true, force: true })
const bin = Object.fromEntries(bins.map(b => [b, `bin/${b}.js`]))
write(
  fat.dir,
  "package.json",
  `${JSON.stringify({ name: fat.name, ...shared, bin }, null, 2)}\n`,
)
copy(fat.dir, "README.md", join(here, meta.name, "README.md"))
copy(fat.dir, "LICENSE", join(crate, "LICENSE"))
copy(fat.dir, "THIRD_PARTY_NOTICES.md", join(crate, "THIRD_PARTY_NOTICES.md"))
copy(fat.dir, "launch.js", join(here, "launch.js"))
for (const b of bins) write(fat.dir, `bin/${b}.js`, stub("../launch", b), 0o755)

// archive modes are not trusted: every binary gets 0755 here
const keys = []
for (const { file, m } of archives) {
  const [, triple, fmt] = m
  const key = keyOf(triple)
  const tmp = mkdtempSync(join(tmpdir(), "zshref-npm-"))
  if (fmt === "zip") execFileSync("unzip", ["-oq", file, "-d", tmp])
  else execFileSync("tar", ["-xzf", file, "-C", tmp])
  const ext = key.startsWith("win32") ? ".exe" : ""
  for (const b of bins)
    copy(fat.dir, `native/${key}/${b}${ext}`, join(tmp, b + ext), 0o755)
  rmSync(tmp, { recursive: true })
  keys.push(key)
}

// --- thin ---
rmSync(thin.dir, { recursive: true, force: true })
write(
  thin.dir,
  "package.json",
  `${JSON.stringify(
    {
      name: thin.name,
      ...shared,
      bin: { [thin.bin]: `bin/${thin.bin}.js` },
      dependencies: { [fat.name]: meta.version },
    },
    null,
    2,
  )}\n`,
)
copy(thin.dir, "README.md", join(here, `${meta.name}-mcp`, "README.md"))
copy(thin.dir, "LICENSE", join(crate, "LICENSE"))
write(
  thin.dir,
  `bin/${thin.bin}.js`,
  stub(`${fat.name}/launch`, thin.bin),
  0o755,
)

console.log(
  `staged ${fat.name} + ${thin.name} ${meta.version} [${keys.sort().join(", ")}] -> ${opts.out}`,
)
