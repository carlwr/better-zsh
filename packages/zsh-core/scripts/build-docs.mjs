import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..")
const distDir = join(pkgDir, "dist")
// Keep the published site outside dist/ so docs builds cannot accidentally
// leak HTML into the npm tarball.
const siteDir = join(pkgDir, ".aux", "docs", "site")
const apiDir = join(distDir, "api")
const dataDir = join(distDir, "json")

const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))

const llms = [
  `# ${pkg.name}`,
  "",
  `> ${pkg.description}`,
  "",
  "Docs:",
  "- API HTML: ./index.html",
  "- TypeDoc JSON model: ./typedoc.json",
  "- API Extractor models: ./api/",
  "- Structured zsh data: ./data/",
  "",
  "Key entry points:",
  "- .",
  "- ./render",
  "- ./exec",
  "- ./assets",
  "",
  "Structured data files:",
  "- ./data/index.json",
  "- ./data/options.json",
  "- ./data/cond-ops.json",
  "- ./data/builtins.json",
  "- ./data/shell-params.json",
  "- ./data/precmds.json",
  "- ./data/redirections.json",
  "- ./data/reserved-words.json",
  "- ./data/subscript-flags.json",
  "- ./data/param-flags.json",
  "- ./data/history.json",
  "- ./data/glob-operators.json",
  "- ./data/glob-flags.json",
  "- ./data/process-substs.json",
  "",
].join("\n")

mkdirSync(siteDir, { recursive: true })
rmSync(join(siteDir, "api"), { recursive: true, force: true })
rmSync(join(siteDir, "data"), { recursive: true, force: true })
cpSync(apiDir, join(siteDir, "api"), { recursive: true })
cpSync(dataDir, join(siteDir, "data"), { recursive: true })
writeFileSync(join(siteDir, "llms.txt"), llms)
writeFileSync(join(siteDir, ".nojekyll"), "")
