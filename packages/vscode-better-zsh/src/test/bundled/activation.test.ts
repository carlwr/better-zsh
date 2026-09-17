import * as assert from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { runtimeZshDataDir, vendoredZshDocFiles } from "@carlwr/zsh-core/assets"
import * as vscode from "vscode"
import { outAsset } from "../../manifest"
import { highlightTexts, openFixture, pkgDir } from "../integration/helpers"

// `<publisher>.<name>`, as VS Code identifies an installed extension.
const { publisher, name } = JSON.parse(
  readFileSync(join(pkgDir, "package.json"), "utf8"),
) as { publisher: string; name: string }
const EXT_ID = `${publisher}.${name}`

function assertExists(path: string) {
  assert.ok(existsSync(path), `expected file ${path} to exist`)
}
function assertDoesntExist(path: string) {
  assert.ok(!existsSync(path), `expected file ${path} to not exist`)
}

suite("bundled extension", function () {
  this.timeout(30000)

  let ext: vscode.Extension<unknown> | undefined

  suiteSetup(async () => {
    ext = vscode.extensions.getExtension(EXT_ID)
    assert.ok(ext, `extension ${EXT_ID} not found — vsix not installed?`)
    await openFixture("test.zsh", 2000)
  })

  test("extension activates", () => {
    assert.ok(ext?.isActive, `extension ${EXT_ID} did not activate`)
  })

  test("highlight provider works from bundle", async () => {
    const doc = await openFixture("test.zsh")
    const texts = await highlightTexts(doc, new vscode.Position(1, 2))
    assert.deepStrictEqual(texts, ["msg-warn", "msg-warn"])
  })

  test("bundle includes runtime zsh docs and excludes compiled test output", () => {
    const extPath = ext?.extensionPath
    assert.ok(extPath, "expected installed extension path")

    for (const rel of [
      ...vendoredZshDocFiles.map(file => join("out", runtimeZshDataDir, file)),
      ...Object.values(outAsset).map(file => join("out", file)),
    ]) {
      assertExists(join(extPath, rel))
    }

    assertDoesntExist(join(extPath, "out", "src"))
    assertDoesntExist(join(extPath, "out", "build.js"))
  })
})
