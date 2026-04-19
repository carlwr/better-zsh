import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * End-to-end install smoke: pack @carlwr/zshref, npm-install the tarball
 * into a fresh temp dir, and invoke the installed `zshref` bin with
 * `--version` — assert it matches the packed version.
 *
 * `@carlwr/zsh-core` + `@carlwr/zsh-core-tooldef` are resolved from the
 * npm registry normally. Temp dirs live under `os.tmpdir()` — outside the
 * workspace — so npm's upward node_modules walk can't find the repo's
 * install.
 */

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const npm = process.platform === "win32" ? "npm.cmd" : "npm"

const here = dirname(fileURLToPath(import.meta.url))
const cliDir = join(here, "..")

const packDir = mkdtempSync(join(tmpdir(), "zshref-pack-"))
const instDir = mkdtempSync(join(tmpdir(), "zshref-inst-"))

try {
  const out = execFileSync(
    pnpm,
    ["pack", "--json", "--pack-destination", packDir],
    { cwd: cliDir, encoding: "utf8" },
  )
  const cliTgz = JSON.parse(out).filename

  writeFileSync(
    join(instDir, "package.json"),
    `${JSON.stringify(
      { name: "zshref-install-smoke", version: "0.0.0", private: true },
      null,
      2,
    )}\n`,
  )

  // The consumer install needs the JSR npm registry for cliffy. Mirror the
  // workspace root's .npmrc.
  writeFileSync(join(instDir, ".npmrc"), "@jsr:registry=https://npm.jsr.io\n")

  execFileSync(
    npm,
    ["install", "--no-audit", "--no-fund", "--no-save", cliTgz],
    { cwd: instDir, encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] },
  )

  const bin = join(instDir, "node_modules", ".bin", "zshref")
  const versionOut = execFileSync(bin, ["--version"], {
    encoding: "utf8",
  }).trim()

  const expected = JSON.parse(
    readFileSync(join(cliDir, "package.json"), "utf8"),
  ).version
  if (!versionOut.includes(expected)) {
    throw new Error(
      `bin --version mismatch: got "${versionOut}", expected to contain "${expected}"`,
    )
  }

  process.stdout.write(`zshref install-smoke: OK (--version → ${versionOut})\n`)
} finally {
  rmSync(packDir, { recursive: true, force: true })
  rmSync(instDir, { recursive: true, force: true })
}
