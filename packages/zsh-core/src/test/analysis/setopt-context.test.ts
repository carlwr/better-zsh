import { describe, expect, test } from "vitest"
import { isSetoptContext } from "../../analysis/setopt-context"
import { doc } from "./test-util"

describe("isSetoptContext", () => {
  test.each([
    ["setopt extendedglob", 0, true],
    ["unsetopt extendedglob", 0, true],
    ["builtin setopt extendedglob", 0, true],
    ["setopt \\\n  errreturn \\\n  extendedglob", 2, true],
    ["setopt \\\n  errreturn", 1, true],
    ["set -o extendedglob", 0, true],
    ["set +o extendedglob", 0, true],
    ["set -e -o pipefail", 0, true],
    ["echo setopt", 0, false],
    ["command setopt extendedglob", 0, false],
    ["echo hello", 0, false],
    ["set extendedglob", 0, false],
    ["", 0, false],
  ] as const)("%s @%d → %s", (text, line, want) => {
    expect(isSetoptContext(doc(text), line)).toBe(want)
  })
})
