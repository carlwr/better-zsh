import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveZshDataDir, vendoredZshDocFiles } from "../data-dir"
import { loadCorpus } from "../docs/corpus"
import { mkDocumented_ } from "./id-fns"

const dataDir = resolveZshDataDir()
const opt = mkDocumented_("option")
const cond = mkDocumented_("cond_op")
const bi = mkDocumented_("builtin")
const rw = mkDocumented_("reserved_word")

describe("vendored zsh data assets", () => {
  test("ships the full doc set expected by runtime and packaging", () => {
    for (const name of vendoredZshDocFiles) {
      const path = join(dataDir, name)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, "utf8").trim().length).toBeGreaterThan(0)
    }
  })

  test("parses vendored options and conditional operators", () => {
    const corpus = loadCorpus()
    expect(corpus.option.size).toBeGreaterThan(0)
    expect(corpus.cond_op.size).toBeGreaterThan(0)
    expect(corpus.option.has(opt("AUTO_CD"))).toBe(true)
    expect(corpus.cond_op.has(cond("=="))).toBe(true)
  })

  test("parses vendored builtins docs", () => {
    const corpus = loadCorpus()
    expect(corpus.builtin.size).toBeGreaterThan(0)

    const autoload = corpus.builtin.get(bi("autoload"))
    expect(autoload).toBeTruthy()
    expect(autoload?.synopsis.length).toBeGreaterThan(0)
    expect(autoload?.desc.length).toBeGreaterThan(0)
    expect(corpus.builtin.has(bi("bindkey"))).toBe(true)
    expect(corpus.builtin.has(bi("ARG1"))).toBe(false)
  })

  test("parses vendored precommand modifier docs", () => {
    const corpus = loadCorpus()
    expect([...corpus.precmd.values()].map(doc => doc.name)).toEqual([
      "-",
      "builtin",
      "command",
      "exec",
      "nocorrect",
      "noglob",
    ])
  })

  test("parses newly vendored structured syntax docs", () => {
    const corpus = loadCorpus()
    expect([...corpus.redir.values()].some(doc => doc.groupOp === "<")).toBe(
      true,
    )
    expect(corpus.reserved_word.has(rw("if"))).toBe(true)
    expect(
      [...corpus.shell_param.values()].some(doc => doc.name === "SECONDS"),
    ).toBe(true)
    expect(
      [...corpus.subscript_flag.values()].some(doc => doc.flag === "w"),
    ).toBe(true)
    expect([...corpus.param_flag.values()].some(doc => doc.flag === "@")).toBe(
      true,
    )
    expect([...corpus.history.values()].some(doc => doc.key === "!!")).toBe(
      true,
    )
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
      [...corpus.param_expn.values()].some(
        doc => (doc.sig as string) === "${name:-word}",
      ),
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
