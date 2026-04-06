import * as assert from "node:assert"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import * as vscode from "vscode"

const EXT_ID = "carlwr.better-zsh"
const fixtureFile = join(
  resolve(__dirname, "../../../test-fixtures"),
  "test.zsh",
)

function assertExists(path: string) {
  assert.ok(existsSync(path), `expected file ${path} to exist`)
}
function assertDoesntExist(path: string) {
  assert.ok(!existsSync(path), `expected file ${path} to not exist`)
}

async function getDoc() {
  const uri = vscode.Uri.file(fixtureFile)
  return await vscode.workspace.openTextDocument(uri)
}

suite("bundled extension", function () {
  this.timeout(30000)

  let ext: vscode.Extension<unknown> | undefined

  suiteSetup(async () => {
    ext = vscode.extensions.getExtension(EXT_ID)
    assert.ok(ext, `extension ${EXT_ID} not found — vsix not installed?`)

    const doc = await getDoc()
    await vscode.window.showTextDocument(doc)
    await new Promise((r) => setTimeout(r, 2000))
  })

  test("extension activates", () => {
    assert.ok(ext?.isActive, `extension ${EXT_ID} did not activate`)
  })

  test("highlight provider works from bundle", async () => {
    const doc = await getDoc()

    const hl = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
      "vscode.executeDocumentHighlights",
      doc.uri,
      new vscode.Position(1, 2),
    )
    assert.ok(hl, "expected highlights result")
    const texts = hl.map((h) => doc.getText(h.range)).sort()
    assert.deepStrictEqual(texts, ["msg-warn", "msg-warn"])
  })

  test("bundle includes runtime zsh docs and excludes compiled test output", () => {
    const extPath = ext?.extensionPath
    assert.ok(extPath, "expected installed extension path")

    for (const rel of [
      "out/zsh-core-data/SOURCE.md",
      "out/zsh-core-data/builtins.yo",
      "out/zsh-core-data/cond.yo",
      "out/zsh-core-data/expn.yo",
      "out/zsh-core-data/grammar.yo",
      "out/zsh-core-data/options.yo",
      "out/zsh-core-data/params.yo",
      "out/zsh-core-data/redirect.yo",
      "out/language-configuration.json",
      "out/snippets.json",
      "out/zsh-chat-instructions.md",
    ]) {
      assertExists(join(extPath, rel))
    }

    assertDoesntExist(join(extPath, "out", "src"))
    assertDoesntExist(join(extPath, "out", "build.js"))
  })
})
