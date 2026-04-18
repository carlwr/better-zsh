import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * End-to-end install smoke: pack zsh-core, npm-install the tarball into a
 * fresh temp dir, and prove a consumer can import from both entrypoints
 * (`.` and `./render`), load the corpus, resolve an option, and render
 * markdown. Catches the class of bug where `exports` declares a subpath
 * that doesn't actually resolve — which `test:smoke` only partially
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

  // Driver: use both entrypoints (`.` and `./render`), exercise the happy
  // path end-to-end, print a marker on success.
  const driver = `
import { loadCorpus, resolve } from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"

const corpus = loadCorpus()
const piece = resolve(corpus, "option", "AUTO_CD")
if (!piece || piece.category !== "option") {
  throw new Error("resolve('option','AUTO_CD') failed: " + JSON.stringify(piece))
}
const md = renderDoc(corpus, piece)
if (typeof md !== "string" || md.length === 0) {
  throw new Error("renderDoc returned non-string or empty")
}
if (!/AUTO[_ ]?CD/i.test(md)) {
  throw new Error("renderDoc output missing expected AUTO_CD reference")
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
