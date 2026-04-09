import * as assert from "node:assert"
import * as vscode from "vscode"
import { hoverText, openText } from "./helpers"

suite("ZshHoverProvider", () => {
  test("shows builtin docs for command head", async () => {
    const doc = await openText("echo hi")
    const text = await hoverText(doc, new vscode.Position(0, 1))
    assert.match(text, /^`echo`/m)
    assert.match(text, /Write each arg on the standard output/i)
  })

  test("shows builtin docs for punctuation builtins", async () => {
    const dot = await openText(". ./script.zsh")
    const dotText = await hoverText(dot, new vscode.Position(0, 0))
    assert.match(dotText, /^`\.`/m)
    assert.match(dotText, /Read commands from file/i)

    const colon = await openText(": foo")
    const colonText = await hoverText(colon, new vscode.Position(0, 0))
    assert.match(colonText, /^`:`/m)
    assert.match(colonText, /does nothing/i)
  })

  test("shows precommand modifier docs", async () => {
    const doc = await openText("noglob echo *.txt")
    const text = await hoverText(doc, new vscode.Position(0, 1))
    assert.match(text, /^`noglob`/m)
    assert.match(text, /precommand modifier/i)
    assert.match(text, /Filename generation \(globbing\) is not performed/i)
  })

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

  test("local function docs win over builtin docs", async () => {
    const doc = await openText(
      ["# local echo", "echo() {", "}", "echo hi"].join("\n"),
    )
    const text = await hoverText(doc, new vscode.Position(3, 1))
    assert.match(text, /local echo/)
    assert.doesNotMatch(text, /Write each arg on the standard output/i)
  })
})
