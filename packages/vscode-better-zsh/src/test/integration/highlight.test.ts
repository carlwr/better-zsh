import * as assert from "node:assert"
import * as vscode from "vscode"
import { openFixture } from "./helpers"

async function getHighlights(doc: vscode.TextDocument, pos: vscode.Position) {
  return vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
    "vscode.executeDocumentHighlights",
    doc.uri,
    pos,
  )
}

function highlightTexts(
  doc: vscode.TextDocument,
  hl: vscode.DocumentHighlight[],
) {
  return hl.map((h) => doc.getText(h.range)).sort()
}

suite("ZshHighlightProvider", () => {
  let doc: vscode.TextDocument

  suiteSetup(async () => {
    doc = await openFixture("test.zsh")
  })

  test("msg-warn: highlights only exact matches, not prefix or extended", async () => {
    const hl = await getHighlights(doc, new vscode.Position(1, 2))
    assert.ok(hl, "expected highlights")
    const texts = highlightTexts(doc, hl)
    assert.deepStrictEqual(texts, ["msg-warn", "msg-warn"])
  })

  test("msg: does not bleed into msg-warn or msg-warn-verbose", async () => {
    const hl = await getHighlights(doc, new vscode.Position(0, 1))
    assert.ok(hl, "expected highlights")
    const texts = highlightTexts(doc, hl)
    assert.deepStrictEqual(texts, ["msg"])
  })

  test("some-func: matches across definition and call site", async () => {
    const hl = await getHighlights(doc, new vscode.Position(4, 2))
    assert.ok(hl, "expected highlights")
    const texts = highlightTexts(doc, hl)
    assert.deepStrictEqual(texts, ["some-func", "some-func"])
  })

  test("msg-warn-verbose: full triple-dashed identifier", async () => {
    const hl = await getHighlights(doc, new vscode.Position(2, 5))
    assert.ok(hl, "expected highlights")
    const texts = highlightTexts(doc, hl)
    assert.deepStrictEqual(texts, ["msg-warn-verbose"])
  })
})
