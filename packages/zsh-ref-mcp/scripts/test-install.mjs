import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * End-to-end install smoke: pack both zsh-core and @carlwr/zsh-ref-mcp,
 * npm-install the MCP tarball into a fresh temp dir with zsh-core
 * overridden to the local tarball (zsh-core is not published yet), then
 * invoke the installed `zsh-ref-mcp` bin with `--version` and assert it
 * matches the packed version.
 *
 * Temp dirs live under `os.tmpdir()` — outside the workspace — so npm's
 * upward node_modules walk cannot accidentally find the repo's install.
 * When the MCP moves to its own repo and consumes a published
 * zsh-core, the `overrides` block goes away (see EXTRACTION.md).
 */

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const npm = process.platform === "win32" ? "npm.cmd" : "npm"

const here = dirname(fileURLToPath(import.meta.url))
const mcpDir = join(here, "..")
const zcDir = join(mcpDir, "..", "zsh-core")

const packDir = mkdtempSync(join(tmpdir(), "better-zsh-ref-mcp-pack-"))
const instDir = mkdtempSync(join(tmpdir(), "better-zsh-ref-mcp-inst-"))

const pack = cwd => {
  const out = execFileSync(
    pnpm,
    ["pack", "--json", "--pack-destination", packDir],
    { cwd, encoding: "utf8" },
  )
  return JSON.parse(out).filename
}

try {
  const zcTgz = pack(zcDir)
  const mcpTgz = pack(mcpDir)

  writeFileSync(
    join(instDir, "package.json"),
    `${JSON.stringify(
      {
        name: "mcp-install-smoke",
        version: "0.0.0",
        private: true,
        overrides: { "@carlwr/zsh-core": `file:${zcTgz}` },
      },
      null,
      2,
    )}\n`,
  )

  execFileSync(
    npm,
    ["install", "--no-audit", "--no-fund", "--no-save", mcpTgz],
    { cwd: instDir, encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] },
  )

  const bin = join(instDir, "node_modules", ".bin", "zsh-ref-mcp")
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
    `zsh-ref-mcp install-smoke: OK (--version → ${versionOut})\n`,
  )
} finally {
  rmSync(packDir, { recursive: true, force: true })
  rmSync(instDir, { recursive: true, force: true })
}
