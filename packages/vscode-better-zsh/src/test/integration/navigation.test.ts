import * as assert from "node:assert"
import * as vscode from "vscode"
import { openFixture } from "./helpers"

async function highlights(doc: vscode.TextDocument, pos: vscode.Position) {
  return (
    (await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
      "vscode.executeDocumentHighlights",
      doc.uri,
      pos,
    )) ?? []
  )
}

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

function texts(
  doc: vscode.TextDocument,
  ranges: readonly { range: vscode.Range }[],
) {
  return ranges.map(({ range }) => doc.getText(range)).sort()
}

suite("ZshNavigation", () => {
  let doc: vscode.TextDocument

  suiteSetup(async () => {
    doc = await openFixture("navigation.zsh")
  })

  test("highlights skip comments", async () => {
    const got = await highlights(doc, new vscode.Position(1, 1))
    assert.deepStrictEqual(texts(doc, got), ["my-func", "my-func", "my-func"])
  })

  test("rename is function-only", async () => {
    const edit = await rename(doc, new vscode.Position(1, 1), "our-func")
    assert.ok(edit, "expected rename edit")
    const items = edit
      .entries()
      .flatMap(([uri, edits]) => edits.map(edit => [uri, edit] as const))
    assert.deepStrictEqual(
      items.map(([, edit]) => edit.newText),
      ["our-func", "our-func", "our-func"],
    )
    assert.deepStrictEqual(
      items.map(([, edit]) => doc.getText(edit.range)).sort(),
      ["my-func", "my-func", "my-func"],
    )
  })

  test("outline lists functions", async () => {
    const got = await symbols(doc)
    assert.deepStrictEqual(
      got.map(s => s.name),
      ["my-func", "other-func"],
    )
  })
})
