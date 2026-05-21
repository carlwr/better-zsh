import { describe, expect, test } from "vitest"
import { mkRedirOp } from "../../docs/types"
import { parseComplexCommands } from "../../docs/yodl/extractors/complex-commands"
import { parseGlobFlags } from "../../docs/yodl/extractors/glob-flags"
import { parseGlobOps } from "../../docs/yodl/extractors/glob-ops"
import { parseGlobQualifiers } from "../../docs/yodl/extractors/glob-qualifiers"
import { parseHistory } from "../../docs/yodl/extractors/history"
import { parseParamFlags } from "../../docs/yodl/extractors/param-flags"
import { parseProcessSubsts } from "../../docs/yodl/extractors/process-substs"
import { parsePromptEscapes } from "../../docs/yodl/extractors/prompt-escapes"
import { parseRedirs } from "../../docs/yodl/extractors/redirections"
import { parseReswords } from "../../docs/yodl/extractors/reserved-words"
import { parseShellParams } from "../../docs/yodl/extractors/shell-params"
import { parseSubscriptFlags } from "../../docs/yodl/extractors/subscript-flags"
import { parseZleWidgets } from "../../docs/yodl/extractors/zle-widgets"
import { mkDocumented_ } from "../id-fns"
import { by, expectDocCorpus, readVendoredYo } from "./test-util"

const sp = mkDocumented_("special_param")
const rw = mkDocumented_("reserved_word")
const zw = mkDocumented_("zle_widget")

const EXPN_YO = readVendoredYo("expn.yo")
const GRAMMAR_YO = readVendoredYo("grammar.yo")
const PARAMS_YO = readVendoredYo("params.yo")
const PROMPT_YO = readVendoredYo("prompt.yo")
const REDIR_YO = readVendoredYo("redirect.yo")
const ZLE_YO = readVendoredYo("zle.yo")

