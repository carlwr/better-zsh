import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveZshDataDir, vendoredZshDocFiles } from "../assets/data-dir"
import { loadCorpus } from "../docs/corpus"
import { corpusYodlFiles } from "../docs/source-files"
import { precmdNames } from "../docs/types"
import { mkDocumented_ } from "./id-fns"

const dataDir = resolveZshDataDir()
const corpus = loadCorpus()
const opt = mkDocumented_("option")
const cond = mkDocumented_("conditional_op")
const bi = mkDocumented_("builtin")
const rw = mkDocumented_("reserved_word")

describe("vendored zsh data assets", () => {
  test("runtime Yodl list matches corpus loader sources", () => {
    expect(vendoredZshDocFiles.filter(f => f.endsWith(".yo")).sort()).toEqual(
      corpusYodlFiles,
    )
  })

  test("ships the full doc set expected by runtime and packaging", () => {
    for (const name of vendoredZshDocFiles) {
      const path = join(dataDir, name)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, "utf8").trim().length).toBeGreaterThan(0)
    }
  })

  test("parses vendored options and conditional operators", () => {
    expect(corpus.option.size).toBeGreaterThan(0)
    expect(corpus.conditional_op.size).toBeGreaterThan(0)
    expect(corpus.option.has(opt("AUTO_CD"))).toBe(true)
    expect(corpus.conditional_op.has(cond("=="))).toBe(true)
  })

  test("parses vendored builtins docs", () => {
    expect(corpus.builtin.size).toBeGreaterThan(0)
    const autoload = corpus.builtin.get(bi("autoload"))
    expect(autoload?.synopsis.length).toBeGreaterThan(0)
    expect(autoload?.desc.length).toBeGreaterThan(0)
    expect(corpus.builtin.has(bi("bindkey"))).toBe(true)
    // macro template placeholder name must not leak
    expect(corpus.builtin.has(bi("ARG1"))).toBe(false)
  })

  test("parses vendored precommand modifier docs", () => {
    expect(
      [...corpus.precmd_modifier.values()].map(doc => doc.name).sort(),
    ).toEqual([...precmdNames].sort())
  })

  test("parses newly vendored structured syntax docs", () => {
    expect(
      [...corpus.redirection.values()].some(doc => doc.groupOp === "<"),
    ).toBe(true)
    expect(corpus.reserved_word.has(rw("if"))).toBe(true)
    expect(
      [...corpus.special_param.values()].some(doc => doc.name === "SECONDS"),
    ).toBe(true)
    expect(
      [...corpus.subscript_flag.values()].some(doc => doc.flag === "w"),
    ).toBe(true)
    expect(
      [...corpus.param_expn_flag.values()].some(doc => doc.flag === "@"),
    ).toBe(true)
    expect(
      [...corpus.history_expn.values()].some(doc => doc.key === "!!"),
    ).toBe(true)
    expect([...corpus.glob_op.values()].some(doc => doc.op === "*")).toBe(true)
    expect([...corpus.glob_flag.values()].some(doc => doc.flag === "i")).toBe(
      true,
    )
    expect([...corpus.process_subst.values()].map(doc => doc.op)).toEqual([
      "<(...)",
      ">(...)",
      "=(...)",
    ])
    expect(
      [...corpus.param_expn.values()].some(doc => doc.sig === "${name:-word}"),
    ).toBe(true)
    expect(
      [...corpus.prompt_escape.values()].some(doc => doc.key === "%n"),
    ).toBe(true)
    expect(
      [...corpus.zle_widget.values()].some(
        doc => doc.name === "backward-kill-word",
      ),
    ).toBe(true)
  })
})
