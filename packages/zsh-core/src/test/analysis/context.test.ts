import { describe, expect, test } from "vitest"
import { syntacticContext } from "../../analysis/context"
import { mockDoc } from "./test-util"

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
  ])('%s → kind "%s"', (_desc, lines, lineOffs, charOffs, kind) => {
    expect(syntacticContext(mockDoc(lines), lineOffs, charOffs).kind).toBe(kind)
  })
})
