import * as assert from "node:assert"
import * as vscode from "vscode"
import { highlightTexts, openFixture } from "./helpers"

suite("ZshHighlightProvider", () => {
  let doc: vscode.TextDocument

  suiteSetup(async () => {
    doc = await openFixture("test.zsh")
  })

  for (const [title, [line, char], want] of [
    [
      "msg-warn: highlights only exact matches, not prefix or extended",
      [1, 2],
      ["msg-warn", "msg-warn"],
    ],
    ["msg: does not bleed into msg-warn or msg-warn-verbose", [0, 1], ["msg"]],
    [
      "some-func: matches across definition and call site",
      [4, 2],
      ["some-func", "some-func"],
    ],
    [
      "msg-warn-verbose: full triple-dashed identifier",
      [2, 5],
      ["msg-warn-verbose"],
    ],
  ] as const) {
    test(title, async () => {
      const texts = await highlightTexts(doc, new vscode.Position(line, char))
      assert.deepStrictEqual(texts, want)
    })
  }
})
