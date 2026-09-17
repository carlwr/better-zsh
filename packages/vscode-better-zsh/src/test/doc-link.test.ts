import { basename, dirname, join } from "node:path"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { DocLinkProvider, extractSourcePaths } from "../editor/doc-link"
import { lineDoc } from "./test-util"

describe("extractSourcePaths", () => {
  test.each([
    ["source ./lib.zsh", [{ path: "./lib.zsh", start: 7 }]],
    [". ./lib.zsh", [{ path: "./lib.zsh", start: 2 }]],
    ["source /etc/zsh/zshrc", [{ path: "/etc/zsh/zshrc", start: 7 }]],
    ['source "./my lib.zsh"', [{ path: "./my lib.zsh", start: 8 }]],
    ["source ./lib.zsh; echo", [{ path: "./lib.zsh", start: 7 }]],
    ["source './lib.zsh'", [{ path: "./lib.zsh", start: 8 }]],
    ["source $HOME/.zshrc", []],
    ["source ${ZDOTDIR}/.zshrc", []],
    ["# source ./lib.zsh", []],
    ["echo foo; source ./lib.zsh", [{ path: "./lib.zsh", start: 17 }]],
    ["source ce", [{ path: "ce", start: 7 }]],
    ["echo hello", []],
  ])("%s", (src, want) => {
    expect(extractSourcePaths(src)).toEqual(want)
  })

  test("each path sits at its reported column, after `source`/`.`, outside comments", () => {
    const word = fc.stringMatching(/^[\w./-]{1,6}$/)
    const chunk = fc.oneof(
      word,
      word.map(w => `source ${w}`),
      word.map(w => `. ${w}`),
      fc.constant("# tail"),
    )
    fc.assert(
      fc.property(fc.array(chunk, { maxLength: 5 }), chunks => {
        const line = chunks.join(" ")
        const cut = line.indexOf("#") < 0 ? line.length : line.indexOf("#")
        for (const { path, start } of extractSourcePaths(line)) {
          expect(line.slice(start, start + path.length)).toBe(path)
          expect(line.slice(0, start)).toMatch(/(?:^|\s)(?:source|\.)\s+$/)
          expect(start + path.length).toBeLessThanOrEqual(cut)
        }
      }),
    )
  })
})

describe("DocLinkProvider", () => {
  const provider = new DocLinkProvider()
  const docAt = (fsPath: string, scheme: string, text: string) =>
    ({
      ...lineDoc(text),
      uri: { scheme, fsPath, toString: () => `${scheme}://${fsPath}` },
    }) as vscode.TextDocument

  test("links existing targets, relative to the document; file documents only", () => {
    const here = __filename
    const text = `source ./${basename(here)}\nsource ./missing.zsh\nsource ${here}`
    const links = provider.provideDocumentLinks(docAt(here, "file", text))
    expect(
      links.map(l => [
        l.range.start.line,
        (l.target as { fsPath: string }).fsPath,
      ]),
    ).toEqual([
      [0, join(dirname(here), basename(here))],
      [2, here],
    ])
    expect(
      provider.provideDocumentLinks(docAt(here, "untitled", text)),
    ).toEqual([])
  })
})
