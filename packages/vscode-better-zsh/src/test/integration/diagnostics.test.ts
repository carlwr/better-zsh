import * as assert from "node:assert"
import * as vscode from "vscode"
import { ZSH_DIAGNOSTIC_SOURCE } from "../../ids"
import {
  hasZsh,
  openFixture,
  waitForDiagnostics,
  withBadZdotdir,
} from "./helpers"

async function editAndSave(doc: vscode.TextDocument) {
  const editor = await vscode.window.showTextDocument(doc)
  await editor.edit(b => b.insert(new vscode.Position(0, 0), " "))
  await editor.edit(b =>
    b.delete(
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
    ),
  )
  await doc.save()
}

suite("ZshDiagnostics", function () {
  this.timeout(15000)

  suiteSetup(function () {
    if (!hasZsh()) this.skip()
  })

  test("reports syntax error", async () => {
    const doc = await openFixture("syntax-error.zsh")
    await editAndSave(doc)
    const diags = await waitForDiagnostics(doc.uri, "some")
    assert.ok(diags.length > 0, "expected at least one diagnostic")
    assert.strictEqual(diags[0]?.source, ZSH_DIAGNOSTIC_SOURCE)
    assert.strictEqual(diags[0]?.severity, vscode.DiagnosticSeverity.Error)
  })

  test("no diagnostics for valid file", async () => {
    const doc = await openFixture("test.zsh")
    await editAndSave(doc)
    const diags = await waitForDiagnostics(doc.uri, "none")
    assert.strictEqual(diags.length, 0)
  })

  test("syntax check ignores user ZDOTDIR", async () => {
    await withBadZdotdir(async () => {
      const doc = await openFixture("test.zsh")
      await editAndSave(doc)
      const diags = await waitForDiagnostics(doc.uri, "none")
      assert.strictEqual(diags.length, 0)
    })
  })
})
