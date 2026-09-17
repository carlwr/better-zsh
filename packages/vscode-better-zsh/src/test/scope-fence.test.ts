import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { describe, expect, test } from "vitest"

// What the extension may reach for; the README advertises it. The source
// scan names the allowed sites; the bundle scan covers bundled dependencies.
const SRC = resolve(__dirname, "..")
const BUNDLE = resolve(SRC, "..", "out", "extension.js")

const NETWORK = /["'](node:)?(http|https|http2|net|dns|tls|dgram)["']/
const DYNAMIC = /\bfetch\(|\beval\(|new Function\(|WebSocket|XMLHttpRequest/

const sources = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter(d => d.isFile() && d.name.endsWith(".ts"))
  .map(d => relative(SRC, join(d.parentPath, d.name)).split(sep).join("/"))
  .filter(f => !f.startsWith("test/"))
  .sort()

const filesMatching = (re: RegExp) =>
  sources.filter(f => re.test(readFileSync(join(SRC, f), "utf8")))

describe("scope fence", () => {
  test("covers the source tree", () => {
    expect(sources).toContain("extension.ts")
    expect(sources).toContain("zsh/exec.ts")
  })

  test("one spawn site", () => {
    expect(filesMatching(/child_process/)).toEqual(["zsh/exec.ts"])
  })

  test("no network, no dynamic code", () => {
    expect(filesMatching(NETWORK)).toEqual([])
    expect(filesMatching(DYNAMIC)).toEqual([])
  })

  test("process environment: read at the spawn boundary and the test hook only", () => {
    expect(filesMatching(/process\.env\b/)).toEqual([
      "contributions.ts",
      "zsh.ts",
      "zsh/exec.ts",
    ])
  })

  test("filesystem writes: the spawn boundary and the build only", () => {
    expect(
      filesMatching(/\b(writeFile|writeFileSync|mkdtemp|cpSync)\b/),
    ).toEqual([
      "build/extension-stage.ts",
      "build/generate-assets.ts",
      "zsh/exec.ts",
    ])
  })
})

// Present after `pnpm build`; packaging runs the tests after building.
describe("scope fence: the built bundle", () => {
  test("one spawn site, no network, no dynamic code", ctx => {
    if (!existsSync(BUNDLE)) return ctx.skip()
    const js = readFileSync(BUNDLE, "utf8")
    expect(js.match(/require\("(node:)?child_process"\)/g)).toHaveLength(1)
    expect(js).not.toMatch(NETWORK)
    expect(js).not.toMatch(DYNAMIC)
  })
})
