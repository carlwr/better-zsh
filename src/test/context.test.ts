import { describe, expect, test } from "vitest"
import { syntacticContext } from "../context"

function mockDoc(lines: string[]) {
  return {
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    lineCount: lines.length,
  }
}

describe("syntacticContext", () => {
  test('setopt line → kind "setopt"', () => {
    const doc = mockDoc(["setopt extendedglob"])
    expect(syntacticContext(doc, 0, 10).kind).toBe("setopt")
  })

  test('unsetopt line → kind "setopt"', () => {
    const doc = mockDoc(["unsetopt beep"])
    expect(syntacticContext(doc, 0, 10).kind).toBe("setopt")
  })

  test('set -o line → kind "setopt"', () => {
    const doc = mockDoc(["set -o extendedglob"])
    expect(syntacticContext(doc, 0, 10).kind).toBe("setopt")
  })

  test('inside [[ ]] → kind "cond"', () => {
    const doc = mockDoc(["if [[ -f $file ]]; then"])
    expect(syntacticContext(doc, 0, 10).kind).toBe("cond")
  })

  test('inside [ ] → kind "cond"', () => {
    const doc = mockDoc(["if [ -f $file ]; then"])
    expect(syntacticContext(doc, 0, 9).kind).toBe("cond")
  })

  test('multiline [[ → kind "cond"', () => {
    const doc = mockDoc(["[[ -f foo &&", "  -d bar ]]"])
    expect(syntacticContext(doc, 1, 5).kind).toBe("cond")
  })

  test('[[ ]] already closed → kind "general"', () => {
    const doc = mockDoc(["[[ -f foo ]]", "echo done"])
    expect(syntacticContext(doc, 1, 5).kind).toBe("general")
  })

  test('inside (( )) → kind "arith"', () => {
    const doc = mockDoc(["if (( x > 0 )); then"])
    expect(syntacticContext(doc, 0, 8).kind).toBe("arith")
  })

  test('multiline (( → kind "arith"', () => {
    const doc = mockDoc(["(( a +", "   b ))"])
    expect(syntacticContext(doc, 1, 3).kind).toBe("arith")
  })

  test("(( )) closed → general", () => {
    const doc = mockDoc(["(( x + 1 ))", "echo done"])
    expect(syntacticContext(doc, 1, 5).kind).toBe("general")
  })

  test('plain line → kind "general"', () => {
    const doc = mockDoc(["echo hello"])
    expect(syntacticContext(doc, 0, 5).kind).toBe("general")
  })

  test("[[ inside quotes is not cond context", () => {
    const doc = mockDoc(["echo '[[' && do_stuff"])
    expect(syntacticContext(doc, 0, 18).kind).toBe("general")
  })

  test("(( inside quotes is not arith context", () => {
    const doc = mockDoc(['echo "((" && do_stuff'])
    expect(syntacticContext(doc, 0, 18).kind).toBe("general")
  })

  test("setopt with line continuation", () => {
    const doc = mockDoc(["setopt \\", "  extendedglob"])
    expect(syntacticContext(doc, 1, 5).kind).toBe("setopt")
  })
})
