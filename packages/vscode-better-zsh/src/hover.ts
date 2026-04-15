import * as vscode from "vscode"
import type {
  Candidate,
  DocCategory,
  DocCorpus,
  DocPieceId,
  LineFact,
  OptFlag,
  OptFlagAlias,
  ProcessSubstFact,
  Proven,
  RedirDoc,
  RedirFact,
  RedirOp,
  ZshOption,
} from "zsh-core"
import {
  cmdHeadFactsOnLine,
  mkCandidate,
  mkCandPieceId,
  mkOptFlag,
  resolve,
  syntacticContext,
} from "zsh-core"
import { renderDoc } from "zsh-core/render"
import { activeWordRangeAt, commentStart, funcDocs } from "./funcs"

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
  private redirMap: ReadonlyMap<RedirOp, readonly RedirDoc[]>

  constructor(corpus: DocCorpus) {
    this.corpus = corpus

    // Secondary index for -J/+J style flag lookup
    const options = [...corpus.option.values()]
    this.flagMap = indexMany(
      options.flatMap(opt =>
        opt.flags.map(
          alias =>
            [alias.char, { opt, alias }] as const satisfies readonly [
              OptFlag,
              OptFlagHit,
            ],
        ),
      ),
    )

    // Secondary index for redir groupOp bucketing
    this.redirMap = indexMany(
      [...corpus.redir.values()].map(doc => [doc.groupOp, doc] as const),
    )
  }

  provideHover(doc: vscode.TextDocument, pos: vscode.Position) {
    return (
      this.setoptHover(doc, pos) ??
      this.condHover(doc, pos) ??
      this.funcHover(doc, pos) ??
      this.paramHover(doc, pos) ??
      this.factBasedHover(doc, pos)
    )
  }

  private setoptHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const ctx = syntacticContext(doc, pos.line, pos.character)
    if (ctx.kind !== "setopt") return
    const range = activeTokenRangeAt(doc, pos)
    if (!range) return
    const pieceId = this.optionAt(doc.getText(range))
    if (pieceId) return this.renderHover(pieceId, range)
  }

  private condHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const ctx = syntacticContext(doc, pos.line, pos.character)
    if (ctx.kind !== "cond") return
    const condOpKeys = this.corpus.cond_op.keys()
    const range = activeCondTokenRangeAt(doc, pos, condOpKeys)
    if (!range) return
    return this.hoverFor(
      "cond_op",
      mkCandidate("cond_op", doc.getText(range)),
      range,
    )
  }

  private funcHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    const d = funcDocs(doc).get(doc.getText(range))
    if (d)
      return new vscode.Hover(
        new vscode.MarkdownString().appendCodeblock(d, ""),
      )
  }

  private paramHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    return this.hoverFor(
      "shell_param",
      mkCandidate("shell_param", doc.getText(range)),
      range,
    )
  }

  private factBasedHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const line = doc.lineAt(pos.line).text
    const af = cmdHeadFactsOnLine(line)
    const tokenRange = activeTokenRangeAt(doc, pos)
    const token = tokenRange ? doc.getText(tokenRange) : undefined

    const precmd = factAt(af, line, token, "precmd")
    const onPrecmd =
      precmd &&
      this.hoverFor("precmd", mkCandidate("precmd", precmd.name), tokenRange)
    if (onPrecmd) return onPrecmd

    const head = factAt(af, line, token, "cmd-head")
    const onHead =
      head &&
      this.hoverFor("builtin", mkCandidate("builtin", head.text), tokenRange)
    if (onHead) return onHead

    const redir = af.find((fact): fact is RedirFact => fact.kind === "redir")
    if (redir) {
      const redirRange = activeRedirRangeAt(doc, pos, redir)
      const redirToken = redirRange ? doc.getText(redirRange) : undefined
      const d = redirToken ? redirDoc(this.redirMap, redirToken) : undefined
      if (d && redirRange)
        return this.renderHover({ category: "redir", id: d.sig }, redirRange)
    }

    const ps = af.find(
      (fact): fact is ProcessSubstFact => fact.kind === "process-subst",
    )
    const onPs =
      ps &&
      this.hoverFor(
        "process_subst",
        mkCandidate("process_subst", `${ps.text.slice(0, 2)}...)`),
        tokenRange,
      )
    if (onPs) return onPs

    const rw = factAt(af, line, token, "reserved-word")
    const onRw =
      rw &&
      this.hoverFor(
        "reserved_word",
        mkCandidate("reserved_word", rw.text),
        tokenRange,
      )
    if (onRw) return onRw
  }

  private hoverFor<K extends DocCategory>(
    category: K,
    id: Candidate<K>,
    range?: vscode.Range,
  ): vscode.Hover | undefined {
    const pieceId = resolve(this.corpus, mkCandPieceId(category, id))
    if (pieceId) return this.renderHover(pieceId, range)
  }

  private renderHover(pieceId: DocPieceId, range?: vscode.Range) {
    const md = new vscode.MarkdownString(renderDoc(this.corpus, pieceId))
    return new vscode.Hover(md, range)
  }

  private optionAt(token: string): DocPieceId | undefined {
    const direct = resolve(
      this.corpus,
      mkCandPieceId("option", mkCandidate("option", token)),
    )
    if (direct) return direct

    const short = token.match(/^([+-])([A-Za-z0-9])$/)
    if (!short?.[1] || !short[2]) return
    const hits = this.flagMap
      .get(mkOptFlag(short[2]))
      ?.filter(hit => hit.alias.on === short[1])
    const opt = unique(hits)?.opt
    if (!opt) return
    return resolve(
      this.corpus,
      mkCandPieceId("option", mkCandidate("option", opt.display)),
    )
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

function unique<T>(hits: readonly T[] | undefined): T | undefined {
  return hits?.length === 1 ? hits[0] : undefined
}

function redirDoc(
  redirMap: ReadonlyMap<RedirOp, readonly RedirDoc[]> | undefined,
  token: string,
): RedirDoc | undefined {
  const parsed = splitRedirToken(redirMap, token)
  if (!parsed) return
  const docs = redirMap?.get(parsed.groupOp)
  if (!docs) return
  if (docs.length === 1) return docs[0]
  // Redirection docs are grouped by the leading operator token and only become
  // unique once the remaining signature tail is considered.
  return unique(
    docs.filter(doc => redirTailKind(doc) === redirTailKindOf(parsed.tail)),
  )
}

function splitRedirToken(
  redirMap: ReadonlyMap<RedirOp, readonly RedirDoc[]> | undefined,
  token: string,
): { groupOp: RedirOp; tail: string } | undefined {
  const text = token.replace(/^[0-9]+/, "")
  let bestGroupOp: RedirOp | undefined

  for (const groupOp of redirMap?.keys() ?? []) {
    if (!text.startsWith(groupOp)) continue
    if (!bestGroupOp || groupOp.length > bestGroupOp.length)
      bestGroupOp = groupOp
  }

  if (!bestGroupOp) return
  return { groupOp: bestGroupOp, tail: text.slice(bestGroupOp.length) }
}

function redirTailKind(doc: RedirDoc): string {
  return doc.sig.slice(doc.groupOp.length).trimStart()
}

function redirTailKindOf(tail: string): string {
  if (/^\d+$/.test(tail)) return "number"
  if (tail === "-" || tail === "p") return tail
  return tail.length > 0 ? "word" : ""
}

function activeTokenRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range | undefined {
  const text = doc.lineAt(pos.line).text
  const cut = commentStart(text) ?? text.length
  if (pos.character >= cut) return
  if (isTokenDelimiter(text[pos.character] ?? "")) return
  let start = pos.character
  while (start > 0 && !isTokenDelimiter(text[start - 1] ?? "")) start--
  let end = pos.character
  while (end < cut && !isTokenDelimiter(text[end] ?? "")) end++
  return start === end
    ? undefined
    : new vscode.Range(pos.line, start, pos.line, end)
}

function isTokenDelimiter(ch: string): boolean {
  return /[\s;|&(){}<>]/.test(ch)
}

function activeCondTokenRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  condOpKeys: Iterable<Proven<"cond_op">>,
): vscode.Range | undefined {
  const range = activeTokenRangeAt(doc, pos)
  if (range) return range

  const text = doc.lineAt(pos.line).text
  const cut = commentStart(text) ?? text.length
  if (pos.character >= cut) return

  // Generic hover token splitting treats shell delimiters as separators, so
  // conditional operators made entirely from those chars need a cond-only path.
  const symbolic = [...condOpKeys]
    .filter(op => [...op].some(isTokenDelimiter))
    .sort((a, b) => b.length - a.length)

  for (const op of symbolic) {
    const range = operatorRangeAt(text, pos.character, cut, op)
    if (range)
      return new vscode.Range(pos.line, range.start, pos.line, range.end)
  }
}

function operatorRangeAt(
  text: string,
  pos: number,
  cut: number,
  op: string,
): { start: number; end: number } | undefined {
  const startMin = Math.max(0, pos - op.length + 1)
  const startMax = Math.min(pos, cut - op.length)
  for (let start = startMin; start <= startMax; start++) {
    const end = start + op.length
    if (text.slice(start, end) !== op) continue
    if (opBoundary(text[start - 1]) && opBoundary(text[end]))
      return { start, end }
  }
}

function opBoundary(ch: string | undefined): boolean {
  return ch === undefined || /[\s[\]]/.test(ch)
}

/** Find a fact of the given kind whose span text equals `token`. Returns undefined if token is undefined. */
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

function activeRedirRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  redir: RedirFact,
): vscode.Range | undefined {
  const text = doc.lineAt(pos.line).text
  const cut = commentStart(text) ?? text.length
  if (pos.character < redir.span.start) return

  let end = redir.span.end
  while (end < cut && !isTokenDelimiter(text[end] ?? "")) end++
  if (pos.character >= end) return

  return new vscode.Range(pos.line, redir.span.start, pos.line, end)
}
