import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import {
  copyZshDataFrom,
  resolveZshDataDir,
  runtimeZshDataDir,
  runtimeZshDataPaths,
  vendoredZshDocFiles,
} from "../assets/data-dir"
import { withTmpDir } from "./tmp-dir"

describe("resolveZshDataDir", () => {
  test.each([
    ["packaged", join("data", "zsh-docs")],
    ["bundled runtime", runtimeZshDataDir],
  ])("resolves %s data dir", (_label, sub) => {
    withTmpDir("better-zsh-zsh-core-", dir => {
      const dataDir = join(dir, sub)
      mkdirSync(dataDir, { recursive: true })
      expect(resolveZshDataDir(dir)).toBe(dataDir)
    })
  })

  // `node -e` defines a global `__dirname` (the working directory); the
  // default lookup must still start from the module, not from there.
  test("defaults to the module's directory under `node -e`", () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const module = pathToFileURL(join(here, "..", "assets", "data-dir.ts"))
    withTmpDir("better-zsh-zsh-core-", dir => {
      const out = execFileSync(
        process.execPath,
        [
          "-e",
          `import(${JSON.stringify(module.href)}).then(m => process.stdout.write(m.resolveZshDataDir()))`,
        ],
        { cwd: dir, encoding: "utf8" },
      )
      expect(out).toBe(join(here, "..", "data", "zsh-docs"))
    })
  })
})

describe("copyZshDataFrom", () => {
  test("creates runtimeZshDataPaths under outDir, where the lookup finds them", () => {
    withTmpDir("better-zsh-zsh-core-", dir => {
      const srcBase = join(dir, "dist")
      const srcData = join(srcBase, "data", "zsh-docs")
      const outDir = join(dir, "out")

      mkdirSync(srcData, { recursive: true })
      for (const name of vendoredZshDocFiles) {
        writeFileSync(join(srcData, name), name, "utf8")
      }

      copyZshDataFrom(outDir, srcBase)

      expect(resolveZshDataDir(outDir)).toBe(join(outDir, runtimeZshDataDir))
      for (const path of runtimeZshDataPaths) {
        expect(existsSync(join(outDir, path))).toBe(true)
      }
    })
  })
})
