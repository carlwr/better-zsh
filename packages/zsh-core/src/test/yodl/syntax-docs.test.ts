import { describe, expect, test } from "vitest"
import {
  mkGlobbingFlag,
  mkGlobOp,
  mkHistoryKey,
  mkParamFlag,
  mkRedirOp,
  mkShellParamName,
  mkSubscriptFlag,
} from "../../types/brand"
import { parseGlobOps } from "../../yodl/docs/glob-ops"
import { parseGlobbingFlags } from "../../yodl/docs/globbing-flags"
import { parseHistory } from "../../yodl/docs/history"
import { parseParamFlags } from "../../yodl/docs/param-flags"
import { parseProcessSubsts } from "../../yodl/docs/process-substs"
import { parseRedirections } from "../../yodl/docs/redirections"
import { parseReservedWords } from "../../yodl/docs/reserved-words"
import { parseShellParams } from "../../yodl/docs/shell-params"
import { parseSubscriptFlags } from "../../yodl/docs/subscript-flags"
import { expectDocCorpus, readVendoredYo } from "./test-util"

const EXPN_YO = readVendoredYo("expn.yo")
const GRAMMAR_YO = readVendoredYo("grammar.yo")
const PARAMS_YO = readVendoredYo("params.yo")
const REDIRECT_YO = readVendoredYo("redirect.yo")

describe("more yodl parsers", () => {
  test("shell params keep tied pairs and xitem aliases with shared docs", () => {
    const yo = [
      "sect(Parameters Set By The Shell)",
      "startitem()",
      "vindex(path)",
      "vindex(PATH)",
      "item(tt(path) <S> <Z> (tt(PATH) <S>))(Pair docs.)",
      "vindex(RPROMPT)",
      "xitem(tt(RPROMPT) <S>)",
      "vindex(RPS1)",
      "item(tt(RPS1) <S>)(Prompt docs.)",
      "enditem()",
    ].join("\n")
    const docs = new Map(parseShellParams(yo).map((doc) => [doc.name, doc]))
    expect(docs.get(mkShellParamName("path"))?.tied).toBe(
      mkShellParamName("PATH"),
    )
    expect(docs.get(mkShellParamName("PATH"))?.tied).toBe(
      mkShellParamName("path"),
    )
    expect(docs.get(mkShellParamName("path"))?.desc).toBe("Pair docs.")
    expect(docs.get(mkShellParamName("RPS1"))?.desc).toBe("Prompt docs.")
    expect(docs.get(mkShellParamName("RPROMPT"))?.desc).toBe("Prompt docs.")
  })

  test("redirections keep xitem aliases with shared docs", () => {
    const yo = `startitem()
xitem(tt(>|) var(word))
item(tt(>!) var(word))(
Force clobber.
)
enditem()`
    const docs = parseRedirections(yo)
    expect(docs.map((doc) => doc.op)).toEqual([">!", ">|"])
    expect(docs[0]?.desc).toBe("Force clobber.")
    expect(docs[1]?.desc).toBe("Force clobber.")
  })

  test("redirection op is a grouping key, not a unique identity", () => {
    const docs = parseRedirections(REDIRECT_YO)
    expect(docs.filter((doc) => doc.op === ">&").map((doc) => doc.sig)).toEqual(
      [">& number", ">& -", ">& p", ">& word"],
    )
    expect(docs.filter((doc) => doc.op === "<&").map((doc) => doc.sig)).toEqual(
      ["<& number", "<& -", "<& p"],
    )
  })

  test("reserved words include command-position and any-position forms", () => {
    const docs = new Map(
      parseReservedWords(GRAMMAR_YO).map((doc) => [doc.name, doc]),
    )
    expect(docs.get("if")?.pos).toBe("command")
    expect(docs.get("[[")?.pos).toBe("command")
    expect(docs.get("}")?.pos).toBe("any")
  })

  test("process substitution exports the three canonical forms", () => {
    expect(parseProcessSubsts(EXPN_YO).map((doc) => doc.op)).toEqual([
      "<(...)",
      ">(...)",
      "=(...)",
    ])
  })

  test("vendored redirections corpus parses", () => {
    expectDocCorpus({
      docs: parseRedirections(REDIRECT_YO),
      minCount: 18,
      keyOf: (doc) => doc.sig,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: ["< word", "<> word", ">> word", "&> word", "&>>! word"],
    })
  })

  test("vendored reserved words corpus parses", () => {
    expectDocCorpus({
      docs: parseReservedWords(GRAMMAR_YO),
      minCount: 25,
      keyOf: (doc) => doc.name,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: ["if", "nocorrect", "[[", "{", "}"],
    })
  })

  test("vendored subscript flag corpus parses", () => {
    expectDocCorpus({
      docs: parseSubscriptFlags(PARAMS_YO),
      minCount: 10,
      keyOf: (doc) => doc.flag,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: ["w", "s:string:", "n:expr:", "R"],
    })
  })

  test("vendored shell-parameter corpus parses", () => {
    expectDocCorpus({
      docs: parseShellParams(PARAMS_YO),
      minCount: 80,
      keyOf: (doc) => doc.name,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: ["SECONDS", "argv", "path", "PATH", "reply", "zsh_eval_context"],
    })
  })

  test("vendored parameter flag corpus parses", () => {
    expectDocCorpus({
      docs: parseParamFlags(EXPN_YO),
      minCount: 40,
      keyOf: (doc) => doc.sig,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: [
        "@",
        "g:opts:",
        "j:string:",
        "l:expr::string1::string2:",
        "Z:opts:",
      ],
    })
  })

  test("vendored history corpus parses", () => {
    expectDocCorpus({
      docs: parseHistory(EXPN_YO),
      minCount: 30,
      keyOf: (doc) => `${doc.kind}:${doc.key}`,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: [
        "event-designator:!!",
        "event-designator:!n",
        "word-designator:0",
        "word-designator:x-",
        "modifier:a",
        "modifier:s/l/r[/]",
      ],
    })
  })

  test("vendored glob operator corpus parses", () => {
    expectDocCorpus({
      docs: parseGlobOps(EXPN_YO),
      minCount: 12,
      keyOf: (doc) => doc.op,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: ["*", "[...]", "@(...)", "x|y", "x##"],
    })
  })

  test("vendored glob flag corpus parses", () => {
    expectDocCorpus({
      docs: parseGlobbingFlags(EXPN_YO),
      minCount: 10,
      keyOf: (doc) => doc.sig,
      descOf: (doc) => doc.desc,
      sectionOf: (doc) => doc.section,
      known: ["i", "I", "b", "m", "cN,M"],
    })
  })

  test("normalized syntax-doc identity fields are idempotent", () => {
    for (const doc of parseRedirections(REDIRECT_YO))
      expect(mkRedirOp(doc.op)).toBe(doc.op)
    for (const doc of parseShellParams(PARAMS_YO))
      expect(mkShellParamName(doc.name)).toBe(doc.name)
    for (const doc of parseSubscriptFlags(PARAMS_YO))
      expect(mkSubscriptFlag(doc.flag)).toBe(doc.flag)
    for (const doc of parseParamFlags(EXPN_YO))
      expect(mkParamFlag(doc.flag)).toBe(doc.flag)
    for (const doc of parseHistory(EXPN_YO))
      expect(mkHistoryKey(doc.key)).toBe(doc.key)
    for (const doc of parseGlobOps(EXPN_YO))
      expect(mkGlobOp(doc.op)).toBe(doc.op)
    for (const doc of parseGlobbingFlags(EXPN_YO))
      expect(mkGlobbingFlag(doc.flag)).toBe(doc.flag)
  })
})
