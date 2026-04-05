import * as assert from "node:assert"
import * as vscode from "vscode"
import { openText } from "./helpers"

async function hoverText(doc: vscode.TextDocument, pos: vscode.Position) {
  const hovers =
    (await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      doc.uri,
      pos,
    )) ?? []
  assert.ok(hovers.length > 0, "expected hover")
  return hovers
    .flatMap((h) => h.contents)
    .map((c) => {
      if (typeof c === "string") return c
      return (c as { value: string }).value
    })
    .join("\n\n")
}

suite("ZshHoverProvider", () => {
  test("shows docs for == inside [[ ]]", async () => {
    const doc = await openText("[[ 1 == 2 ]]")
    const text = await hoverText(doc, new vscode.Position(0, 5))
    assert.match(text, /matches pattern/i)
  })

  test("option hover renders code preamble and category", async () => {
    const doc = await openText("setopt warn_nested_var")
    const text = await hoverText(doc, new vscode.Position(0, 10))
    assert.strictEqual(text.split("\n")[0], "`WARN_NESTED_VAR`")
    assert.match(text, /```zsh/)
    assert.match(text, /setopt warn_nested_var/)
    assert.match(text, /\*\*Default in zsh: `off`\*\*/)
    assert.match(text, /_Option category:_ Expansion and Globbing/)
    assert.ok(!text.includes("example("), "expected example() markup stripped")
  })

  test("short and long set forms resolve to the same option docs", async () => {
    const doc = await openText("set -e -o pipefail")
    const shortText = await hoverText(doc, new vscode.Position(0, 5))
    const longText = await hoverText(doc, new vscode.Position(0, 12))
    assert.match(shortText, /`ERR_EXIT`/)
    assert.match(shortText, /set -e/)
    assert.match(shortText, /set \+e/)
    assert.match(longText, /`PIPE_FAIL`/)
    assert.match(longText, /setopt pipe_fail|setopt pipefail/)
  })

  test("rendered option docs keep selected references and code quotes", async () => {
    const cPrec = await openText("setopt c_precedences")
    const cPrecText = await hoverText(cPrec, new vscode.Position(0, 9))
    assert.match(cPrecText, /Arithmetic Evaluation has an explicit list\./)
    assert.ok(!cPrecText.includes("See ."))
    assert.ok(!cPrecText.includes("\\"))

    const errReturn = await openText("setopt err_return")
    const errReturnText = await hoverText(errReturn, new vscode.Position(0, 9))
    assert.match(errReturnText, /`&&` `\|\|` does not trigger a return/)
    assert.match(errReturnText, /```zsh\nsummit \|\| true\n```/)
  })

  test("rendered option docs format option refs but not env vars", async () => {
    const doc = await openText("setopt cd_silent")
    const text = await hoverText(doc, new vscode.Position(0, 9))
    assert.match(text, /\*\*`AUTO_CD`\*\*/)
    assert.match(text, /\*\*`PUSHD_SILENT`\*\*/)
    assert.match(text, /\*\*`POSIX_CD`\*\*/)
    assert.doesNotMatch(text, /`CDPATH`/)
  })
})
