import { cached } from "@carlwr/typescript-extra"
import type { DocCorpus } from "@carlwr/zsh-core"
import {
  cmdHeadFactsOnLine,
  isProcessSubstFact,
  isRedirFact,
  type LineFact,
} from "@carlwr/zsh-core/analysis"
import { resolve } from "@carlwr/zsh-core/resolver"
import type { DocCategory, DocRecordId } from "@carlwr/zsh-core/taxonomy"
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
import { docMarkdown } from "./record-markdown"

// `setopt NO_AUTO_CD` and `set +J` hover as `AUTO_CD`: the option resolver's
// `input-negated` feedback (`resolverFeedback`) is not surfaced.

const PUNCT_PARAM = /[$?@*!#-]/

/**
 * NOTE: Refactoring fact-based hovers to a table-driven style has been tried, and rejected.
 *
 * (in practice, such a refactor did not improve conciseness/code amount, and clarity was somewhat weakened.)
 *
 * DON'T DELETE THIS COMMENT
 */

export class HoverProvider implements vscode.HoverProvider {
  // Generic token splitting treats shell delimiters as separators, so
  // conditional operators made entirely of those chars need a cond-only path.
  // Built by the first cond hover, never twice.
  private symbolicCondOps = cached(() =>
    [...this.corpus.conditional_op.keys()]
      .filter(op => [...op].some(isTokenDelimiter))
      .sort((a, b) => b.length - a.length),
  )

  constructor(private corpus: DocCorpus) {}

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

  // Short flags (`-J` / `+J`) are corpus identity, resolved in zsh-core.
  private setoptHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeTokenRangeAt(doc, pos)
    if (!range) return
    return this.hoverFor("option", doc.getText(range), range)
  }

  private condHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range =
      activeTokenRangeAt(doc, pos) ??
      symbolicOpRangeAt(doc, pos, this.symbolicCondOps())
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
    const recordId = resolve(this.corpus, category, raw)
    if (recordId) return this.renderHover(recordId, range)
  }

  private renderHover(recordId: DocRecordId, range?: vscode.Range) {
    const md = docMarkdown(this.corpus, recordId)
    return md && new vscode.Hover(md, range)
  }
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
