import { describe, expect, test } from "vitest"
import { extractSourcePaths } from "../doc-link"

describe("extractSourcePaths", () => {
  test.each([
    ["source ./lib.zsh", [{ path: "./lib.zsh", start: 7 }]],
    [". ./lib.zsh", [{ path: "./lib.zsh", start: 2 }]],
    ["source /etc/zsh/zshrc", [{ path: "/etc/zsh/zshrc", start: 7 }]],
    ["source $HOME/.zshrc", []],
    ["source ${ZDOTDIR}/.zshrc", []],
    ["# source ./lib.zsh", []],
    ["echo foo; source ./lib.zsh", [{ path: "./lib.zsh", start: 17 }]],
    ["echo hello", []],
  ])("%s", (src, want) => {
    expect(extractSourcePaths(src)).toEqual(want)
  })
})
