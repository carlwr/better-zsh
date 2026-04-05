import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  copyRuntimeZshData,
  resolveZshDataDir,
  runtimeZshDataDir,
} from "../data-dir"

function withTmpDir(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "better-zsh-zsh-core-"))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("resolveZshDataDir", () => {
  test("prefers packaged data dir", () => {
    withTmpDir((dir) => {
      const dataDir = join(dir, "data", "zsh-docs")
      mkdirSync(dataDir, { recursive: true })
      expect(resolveZshDataDir(dir)).toBe(dataDir)
    })
  })

  test("falls back to bundled runtime data dir", () => {
    withTmpDir((dir) => {
      const dataDir = join(dir, runtimeZshDataDir)
      mkdirSync(dataDir, { recursive: true })
      expect(resolveZshDataDir(dir)).toBe(dataDir)
    })
  })
})

describe("copyRuntimeZshData", () => {
  test("copies docs under the runtime dir name", () => {
    withTmpDir((dir) => {
      const srcBase = join(dir, "dist")
      const srcData = join(srcBase, "data", "zsh-docs")
      const outDir = join(dir, "out")

      mkdirSync(srcData, { recursive: true })
      writeFileSync(join(srcData, "options.yo"), "opts", "utf8")

      copyRuntimeZshData(outDir, srcBase)

      expect(resolveZshDataDir(outDir)).toBe(join(outDir, runtimeZshDataDir))
    })
  })
})
