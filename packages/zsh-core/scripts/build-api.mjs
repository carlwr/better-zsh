import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildApi } from "../../../scripts/api-extractor.mjs"

// One rollup per non-glob `exports` subpath, read from the manifest rather
// than restated: a subpath added without a rollup ships no `.d.ts`.
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const { exports } = JSON.parse(
  readFileSync(join(pkgDir, "package.json"), "utf8"),
)
const entries = Object.keys(exports)
  .filter(sub => !sub.includes("*") && sub !== "./package.json")
  .sort()
  .map(subpath => ({
    entry: subpath === "." ? "index" : subpath.slice(2),
    subpath,
  }))

await buildApi({ packageScriptUrl: import.meta.url, entries })
