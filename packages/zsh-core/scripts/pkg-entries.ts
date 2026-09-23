// The package's public entries, read from the npm manifest rather than
// restated: a subpath added to `exports` reaches every consumer without
// another edit.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { withoutFirstSubstring } from "@carlwr/typescript-extra"

/**
 * Every non-glob `exports` subpath, sorted. `./data/*`, `./schema/*` and
 * `./package.json` are npm-only; the rest is the surface shared with JSR.
 */
export function sharedSubpaths(pkgDir: string): string[] {
  const { exports } = JSON.parse(
    readFileSync(join(pkgDir, "package.json"), "utf8"),
  ) as { exports: Record<string, unknown> }
  return Object.keys(exports)
    .filter(sub => !sub.includes("*") && sub !== "./package.json")
    .sort()
}

/**
 * Package-root entry behind a subpath: `.` → `index`, `./render` → `render`
 * (`STYLE-CODE.md` §"Module layout").
 */
function entryName(subpath: string): string {
  return subpath === "." ? "index" : withoutFirstSubstring("./", subpath)
}

/** Entry names behind {@link sharedSubpaths}, sorted. */
export function publicEntries(pkgDir: string): string[] {
  return sharedSubpaths(pkgDir).map(entryName).sort()
}
