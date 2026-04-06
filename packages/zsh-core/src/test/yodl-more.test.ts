import { describe, expect, test } from "vitest"
import { parseGlobOps } from "../yodl/glob-ops"
import { parseGlobbingFlags } from "../yodl/globbing-flags"
import { parseHistory } from "../yodl/history"
import { parseParamFlags } from "../yodl/param-flags"
import { parseProcessSubsts } from "../yodl/process-subst"
import { parseRedirections } from "../yodl/redirections"
import { parseReservedWords } from "../yodl/reserved-words"
import { parseSubscriptFlags } from "../yodl/subscript-flags"
import { expectDocCorpus, readVendoredYo } from "./yodl-test-util"

const EXPN_YO = readVendoredYo("expn.yo")
const GRAMMAR_YO = readVendoredYo("grammar.yo")
const PARAMS_YO = readVendoredYo("params.yo")
const REDIRECT_YO = readVendoredYo("redirect.yo")

describe("more yodl parsers", () => {
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
      known: ["< word", "<> word", ">> word", "&> word", "&>>! word"],
    })
  })

  test("vendored reserved words corpus parses", () => {
    expectDocCorpus({
      docs: parseReservedWords(GRAMMAR_YO),
      minCount: 25,
      keyOf: (doc) => doc.name,
      descOf: (doc) => doc.desc,
      known: ["if", "nocorrect", "[[", "{", "}"],
    })
  })

  test("vendored subscript flag corpus parses", () => {
    expectDocCorpus({
      docs: parseSubscriptFlags(PARAMS_YO),
      minCount: 10,
      keyOf: (doc) => doc.flag,
      descOf: (doc) => doc.desc,
      known: ["w", "s:string:", "n:expr:", "R"],
    })
  })

  test("vendored parameter flag corpus parses", () => {
    expectDocCorpus({
      docs: parseParamFlags(EXPN_YO),
      minCount: 40,
      keyOf: (doc) => doc.sig,
      descOf: (doc) => doc.desc,
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
      known: ["*", "[...]", "@(...)", "x|y", "x##"],
    })
  })

  test("vendored glob flag corpus parses", () => {
    expectDocCorpus({
      docs: parseGlobbingFlags(EXPN_YO),
      minCount: 10,
      keyOf: (doc) => doc.sig,
      descOf: (doc) => doc.desc,
      known: ["i", "I", "b", "m", "cN,M"],
    })
  })
})
