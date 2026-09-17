// app.html's inline pre-paint script reads the key theme.ts persists under —
// by hand, as it cannot import TS. Pinned, so a rename cannot desync them.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, it } from "vitest"
import { STORAGE_KEY } from "../../src/lib/theme"
import { PATHS } from "../_helpers"

it("app.html reads the storage key theme.ts writes", () => {
  const html = readFileSync(resolve(PATHS.pkgDir, "src/app.html"), "utf8")
  expect(html).toContain(`getItem('${STORAGE_KEY}')`)
})
