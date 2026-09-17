import * as assert from "node:assert"
import * as vscode from "vscode"
import { highlightTexts, openFixture, rangeTexts } from "./helpers"

async function rename(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  name: string,
) {
  return vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    doc.uri,
    pos,
    name,
  )
}

async function symbols(doc: vscode.TextDocument) {
  return (
    (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      doc.uri,
    )) ?? []
  )
}

suite("ZshNavigation", () => {
  let doc: vscode.TextDocument

  suiteSetup(async () => {
    doc = await openFixture("navigation.zsh")
  })

  test("highlights skip comments", async () => {
    const texts = await highlightTexts(doc, new vscode.Position(1, 1))
    assert.deepStrictEqual(texts, ["my-func", "my-func", "my-func"])
  })

  test("rename is function-only", async () => {
    const edit = await rename(doc, new vscode.Position(1, 1), "our-func")
    assert.ok(edit, "expected rename edit")
    const edits = edit.entries().flatMap(([, edits]) => edits)
    assert.deepStrictEqual(
      edits.map(e => e.newText),
      ["our-func", "our-func", "our-func"],
    )
    assert.deepStrictEqual(rangeTexts(doc, edits), [
      "my-func",
      "my-func",
      "my-func",
    ])
  })

  test("outline lists functions", async () => {
    const got = await symbols(doc)
    assert.deepStrictEqual(
      got.map(s => s.name),
      ["my-func", "other-func"],
    )
  })
})
