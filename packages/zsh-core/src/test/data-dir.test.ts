import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  copyRuntimeZshData,
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
})

describe("copyRuntimeZshData", () => {
  test("creates runtimeZshDataPaths under outDir, where the lookup finds them", () => {
    withTmpDir("better-zsh-zsh-core-", dir => {
      const srcBase = join(dir, "dist")
      const srcData = join(srcBase, "data", "zsh-docs")
      const outDir = join(dir, "out")

      mkdirSync(srcData, { recursive: true })
      for (const name of vendoredZshDocFiles) {
        writeFileSync(join(srcData, name), name, "utf8")
      }

      copyRuntimeZshData(outDir, srcBase)

      expect(resolveZshDataDir(outDir)).toBe(join(outDir, runtimeZshDataDir))
      for (const path of runtimeZshDataPaths) {
        expect(existsSync(join(outDir, path))).toBe(true)
      }
    })
  })
})
