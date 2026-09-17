import { isSingle } from "@carlwr/typescript-extra"
import type { DocCorpus } from "@carlwr/zsh-core"
import {
  cmdHeadFactsOnLine,
  isProcessSubstFact,
  isRedirFact,
  type LineFact,
} from "@carlwr/zsh-core/analysis"
import { renderDocWithTitle } from "@carlwr/zsh-core/render"
import { resolve } from "@carlwr/zsh-core/resolver"
import {
  type DocCategory,
  type DocPieceId,
  mkPieceId,
} from "@carlwr/zsh-core/taxonomy"
import {
  mkOptFlag,
  type OptFlag,
  type OptFlagAlias,
  type ZshOption,
} from "@carlwr/zsh-core/types"
import * as vscode from "vscode"
import { contextAt } from "../document/facts"
import { funcAt } from "../document/funcs"
import {
  activeRedirRangeAt,
  activeTokenRangeAt,
  isTokenDelimiter,
  symbolicOpRangeAt,
} from "../document/tokens"
import { activeLineAt, activeWordRangeAt } from "../document/words"

// `setopt NO_AUTO_CD` hovers as `AUTO_CD`: the option resolver's
// `input-negated` feedback (`resolverFeedback`) is not surfaced.

const PUNCT_PARAM = /[$?@*!#-]/

interface OptFlagHit {
  readonly opt: ZshOption
  readonly alias: OptFlagAlias
}

/**
 * NOTE: Refactoring fact-based hovers to a table-driven style has been tried, and rejected.
 *
 * (in practice, such a refactor did not improve conciseness/code amount, and clarity was somewhat weakened.)
 *
 * DON'T DELETE THIS COMMENT
 */

export class HoverProvider implements vscode.HoverProvider {
  private corpus: DocCorpus
  private flagMap: ReadonlyMap<OptFlag, readonly OptFlagHit[]>
  // Generic token splitting treats shell delimiters as separators, so
  // conditional operators made entirely of those chars need a cond-only path.
  private symbolicCondOps: readonly string[]

  constructor(corpus: DocCorpus) {
    this.corpus = corpus

    // Secondary index for -J/+J style flag lookup. Extension-specific UX
    // (the user typed a flag letter and we look up the corresponding option)
    // — not a corpus-identity concern, so stays here rather than in zsh-core.
    this.flagMap = indexMany(
      [...corpus.option.values()].flatMap(opt =>
        opt.flags.map(alias => [alias.char, { opt, alias }] as const),
      ),
    )
    this.symbolicCondOps = [...corpus.conditional_op.keys()]
      .filter(op => [...op].some(isTokenDelimiter))
      .sort((a, b) => b.length - a.length)
  }

  provideHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const ctx = contextAt(doc, pos)
    return (
      (ctx === "setopt"
        ? this.setoptHover(doc, pos)
        : ctx === "cond"
          ? this.condHover(doc, pos)
          : undefined) ??
      this.funcHover(doc, pos) ??
      this.factBasedHover(doc, pos) ??
      this.paramHover(doc, pos)
    )
  }

  private setoptHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeTokenRangeAt(doc, pos)
    if (!range) return
    const pieceId = this.optionAt(doc.getText(range))
    if (pieceId) return this.renderHover(pieceId, range)
  }

  private condHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range =
      activeTokenRangeAt(doc, pos) ??
      symbolicOpRangeAt(doc, pos, this.symbolicCondOps)
    if (!range) return
    return this.hoverFor("conditional_op", doc.getText(range), range)
  }

  private funcHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const hit = funcAt(doc, pos)
    const d = hit?.decl.doc
    if (!hit || !d) return
    // Two trailing spaces keep multi-line docstrings as hard line breaks in markdown.
    const md = new vscode.MarkdownString()
    md.appendCodeblock(`function ${hit.decl.name}() { ... }`, "zsh")
    md.appendMarkdown(`\n\n${d.replaceAll("\n", "  \n")}`)
    return new vscode.Hover(md, hit.range)
  }

  private paramHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeWordRangeAt(doc, pos)
    if (range) return this.hoverFor("special_param", doc.getText(range), range)
    return this.punctParamHover(doc, pos)
  }

  // Punctuation-named special params (`$$`, `$@`, `$?`, …) miss `activeWordRangeAt`'s `\w`-only token. Match a `$X` or `${X` anchor instead.
  private punctParamHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const active = activeLineAt(doc, pos)
    if (!active) return
    const { text: line, cut } = active
    const tryAt = (idx: number) => {
      if (idx < 0 || idx >= cut) return
      const ch = line[idx]
      if (!ch || !PUNCT_PARAM.test(ch)) return
      const anchored =
        line[idx - 1] === "$" ||
        (line[idx - 1] === "{" && line[idx - 2] === "$")
      if (!anchored) return
      const range = new vscode.Range(pos.line, idx, pos.line, idx + 1)
      return this.hoverFor("special_param", ch, range)
    }
    return tryAt(pos.character) ?? tryAt(pos.character + 1)
  }

  private factBasedHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const line = doc.lineAt(pos.line).text
    const af = cmdHeadFactsOnLine(line)
    const tokenRange = activeTokenRangeAt(doc, pos)
    const token = tokenRange ? doc.getText(tokenRange) : undefined

    const precmd = factAt(af, line, token, "precmd")
    const onPrecmd =
      precmd && this.hoverFor("precmd_modifier", precmd.name, tokenRange)
    if (onPrecmd) return onPrecmd

    const head = factAt(af, line, token, "cmd-head")
    const onHead = head && this.hoverFor("builtin", head.text, tokenRange)
    if (onHead) return onHead

    for (const redir of af.filter(isRedirFact)) {
      const redirRange = activeRedirRangeAt(doc, pos, redir)
      if (!redirRange) continue
      const onRedir = this.hoverFor(
        "redirection",
        doc.getText(redirRange),
        redirRange,
      )
      if (onRedir) return onRedir
    }

    // Process substitution hovers on its two-character opener.
    const ps = af
      .filter(isProcessSubstFact)
      .find(f => spanHas(f.span, pos.character, 2))
    if (ps) {
      const opener = ps.text.slice(0, 2)
      const range = new vscode.Range(
        pos.line,
        ps.span.start,
        pos.line,
        ps.span.start + 2,
      )
      const onPs = this.hoverFor("process_subst", `${opener}...)`, range)
      if (onPs) return onPs
    }

    const rw = factAt(af, line, token, "reserved-word")
    if (rw) {
      // Heads like `for`, `while`, `[[` are both reserved words and complex
      // commands; prefer the structured complex_command record (synopsis +
      // alternateForms) when the token resolves there — mirrors the
      // `classifyOrder` priority.
      const onCc = this.hoverFor("complex_command", rw.text, tokenRange)
      if (onCc) return onCc
      const onRw = this.hoverFor("reserved_word", rw.text, tokenRange)
      if (onRw) return onRw
    }
  }

  private hoverFor<K extends DocCategory>(
    category: K,
    raw: string,
    range?: vscode.Range,
  ): vscode.Hover | undefined {
    const pieceId = resolve(this.corpus, category, raw)
    if (pieceId) return this.renderHover(pieceId, range)
  }

  private renderHover(pieceId: DocPieceId, range?: vscode.Range) {
    const md = new vscode.MarkdownString(
      renderDocWithTitle(this.corpus, pieceId),
    )
    return new vscode.Hover(md, range)
  }

  private optionAt(token: string): DocPieceId | undefined {
    // Direct form; negation feedback discarded (top-of-file note).
    const direct = resolve(this.corpus, "option", token)
    if (direct) return direct

    // Short-flag form: `-J` / `+J`.
    const short = token.match(/^([+-])([A-Za-z0-9])$/)
    if (!short?.[1] || !short[2]) return
    const hits =
      this.flagMap
        .get(mkOptFlag(short[2]))
        ?.filter(hit => hit.alias.on === short[1]) ?? []
    if (isSingle(hits)) return mkPieceId("option", hits[0].opt.name)
  }
}

function indexMany<K, V>(
  entries: readonly (readonly [K, V])[],
): ReadonlyMap<K, readonly V[]> {
  const out = new Map<K, V[]>()
  for (const [key, value] of entries) {
    const vs = out.get(key)
    if (vs) vs.push(value)
    else out.set(key, [value])
  }
  return out
}

const spanHas = (span: { start: number }, at: number, len: number) =>
  span.start <= at && at < span.start + len

/** Find a fact of the given kind whose span text equals `token`. */
function factAt<K extends LineFact["kind"]>(
  facts: readonly LineFact[],
  line: string,
  token: string | undefined,
  kind: K,
): Extract<LineFact, { kind: K }> | undefined {
  if (!token) return undefined
  return facts.find(
    (f): f is Extract<LineFact, { kind: K }> =>
      f.kind === kind && line.slice(f.span.start, f.span.end) === token,
  )
}
