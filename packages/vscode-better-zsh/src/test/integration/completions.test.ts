import * as assert from "node:assert"
import * as vscode from "vscode"
import { completionLabels, openFixture, openText } from "./helpers"

suite("ZshCompletions", () => {
  test("includes static builtin completions", async () => {
    const doc = await openFixture("test.zsh")
    const labels = await completionLabels(doc, new vscode.Position(0, 0))
    assert.ok(labels.includes("echo"), "expected builtin 'echo' in completions")
  })

  test("includes the file's functions and parameters", async () => {
    const doc = await openFixture("test.zsh")
    const labels = await completionLabels(doc, new vscode.Position(0, 0))
    for (const name of ["some-func", "some_param", "other_param"])
      assert.ok(labels.includes(name), `expected '${name}' in completions`)
  })

  test("offers conditional operators inside [ ]", async () => {
    const doc = await openText("[ ")
    const labels = await completionLabels(doc, new vscode.Position(0, 2))
    assert.ok(labels.includes("-f"), "expected conditional operator '-f'")
    assert.ok(labels.includes("=="), "expected conditional operator '=='")
  })
})
