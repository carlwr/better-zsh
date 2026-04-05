import * as assert from "node:assert"
import * as vscode from "vscode"
import { hasZsh, openFixture, withBadZdotdir } from "./helpers"

async function waitForDiagnostics(
  uri: vscode.Uri,
  timeout = 5000,
): Promise<vscode.Diagnostic[]> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const diags = vscode.languages.getDiagnostics(uri)
    if (diags.length > 0) return diags
    await new Promise((r) => setTimeout(r, 100))
  }
  return vscode.languages.getDiagnostics(uri)
}

function zshDiagnostics(uri: vscode.Uri) {
  return vscode.languages.getDiagnostics(uri).filter((d) => d.source === "zsh")
}

async function waitForNoZshDiagnostics(
  uri: vscode.Uri,
  timeout = 5000,
  stable = 500,
): Promise<vscode.Diagnostic[]> {
  const start = Date.now()
  let clearSince: number | undefined
  while (Date.now() - start < timeout) {
    const diags = zshDiagnostics(uri)
    if (diags.length === 0) {
      clearSince ??= Date.now()
      if (Date.now() - clearSince >= stable) return diags
    } else {
      clearSince = undefined
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return zshDiagnostics(uri)
}

async function editAndSave(doc: vscode.TextDocument) {
  const editor = await vscode.window.showTextDocument(doc)
  await editor.edit((b) => b.insert(new vscode.Position(0, 0), " "))
  await editor.edit((b) =>
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
    const diags = await waitForDiagnostics(doc.uri)
    assert.ok(diags.length > 0, "expected at least one diagnostic")
    assert.strictEqual(diags[0]?.source, "zsh")
    assert.strictEqual(diags[0]?.severity, vscode.DiagnosticSeverity.Error)
  })

  test("no diagnostics for valid file", async () => {
    const doc = await openFixture("test.zsh")
    await editAndSave(doc)
    const zshDiags = await waitForNoZshDiagnostics(doc.uri)
    assert.strictEqual(zshDiags.length, 0)
  })

  test("syntax check ignores user ZDOTDIR", async () => {
    await withBadZdotdir(async () => {
      const doc = await openFixture("test.zsh")
      await editAndSave(doc)
      const zshDiags = await waitForNoZshDiagnostics(doc.uri)
      assert.strictEqual(zshDiags.length, 0)
    })
  })
})
