import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * End-to-end install smoke. Catches the class of bug where `exports` declares
 * a subpath that doesn't actually resolve — which `test:pack` only partially
 * covers (it asserts files are present in the tarball, not that `node`
 * successfully resolves them).
 *
 * Temp dirs live under `os.tmpdir()` — outside the workspace — so npm's
 * upward node_modules walk cannot find the repo's install.
 */

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const npm = process.platform === "win32" ? "npm.cmd" : "npm"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, "..")

const packDir = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-pack-"))
const instDir = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-inst-"))

try {
  const out = execFileSync(
    pnpm,
    ["pack", "--json", "--pack-destination", packDir],
    { cwd: pkgDir, encoding: "utf8" },
  )
  // pnpm pack --json emits an absolute path in `filename` when
  // --pack-destination is used — use it verbatim, don't re-join.
  const tgz = JSON.parse(out).filename

  writeFileSync(
    join(instDir, "package.json"),
    `${JSON.stringify(
      {
        name: "zsh-core-install-smoke",
        version: "0.0.0",
        private: true,
        dependencies: { "@carlwr/zsh-core": `file:${tgz}` },
      },
      null,
      2,
    )}\n`,
  )

  execFileSync(npm, ["install", "--no-audit", "--no-fund", "--no-save"], {
    cwd: instDir,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "inherit"],
  })

  // Representative subpaths, not every one.
  const driver = `
import { loadCorpus } from "@carlwr/zsh-core"
import { runtimeZshDataDir } from "@carlwr/zsh-core/assets"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import { renderRecord } from "@carlwr/zsh-core/render"
import { resolve } from "@carlwr/zsh-core/resolver"

const corpus = loadCorpus()
// Categories parse on first access: touch each so every vendored file is
// parsed from the installed layout.
for (const cat of Object.keys(corpus)) corpus[cat]
const hit = resolve(corpus, "option", "AUTO_CD")
if (!hit || hit.record.category !== "option" || hit.record.id !== "autocd") {
  throw new Error("resolve('option','AUTO_CD') failed: " + JSON.stringify(hit))
}
const { title, mdBody } = renderRecord(corpus, hit.record)
if (title !== "\`AUTO_CD\`" || typeof mdBody !== "string" || mdBody.length === 0) {
  throw new Error("renderRecord returned unexpected title or body")
}
if (!/AUTO[_ ]?CD/i.test(mdBody)) {
  throw new Error("renderRecord body missing expected AUTO_CD reference")
}
if (typeof runtimeZshDataDir !== "string" || runtimeZshDataDir.length === 0) {
  throw new Error("runtimeZshDataDir is not a non-empty string")
}
if (!/^zsh-/.test(ZSH_UPSTREAM.tag)) {
  throw new Error("ZSH_UPSTREAM tag missing expected prefix")
}
process.stdout.write("ok")
`
  const driverPath = join(instDir, "driver.mjs")
  writeFileSync(driverPath, driver)

  const result = execFileSync("node", [driverPath], {
    cwd: instDir,
    encoding: "utf8",
  }).trim()
  if (result !== "ok") {
    throw new Error(`driver output mismatch: got "${result}"`)
  }

  process.stdout.write("zsh-core install-smoke: OK\n")
} finally {
  rmSync(packDir, { recursive: true, force: true })
  rmSync(instDir, { recursive: true, force: true })
}
