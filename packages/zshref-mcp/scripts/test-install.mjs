import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * End-to-end install smoke: pack @carlwr/zshref-mcp, npm-install the
 * tarball into a fresh temp dir, and invoke the installed `zshref-mcp`
 * bin with `--version` — assert it matches the packed version.
 *
 * `@carlwr/zsh-core` is resolved from the npm registry normally (it's
 * published). Temp dirs live under `os.tmpdir()` — outside the workspace —
 * so npm's upward node_modules walk can't find the repo's install.
 */

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const npm = process.platform === "win32" ? "npm.cmd" : "npm"

const here = dirname(fileURLToPath(import.meta.url))
const mcpDir = join(here, "..")

const packDir = mkdtempSync(join(tmpdir(), "better-zshref-mcp-pack-"))
const instDir = mkdtempSync(join(tmpdir(), "better-zshref-mcp-inst-"))

try {
  const out = execFileSync(
    pnpm,
    ["pack", "--json", "--pack-destination", packDir],
    { cwd: mcpDir, encoding: "utf8" },
  )
  const mcpTgz = JSON.parse(out).filename

  writeFileSync(
    join(instDir, "package.json"),
    `${JSON.stringify(
      { name: "mcp-install-smoke", version: "0.0.0", private: true },
      null,
      2,
    )}\n`,
  )

  execFileSync(
    npm,
    ["install", "--no-audit", "--no-fund", "--no-save", mcpTgz],
    { cwd: instDir, encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] },
  )

  const bin = join(instDir, "node_modules", ".bin", "zshref-mcp")
  const versionOut = execFileSync(bin, ["--version"], {
    encoding: "utf8",
  }).trim()

  const expected = JSON.parse(
    readFileSync(join(mcpDir, "package.json"), "utf8"),
  ).version
  if (versionOut !== expected) {
    throw new Error(
      `bin --version mismatch: got "${versionOut}", expected "${expected}"`,
    )
  }

  process.stdout.write(
    `zshref-mcp install-smoke: OK (--version → ${versionOut})\n`,
  )
} finally {
  rmSync(packDir, { recursive: true, force: true })
  rmSync(instDir, { recursive: true, force: true })
}
