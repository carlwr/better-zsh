import * as assert from "node:assert"
import * as vscode from "vscode"
import {
  BETTER_ZSH_TEST_GET_LOGS,
  BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS,
} from "../../ids"
import {
  completionLabels,
  hoverText,
  openFixture,
  openText,
  waitForDiagnostics,
} from "../integration/helpers"

const caseName = process.env.BETTER_ZSH_MATRIX_CASE ?? "unknown"
const expectRuntime = process.env.BETTER_ZSH_MATRIX_EXPECT_RUNTIME === "true"
const logSubstr = process.env.BETTER_ZSH_MATRIX_LOG_SUBSTR ?? ""

async function semanticTokenWords(doc: vscode.TextDocument) {
  const data =
    (await vscode.commands.executeCommand<number[]>(
      BETTER_ZSH_TEST_GET_SEMANTIC_TOKENS,
      doc.uri,
    )) ?? []
  let line = 0
  let start = 0
  const out: { word: string; type: number }[] = []
  for (let i = 0; i < data.length; i += 5) {
    const dLine = data[i] ?? 0
    const dStart = data[i + 1] ?? 0
    const len = data[i + 2] ?? 0
    const type = data[i + 3] ?? 0
    line += dLine
    start = dLine === 0 ? start + dStart : dStart
    out.push({ word: doc.lineAt(line).text.slice(start, start + len), type })
  }
  return out
}

async function waitForLog(substr: string, timeout = 6000) {
  const getLogs = () =>
    vscode.commands.executeCommand<string[]>(BETTER_ZSH_TEST_GET_LOGS)
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const logs = (await getLogs()) ?? []
    if (logs.some(l => l.includes(substr))) return logs
    await new Promise(r => setTimeout(r, 100))
  }
  return (await getLogs()) ?? []
}

suite(`ZshPathMatrix:${caseName}`, function () {
  this.timeout(20000)

  test("keeps static features and gates runtime-zsh features at activation", async () => {
    // Static completions always; file-token completions gated on runtime zsh
    const compDoc = await openFixture("test.zsh")
    const labels = await completionLabels(compDoc, new vscode.Position(0, 0))
    assert.ok(labels.includes("echo"), "expected static builtin completion")
    assert.strictEqual(
      labels.includes("some-func"),
      expectRuntime,
      "unexpected file-token completion availability",
    )

    // Static hover always works
    const hDoc = await openText("print $SECONDS")
    const h = await hoverText(hDoc, new vscode.Position(0, 8))
    assert.match(h, /^`SECONDS`/m)

    // Semantic tokens always work (static analysis, no zsh needed)
    const semDoc = await openText("echo hi")
    const tokens = await semanticTokenWords(semDoc)
    assert.ok(
      tokens.some(t => t.word === "echo" && t.type === 0),
      "expected builtin semantic token",
    )

    // Diagnostics gated on runtime zsh
    const diagDoc = await openFixture("syntax-error.zsh")
    const diags = await waitForDiagnostics(
      diagDoc.uri,
      expectRuntime ? "some" : "none",
    )
    assert.strictEqual(
      diags.length > 0,
      expectRuntime,
      "unexpected zsh diagnostic availability",
    )

    // Extension logged the expected resolution message
    const logs = await waitForLog(logSubstr)
    assert.ok(
      logs.some(l => l.includes(logSubstr)),
      `expected log containing: ${logSubstr}`,
    )
  })
})
