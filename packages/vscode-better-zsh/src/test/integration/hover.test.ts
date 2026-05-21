import * as assert from "node:assert"
import * as vscode from "vscode"
import { hoverText, openText } from "./helpers"

// Hover wiring through the VS Code API: each test asserts only that the right
// doc record is dispatched at the given cursor position and that the hover
// content mentions the head token. Rendering content and format are
// `@carlwr/zsh-core`'s concern, verified in its unit tests.

suite("ZshHoverProvider", () => {
  test("builtin command head", async () => {
    const doc = await openText("echo hi")
    assert.match(await hoverText(doc, new vscode.Position(0, 1)), /`echo`/)
  })

  test("punctuation builtins", async () => {
    const dot = await openText(". ./script.zsh")
    assert.match(await hoverText(dot, new vscode.Position(0, 0)), /`\.`/)
    const colon = await openText(": foo")
    assert.match(await hoverText(colon, new vscode.Position(0, 0)), /`:`/)
  })

  test("precommand modifier", async () => {
    const doc = await openText("noglob echo *.txt")
    assert.match(await hoverText(doc, new vscode.Position(0, 1)), /`noglob`/)
  })

  for (const [src, char, op] of [
    ["[[ 1 == 2 ]]", 5, "=="],
    ["[[ a && b ]]", 5, "&&"],
    ["[[ a || b ]]", 5, "||"],
    ["[[ a < b ]]", 5, "<"],
    ["[[ a > b ]]", 5, ">"],
    ["[[ ! -f x ]]", 3, "!"],
  ] as const) {
    test(`cond op in ${src}`, async () => {
      const doc = await openText(src)
      const text = await hoverText(doc, new vscode.Position(0, char))
      assert.ok(text.includes(`\`${op}\``), `hover should mention \`${op}\``)
    })
  }

  test("command-list && yields no hover", async () => {
    const doc = await openText("echo hi && echo bye")
    const hovers =
      (await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        doc.uri,
        new vscode.Position(0, 8),
      )) ?? []
    assert.strictEqual(hovers.length, 0)
  })

  test("option name resolves to option doc", async () => {
    const doc = await openText("setopt warn_nested_var")
    assert.match(
      await hoverText(doc, new vscode.Position(0, 10)),
      /WARN_NESTED_VAR/,
    )
  })

  test("short and long set forms resolve to options", async () => {
    const doc = await openText("set -e -o pipefail")
    assert.match(await hoverText(doc, new vscode.Position(0, 5)), /ERR_EXIT/)
    assert.match(await hoverText(doc, new vscode.Position(0, 12)), /PIPE_FAIL/)
  })

  test("local function docs win over builtin docs", async () => {
    const doc = await openText(
      ["# local echo", "echo() {", "}", "echo hi"].join("\n"),
    )
    // The user-defined echo's body contains the comment `# local echo`;
    // matching it confirms dispatch landed on the local function, not the
    // builtin.
    assert.match(await hoverText(doc, new vscode.Position(3, 1)), /local echo/)
  })
})
