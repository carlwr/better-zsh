import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveZshDataDir, vendoredZshDocFiles } from "../assets/data-dir"
import { loadLexicon } from "../docs/lexicon"
import { yodlSourceFiles } from "../docs/source-files"
import { mkDocumented_ } from "./id-fns"

const dataDir = resolveZshDataDir()
const lexicon = loadLexicon()
const opt = mkDocumented_("option")
const cond = mkDocumented_("conditional_op")
const bi = mkDocumented_("builtin")
const rw = mkDocumented_("reserved_word")

describe("vendored zsh data assets", () => {
  test("runtime Yodl list matches lexicon loader sources", () => {
    expect(vendoredZshDocFiles.filter(f => f.endsWith(".yo")).sort()).toEqual(
      yodlSourceFiles,
    )
  })

  test("vendored file list is exactly the data dir's contents, none empty", () => {
    expect([...vendoredZshDocFiles].sort()).toEqual(readdirSync(dataDir).sort())
    for (const name of vendoredZshDocFiles) {
      expect(readFileSync(join(dataDir, name), "utf8").trim()).not.toBe("")
    }
  })

  test("parses vendored options and conditional operators", () => {
    expect(lexicon.option.size).toBeGreaterThan(0)
    expect(lexicon.conditional_op.size).toBeGreaterThan(0)
    expect(lexicon.option.has(opt("AUTO_CD"))).toBe(true)
    expect(lexicon.conditional_op.has(cond("=="))).toBe(true)
  })

  test("parses vendored builtins docs", () => {
    expect(lexicon.builtin.size).toBeGreaterThan(0)
    const autoload = lexicon.builtin.get(bi("autoload"))
    expect(autoload?.synopsis.length).toBeGreaterThan(0)
    expect(autoload?.desc.length).toBeGreaterThan(0)
    expect(lexicon.builtin.has(bi("bindkey"))).toBe(true)
    // macro template placeholder name must not leak
    expect(lexicon.builtin.has(bi("ARG1"))).toBe(false)
  })

  test("parses newly vendored structured syntax docs", () => {
    expect(
      [...lexicon.redirection.values()].some(doc => doc.groupOp === "<"),
    ).toBe(true)
    expect(lexicon.reserved_word.has(rw("if"))).toBe(true)
    expect(
      [...lexicon.special_param.values()].some(doc => doc.id === "SECONDS"),
    ).toBe(true)
    expect(
      [...lexicon.subscript_flag.values()].some(doc => doc.id === "w"),
    ).toBe(true)
    expect(
      [...lexicon.param_expn_flag.values()].some(doc => doc.id === "@"),
    ).toBe(true)
    expect(
      [...lexicon.history_expn.values()].some(doc => doc.id === "!!"),
    ).toBe(true)
    expect([...lexicon.glob_op.values()].some(doc => doc.id === "*")).toBe(true)
    expect([...lexicon.glob_flag.values()].some(doc => doc.id === "i")).toBe(
      true,
    )
    expect([...lexicon.process_subst.values()].map(doc => doc.id)).toEqual([
      "<(...)",
      ">(...)",
      "=(...)",
    ])
    expect(
      [...lexicon.param_expn.values()].some(doc => doc.sig === "${name:-word}"),
    ).toBe(true)
    expect(
      [...lexicon.prompt_escape.values()].some(doc => doc.id === "%n"),
    ).toBe(true)
    expect(
      [...lexicon.zle_widget.values()].some(
        doc => doc.id === "backward-kill-word",
      ),
    ).toBe(true)
  })
})
