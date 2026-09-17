import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import * as vscode from "vscode"
import { setupDiagnostics } from "../editor/diagnostics"
import { ZSH_DIAGNOSTIC_SOURCE, ZSH_LANG_ID } from "../ids"
import type { ZshCheckResult } from "../zsh"
import { stub } from "./vscode-stub"

const check = vi.hoisted(() => vi.fn<() => Promise<ZshCheckResult>>())
vi.mock("../zsh", () => ({ zshCheck: check }))

function doc(name: string, text = "echo hi", languageId: string = ZSH_LANG_ID) {
  return {
    uri: vscode.Uri.file(`/${name}`),
    languageId,
    version: 1,
    isClosed: false,
    getText: () => text,
    lineCount: text.split("\n").length,
    lineAt: (i: number) => ({ range: new vscode.Range(i, 0, i, 99) }),
  }
}

const collection = () => {
  const c = (
    vscode.languages as unknown as { last: vscode.DiagnosticCollection }
  ).last
  return c as unknown as { byUri: Map<string, vscode.Diagnostic[]> }
}

beforeEach(() => {
  vi.useFakeTimers()
  stub.reset()
  check.mockReset()
})
afterEach(() => vi.useRealTimers())

const flush = () => vi.advanceTimersByTimeAsync(600)

describe("diagnostics", () => {
  test("open documents are checked at setup; an error lands on its line, clamped, tagged", async () => {
    const d = doc("a", "echo\n}\n")
    stub.fire("open", d) // no listener yet: ignored
    stub.openDocs(d)
    check.mockResolvedValue({ kind: "error", line: 9, msg: "parse error" })
    setupDiagnostics()
    await flush()
    const diags = collection().byUri.get(d.uri.toString())
    expect(
      diags?.map(x => [x.range.start.line, x.message, x.source, x.severity]),
    ).toEqual([
      [
        2,
        "parse error",
        ZSH_DIAGNOSTIC_SOURCE,
        vscode.DiagnosticSeverity.Error,
      ],
    ])
  })

  test("edits are debounced into one check; ok and unavailable clear", async () => {
    const d = doc("b")
    check.mockResolvedValue({ kind: "error", line: 1, msg: "e" })
    setupDiagnostics()
    stub.fire("open", d)
    await flush()
    expect(collection().byUri.get(d.uri.toString())).toHaveLength(1)

    check.mockResolvedValue({ kind: "ok" })
    stub.fire("change", { document: d })
    stub.fire("change", { document: d })
    stub.fire("change", { document: d })
    expect(check).toHaveBeenCalledTimes(1)
    await flush()
    expect(check).toHaveBeenCalledTimes(2)
    expect(collection().byUri.get(d.uri.toString())).toEqual([])

    check.mockResolvedValue({ kind: "unavailable" })
    stub.fire("save", d)
    await flush()
    expect(collection().byUri.get(d.uri.toString())).toEqual([])
  })

  test("a result for a closed or since-edited document is dropped", async () => {
    const d = doc("c")
    let resolve!: (r: ZshCheckResult) => void
    check.mockImplementation(() => new Promise(r => (resolve = r)))
    setupDiagnostics()
    stub.fire("open", d)
    d.version = 2
    resolve({ kind: "error", line: 1, msg: "stale" })
    await flush()
    expect(collection().byUri.has(d.uri.toString())).toBe(false)

    stub.fire("save", d)
    d.isClosed = true
    stub.fire("close", d)
    resolve({ kind: "error", line: 1, msg: "stale" })
    await flush()
    expect(collection().byUri.has(d.uri.toString())).toBe(false)
  })

  test("non-zsh and virtual documents are ignored; disabling clears", async () => {
    const plain = doc("d", "x", "plaintext")
    const virtual = {
      ...doc("e"),
      uri: { scheme: "git", toString: () => "git:/e" },
    }
    const real = doc("f")
    stub.openDocs(plain, virtual, real)
    check.mockResolvedValue({ kind: "error", line: 1, msg: "e" })
    setupDiagnostics()
    stub.fire("change", { document: plain })
    stub.fire("change", { document: virtual })
    await flush()
    expect(check).toHaveBeenCalledTimes(1)
    expect([...collection().byUri.keys()]).toEqual([real.uri.toString()])

    stub.config.set("betterZsh.diagnostics.enabled", false)
    stub.fire("config", {
      affectsConfiguration: (k: string) =>
        k === "betterZsh.diagnostics.enabled",
    })
    await flush()
    expect(collection().byUri.get(real.uri.toString())).toEqual([])
    expect(check).toHaveBeenCalledTimes(1)
  })
})
