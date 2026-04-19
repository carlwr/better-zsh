import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import { PKG_VERSION } from "../pkg-info.ts"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, "..", "..")
const binEntry = join(pkgDir, "dist", "bin.mjs")
const describeIfBuilt = existsSync(binEntry) ? describe : describe.skip
const run = promisify(execFile)

// Non-zero exits from `node script ...` come back as a rejected promise.
// For exit-code assertions we catch and inspect `code`/`stderr` manually.
async function runOrErr(
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [binEntry, ...args])
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return {
      code: e.code ?? -1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    }
  }
}

describeIfBuilt("bin end-to-end", () => {
  test("--help exits 0", async () => {
    const { code } = await runOrErr(["--help"])
    expect(code).toBe(0)
  })

  test("--version contains PKG_VERSION", async () => {
    const { code, stdout, stderr } = await runOrErr(["--version"])
    expect(code).toBe(0)
    expect(`${stdout}${stderr}`).toContain(PKG_VERSION)
  })

  test("classify --raw echo emits JSON with builtin category", async () => {
    const { code, stdout } = await runOrErr(["classify", "--raw", "echo"])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed?.match?.category).toBe("builtin")
  })

  test("search --category not_a_real_category exits 2", async () => {
    const { code } = await runOrErr([
      "search",
      "--category",
      "not_a_real_category",
    ])
    expect(code).toBe(2)
  })
})