describe("more yodl parsers", () => {
  test("special params keep tied pairs and xitem aliases with shared docs", () => {
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
    const docs = by(parseShellParams(yo), doc => doc.name)
    const get = (raw: string) => docs.get(sp(raw))
    expect(get("path")?.tied).toBe(sp("PATH"))
    expect(get("PATH")?.tied).toBe(sp("path"))
    expect(get("path")?.desc).toBe("Pair docs.")
    expect(get("RPS1")?.desc).toBe("Prompt docs.")
    expect(get("RPROMPT")?.desc).toBe("Prompt docs.")
  })

  test("redirections keep xitem aliases with shared docs", () => {
    const yo = `startitem()
xitem(tt(>|) var(word))
item(tt(>!) var(word))(
Force clobber.
)
enditem()`
    const docs = parseRedirs(yo)
    expect(docs.map(doc => doc.groupOp)).toEqual([">!", ">|"])
    expect(docs[0]?.desc).toBe("Force clobber.")
    expect(docs[1]?.desc).toBe("Force clobber.")
  })

  test.each([
    [">&", [">& number", ">& -", ">& p", ">& word"]],
    ["<&", ["<& number", "<& -", "<& p"]],
  ] as const)("redirection groupOp %s shared across multiple docs", (op, sigs) => {
    const docs = parseRedirs(REDIR_YO)
    expect(
      docs.filter(doc => doc.groupOp === mkRedirOp(op)).map(doc => doc.sig),
    ).toEqual(sigs)
  })

  test("reserved words include command-position and any-position forms", () => {
    const docs = by(parseReswords(GRAMMAR_YO), doc => doc.name)
    expect(docs.get(rw("if"))?.pos).toBe("command")
    expect(docs.get(rw("[["))?.pos).toBe("command")
    expect(docs.get(rw("}"))?.pos).toBe("any")
  })

  test("prompt escapes: xitem aliases inherit following-item docs", () => {
    const yo = [
      "sect(Shell state)",
      "startitem()",
      "xitem(tt(%h))",
      "item(tt(%!))(",
      "Current history event number.",
      ")",
      "enditem()",
    ].join("\n")
    const docs = parsePromptEscapes(yo)
    expect(docs.map(d => d.key).sort()).toEqual(["%!", "%h"])
    expect(docs.every(d => d.desc === "Current history event number.")).toBe(
      true,
    )
    expect(docs.every(d => d.section === "Shell state")).toBe(true)
  })

  test("zle widgets: standard kind picked from parent sect, name from first tt", () => {
    const yo = [
      "sect(Standard Widgets)",
      "subsect(Movement)",
      "startitem()",
      "tindex(backward-char)",
      "item(tt(backward-char) (tt(^B)) (unbound) (unbound))(",
      "Move backward one character.",
      ")",
      "enditem()",
      "sect(Character Highlighting)",
    ].join("\n")
    const docs = parseZleWidgets(yo)
    expect(docs).toHaveLength(1)
    expect(docs[0]?.name).toBe(zw("backward-char"))
    expect(docs[0]?.kind).toBe("standard")
    expect(docs[0]?.section).toBe("Movement")
  })

  test("process substitution exports the three canonical forms", () => {
    expect(parseProcessSubsts(EXPN_YO).map(doc => doc.op)).toEqual([
      "<(...)",
      ">(...)",
      "=(...)",
    ])
  })

  // `complex_command`-covered reserved-word heads intentionally omit desc;
  // `descOf` returns `undefined` for them so `expectDocCorpus` skips the
  // desc-truthy check while still requiring ids + sections.
  test.each([
    [
      "redirections",
      () =>
        expectDocCorpus({
          docs: parseRedirs(REDIR_YO),
          minCount: 18,
          keyOf: doc => doc.sig,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["< word", "<> word", ">> word", "&> word", "&>>! word"],
        }),
    ],
    [
      "reserved words",
      () =>
        expectDocCorpus({
          docs: parseReswords(GRAMMAR_YO),
          minCount: 20,
          keyOf: doc => doc.name,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["do", "done", "foreach", "typeset", "!", "if", "for", "[["],
        }),
    ],
    [
      "subscript flags",
      () =>
        expectDocCorpus({
          docs: parseSubscriptFlags(PARAMS_YO),
          minCount: 10,
          keyOf: doc => doc.sig,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["w", "s:string:", "n:expr:", "R"],
        }),
    ],
    [
      "special parameters",
      () =>
        expectDocCorpus({
          docs: parseShellParams(PARAMS_YO),
          minCount: 80,
          keyOf: doc => doc.name,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.scope,
          known: [
            "SECONDS",
            "argv",
            "path",
            "PATH",
            "reply",
            "zsh_eval_context",
          ],
        }),
    ],
    [
      "parameter flags",
      () =>
        expectDocCorpus({
          docs: parseParamFlags(EXPN_YO),
          minCount: 40,
          keyOf: doc => doc.sig,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: [
            "@",
            "g:opts:",
            "j:string:",
            "l:expr::string1::string2:",
            "Z:opts:",
          ],
        }),
    ],
    [
      "history",
      () =>
        expectDocCorpus({
          docs: parseHistory(EXPN_YO),
          minCount: 30,
          keyOf: doc => `${doc.kind}:${doc.key}`,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: [
            "event-designator:!!",
            "event-designator:!n",
            "word-designator:0",
            "word-designator:x-",
            "modifier:a",
            "modifier:s",
          ],
        }),
    ],
    [
      "glob operators",
      () =>
        expectDocCorpus({
          docs: parseGlobOps(EXPN_YO),
          minCount: 12,
          keyOf: doc => doc.op,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["*", "[...]", "@(...)", "x|y", "x##"],
        }),
    ],
    [
      "glob flags",
      () =>
        expectDocCorpus({
          docs: parseGlobFlags(EXPN_YO),
          minCount: 10,
          keyOf: doc => doc.sig,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["i", "I", "b", "m", "cN,M"],
        }),
    ],
    [
      "glob qualifiers",
      () =>
        expectDocCorpus({
          docs: parseGlobQualifiers(EXPN_YO),
          minCount: 30,
          keyOf: doc => doc.flag,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["/", ".", "@", "=", "*", "%", "%b", "r", "w", "x"],
        }),
    ],
    [
      "complex commands",
      () =>
        expectDocCorpus({
          docs: parseComplexCommands(GRAMMAR_YO),
          minCount: 10,
          keyOf: doc => doc.name,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["if", "for", "for-arith", "while", "case", "[["],
        }),
    ],
    [
      "prompt escapes",
      () =>
        expectDocCorpus({
          docs: parsePromptEscapes(PROMPT_YO),
          minCount: 40,
          keyOf: doc => doc.key,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["%n", "%~", "%D{string}", "%F", "%{...%}"],
        }),
    ],
    [
      "zle widgets",
      () =>
        expectDocCorpus({
          docs: parseZleWidgets(ZLE_YO),
          minCount: 180,
          keyOf: doc => doc.name,
          descOf: doc => doc.desc,
          known: [
            "backward-kill-word",
            "yank",
            "vi-cmd-mode",
            "self-insert",
            "zle-line-init",
          ],
        }),
    ],
  ] as const)("vendored %s corpus parses", (_, run) => run())
})
