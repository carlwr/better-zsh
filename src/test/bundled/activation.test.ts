import * as assert from "node:assert"
import * as path from "node:path"
import * as vscode from "vscode"

const EXT_ID = "carlwr.better-zsh"
const fixtureDir = path.resolve(__dirname, "../../../../test-fixtures")

suite("bundled extension", function () {
  this.timeout(30000)

  let ext: vscode.Extension<unknown> | undefined

  suiteSetup(async () => {
    ext = vscode.extensions.getExtension(EXT_ID)
    assert.ok(ext, `extension ${EXT_ID} not found — vsix not installed?`)

    const uri = vscode.Uri.file(path.join(fixtureDir, "test.zsh"))
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc)
    await new Promise((r) => setTimeout(r, 2000))
  })

  test("extension activates", () => {
    assert.ok(ext?.isActive, `extension ${EXT_ID} did not activate`)
  })

  test("highlight provider works from bundle", async () => {
    const uri = vscode.Uri.file(path.join(fixtureDir, "test.zsh"))
    const doc = await vscode.workspace.openTextDocument(uri)

    const hl = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
      "vscode.executeDocumentHighlights",
      doc.uri,
      new vscode.Position(1, 2),
    )
    assert.ok(hl, "expected highlights result")
    const texts = hl.map((h) => doc.getText(h.range)).sort()
    assert.deepStrictEqual(texts, ["msg-warn", "msg-warn"])
  })
})
