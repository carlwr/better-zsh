import { expect, test } from "vitest"
import { PKG_VERSION } from "../pkg-info.ts"
import { describeIfBuilt, runBin } from "./bin-util.ts"

describeIfBuilt("bin end-to-end", () => {
  test("--help exits 0", async () => {
    const { code } = await runBin(["--help"])
    expect(code).toBe(0)
  })

  test("--version contains PKG_VERSION", async () => {
    const { code, stdout, stderr } = await runBin(["--version"])
    expect(code).toBe(0)
    expect(`${stdout}${stderr}`).toContain(PKG_VERSION)
  })

  test("classify --raw echo emits JSON with builtin category", async () => {
    const { code, stdout } = await runBin(["classify", "--raw", "echo"])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed?.match?.category).toBe("builtin")
  })

  test("search --category not_a_real_category exits 2", async () => {
    const { code } = await runBin([
      "search",
      "--category",
      "not_a_real_category",
    ])
    expect(code).toBe(2)
  })
})
