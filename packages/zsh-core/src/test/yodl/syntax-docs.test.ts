import { describe, expect, test } from "vitest"
import { mkDocumented } from "../../docs/brands"
import { mkRedirOp } from "../../docs/types"
import { parseGlobFlags } from "../../docs/yodl/extractors/glob-flags"
import { parseGlobOps } from "../../docs/yodl/extractors/glob-ops"
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

const EXPN_YO = readVendoredYo("expn.yo")
const GRAMMAR_YO = readVendoredYo("grammar.yo")
const PARAMS_YO = readVendoredYo("params.yo")
const PROMPT_YO = readVendoredYo("prompt.yo")
const REDIR_YO = readVendoredYo("redirect.yo")
const ZLE_YO = readVendoredYo("zle.yo")

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
    const docs = by(parseShellParams(yo), doc => doc.name)
    const getShParam = (raw: string) =>
      docs.get(mkDocumented("shell_param", raw))
    expect(getShParam("path")?.tied).toBe(mkDocumented("shell_param", "PATH"))
    expect(getShParam("PATH")?.tied).toBe(mkDocumented("shell_param", "path"))
    expect(getShParam("path")?.desc).toBe("Pair docs.")
    expect(getShParam("RPS1")?.desc).toBe("Prompt docs.")
    expect(getShParam("RPROMPT")?.desc).toBe("Prompt docs.")
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

  test("redirection grouping operator is not a unique doc identity", () => {
    const docs = parseRedirs(REDIR_YO)
    expect(
      docs.filter(doc => doc.groupOp === ">&").map(doc => doc.sig),
    ).toEqual([">& number", ">& -", ">& p", ">& word"])
    expect(
      docs.filter(doc => doc.groupOp === "<&").map(doc => doc.sig),
    ).toEqual(["<& number", "<& -", "<& p"])
  })

  test("reserved words include command-position and any-position forms", () => {
    const docs = by(parseReswords(GRAMMAR_YO), doc => doc.name)
    const getResWord = (raw: string) =>
      docs.get(mkDocumented("reserved_word", raw))
    expect(getResWord("if")?.pos).toBe("command")
    expect(getResWord("[[")?.pos).toBe("command")
    expect(getResWord("}")?.pos).toBe("any")
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
    expect(docs[0]?.name).toBe(mkDocumented("zle_widget", "backward-char"))
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

  for (const [name, run] of [
    [
      "vendored redirections corpus parses",
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
      "vendored reserved words corpus parses",
      () =>
        expectDocCorpus({
          docs: parseReswords(GRAMMAR_YO),
          minCount: 25,
          keyOf: doc => doc.name,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["if", "nocorrect", "[[", "{", "}"],
        }),
    ],
    [
      "vendored subscript flag corpus parses",
      () =>
        expectDocCorpus({
          docs: parseSubscriptFlags(PARAMS_YO),
          minCount: 10,
          keyOf: doc => doc.flag,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
          known: ["w", "s:string:", "n:expr:", "R"],
        }),
    ],
    [
      "vendored shell-parameter corpus parses",
      () =>
        expectDocCorpus({
          docs: parseShellParams(PARAMS_YO),
          minCount: 80,
          keyOf: doc => doc.name,
          descOf: doc => doc.desc,
          sectionOf: doc => doc.section,
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
      "vendored parameter flag corpus parses",
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
      "vendored history corpus parses",
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
            "modifier:s/l/r[/]",
          ],
        }),
    ],
    [
      "vendored glob operator corpus parses",
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
      "vendored glob flag corpus parses",
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
      "vendored prompt-escape corpus parses",
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
      "vendored zle-widget corpus parses",
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
  ] as const) {
    test(name, run)
  }

  test("normalized syntax-doc identity fields are idempotent", () => {
    const t = [
      [parseRedirs(REDIR_YO).map(doc => doc.groupOp), mkRedirOp],
      [parseRedirs(REDIR_YO).map(doc => doc.sig), mkDocumented_("redir")],
      [
        parseReswords(GRAMMAR_YO).map(doc => doc.name),
        mkDocumented_("reserved_word"),
      ],
      [
        parseShellParams(PARAMS_YO).map(doc => doc.name),
        mkDocumented_("shell_param"),
      ],
      [
        parseSubscriptFlags(PARAMS_YO).map(d => d.flag),
        mkDocumented_("subscript_flag"),
      ],
      [
        parseParamFlags(EXPN_YO).map(doc => doc.flag),
        mkDocumented_("param_flag"),
      ],
      [parseHistory(EXPN_YO).map(doc => doc.key), mkDocumented_("history")],
      [parseGlobOps(EXPN_YO).map(doc => doc.op), mkDocumented_("glob_op")],
      [
        parseGlobFlags(EXPN_YO).map(doc => doc.flag),
        mkDocumented_("glob_flag"),
      ],
      [
        parsePromptEscapes(PROMPT_YO).map(doc => doc.key),
        mkDocumented_("prompt_escape"),
      ],
      [
        parseZleWidgets(ZLE_YO).map(doc => doc.name),
        mkDocumented_("zle_widget"),
      ],
    ] as const
    for (const [docs, mk] of t) {
      for (const x of docs) expect(mk(x)).toBe(x)
    }
  })
})
