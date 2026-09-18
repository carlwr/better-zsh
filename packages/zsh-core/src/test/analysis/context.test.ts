import { describe, expect, test } from "vitest"
import { syntacticContext } from "../../analysis/context"
import { analyzeDoc, lineStarts, offsetAt } from "../../analysis/facts"
import { mockDoc } from "./test-util"

const contextAt = (lines: readonly string[], line: number, char: number) => {
  const doc = mockDoc(lines)
  return syntacticContext(
    analyzeDoc(doc),
    offsetAt(lineStarts(doc), line, char),
  )
}

describe("syntacticContext", () => {
  test.each([
    ["setopt line", ["setopt autocd"], 0, 10, "setopt"],
    ["unsetopt line", ["unsetopt beep"], 0, 10, "setopt"],
    ["set -o line", ["set -o autocd"], 0, 10, "setopt"],
    ["inside [[]]", ["if [[ -f $file ]];"], 0, 10, "cond"],
    ["inside []", ["if [ -f $file ]; then"], 0, 9, "cond"],
    ["multiline [[", ["[[ -f F &&", " -d D/ ]]"], 1, 5, "cond"],
    ["[[]] closed", ["[[ -f F ]]", "echo done"], 1, 5, "general"],
    ["inside (())", ["if (( x > 0 )); then"], 0, 8, "arith"],
    ["multiline ((", ["(( a +", "   b ))"], 1, 3, "arith"],
    ["plain line", ["echo hello"], 0, 5, "general"],
    ["(()) closed", ["((x+1))", "echo done"], 1, 5, "general"],
    ['after "[ "', ["[ "], 0, 2, "cond"],
    ["quoted [[", ["echo '[[' && do_stuff"], 0, 18, "general"],
    ["quoted ((", ["echo '((' && do_stuff"], 0, 18, "general"],
    ["setopt cont.", ["setopt \\", "  autocd"], 1, 5, "setopt"],
    ["set +o line", ["set +o extendedglob"], 0, 10, "setopt"],
    ["set flags line", ["set -e -o pipefail"], 0, 12, "setopt"],
    ["setopt after command", ["command setopt extendedglob"], 0, 20, "general"],
    ["setopt as argument", ["echo setopt"], 0, 8, "general"],
    ["set without -o", ["set extendedglob"], 0, 10, "general"],
  ])('%s → kind "%s"', (_desc, lines, lineOffs, charOffs, kind) => {
    expect(contextAt(lines, lineOffs, charOffs).kind).toBe(kind)
  })
})
