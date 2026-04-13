import * as vscode from "vscode"
import type {
  BuiltinDoc,
  BuiltinName,
  CmdHeadFact,
  CondOp,
  CondOpDoc,
  OptFlagAlias,
  OptFlagChar,
  OptName,
  PrecmdDoc,
  PrecmdFact,
  PrecmdName,
  ProcessSubstDoc,
  ProcessSubstFact,
  ProcessSubstOp,
  RedirDoc,
  RedirFact,
  RedirOp,
  ReservedWord,
  ReservedWordDoc,
  ReservedWordFact,
  ShellParamDoc,
  ShellParamName,
  ZshOption,
} from "zsh-core"
import {
  cmdHeadFactsOnLine,
  mkBuiltinName,
  mkCondOp,
  mkOptFlagChar,
  mkOptLookupName,
  mkReservedWord,
  mkShellParamName,
  syntacticContext,
} from "zsh-core"
import {
  type HoverMdCtx,
  mdBuiltin,
  mdCond,
  mdOpt,
  mdParam,
  mdPrecmd,
  mdProcessSubst,
  mdRedir,
  mdReservedWord,
  mkHoverMdCtx,
} from "zsh-core/render"
import { activeWordRangeAt, commentStart, funcDocs } from "./funcs"

interface OptFlagHit {
  readonly opt: ZshOption
  readonly alias: OptFlagAlias
}

export class HoverProvider implements vscode.HoverProvider {
  private md: HoverMdCtx
  private builtinMap: Map<BuiltinName, BuiltinDoc> | undefined
  private paramMap: Map<ShellParamName, ShellParamDoc> | undefined
  private optionMap: Map<OptName, ZshOption> | undefined
  private flagMap: ReadonlyMap<OptFlagChar, readonly OptFlagHit[]> | undefined
  private condOpMap: Map<CondOp, CondOpDoc> | undefined
  private precmdMap: Map<PrecmdName, PrecmdDoc> | undefined
  private redirMap: ReadonlyMap<RedirOp, readonly RedirDoc[]> | undefined
  private processSubstMap: Map<ProcessSubstOp, ProcessSubstDoc> | undefined
  private reservedWordMap: Map<ReservedWord, ReservedWordDoc> | undefined

  constructor(
    params?: readonly ShellParamDoc[],
    options?: readonly ZshOption[],
    condOps?: readonly CondOpDoc[],
    builtins?: readonly BuiltinDoc[],
    precmds?: readonly PrecmdDoc[],
    redirDocs?: readonly RedirDoc[],
    processSubstDocs?: readonly ProcessSubstDoc[],
    reservedWordDocs?: readonly ReservedWordDoc[],
  ) {
    this.md = mkHoverMdCtx(options)
    if (builtins) {
      this.builtinMap = new Map(
        builtins.map((builtin) => [builtin.name, builtin]),
      )
    }
    if (params) {
      this.paramMap = new Map(params.map((param) => [param.name, param]))
    }
    if (options) {
      this.optionMap = new Map(options.map((opt) => [opt.name, opt]))
      this.flagMap = indexMany(
        options.flatMap((opt) =>
          opt.flags.map(
            (alias) =>
              [alias.char, { opt, alias }] as const satisfies readonly [
                OptFlagChar,
                OptFlagHit,
              ],
          ),
        ),
      )
    }
    if (condOps) {
      this.condOpMap = new Map(condOps.map((cop) => [cop.op, cop]))
    }
    if (precmds) {
      this.precmdMap = new Map(precmds.map((doc) => [doc.name, doc]))
    }
    if (redirDocs) {
      this.redirMap = indexMany(
        redirDocs.map((doc) => [doc.groupOp, doc] as const),
      )
    }
    if (processSubstDocs) {
      this.processSubstMap = new Map(
        processSubstDocs.map((doc) => [doc.op, doc]),
      )
    }
    if (reservedWordDocs) {
      this.reservedWordMap = new Map(
        reservedWordDocs.map((doc) => [doc.name, doc]),
      )
    }
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
    if (ctx.kind !== "setopt" || !this.optionMap) return
    const range = activeTokenRangeAt(doc, pos)
    if (!range) return
    const opt = this.optionAt(doc.getText(range))
    if (opt)
      return new vscode.Hover(
        new vscode.MarkdownString(mdOpt(opt, this.md)),
        range,
      )
  }

  private condHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const ctx = syntacticContext(doc, pos.line, pos.character)
    if (ctx.kind !== "cond" || !this.condOpMap) return
    const range = activeCondTokenRangeAt(doc, pos, this.condOpMap)
    if (!range) return
    const op = mkCondOp(doc.getText(range))
    const cop = this.condOpMap.get(op)
    if (cop)
      return new vscode.Hover(
        new vscode.MarkdownString(mdCond(cop, this.md)),
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
    if (!this.paramMap) return
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    const w = doc.getText(range)
    const param = this.paramMap.get(mkShellParamName(w))
    if (param)
      return new vscode.Hover(new vscode.MarkdownString(mdParam(param)))
  }

  private factBasedHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const line = doc.lineAt(pos.line).text
    const af = cmdHeadFactsOnLine(line)
    const tokenRange = activeTokenRangeAt(doc, pos)
    const token = tokenRange ? doc.getText(tokenRange) : undefined

    const precmd = token
      ? af.find(
          (fact): fact is PrecmdFact =>
            fact.kind === "precmd" &&
            line.slice(fact.span.start, fact.span.end) === token,
        )
      : undefined
    if (precmd) {
      const d = this.precmdMap?.get(precmd.name)
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdPrecmd(d)),
          tokenRange,
        )
    }

    const head = token
      ? af.find(
          (fact): fact is CmdHeadFact =>
            fact.kind === "cmd-head" &&
            line.slice(fact.span.start, fact.span.end) === token,
        )
      : undefined
    if (head) {
      const d = this.builtinMap?.get(mkBuiltinName(head.text))
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdBuiltin(d)),
          tokenRange,
        )
    }

    const redir = af.find((fact): fact is RedirFact => fact.kind === "redir")
    if (redir) {
      const redirRange = activeRedirRangeAt(doc, pos, redir)
      const redirToken = redirRange ? doc.getText(redirRange) : undefined
      const d = redirToken ? redirDoc(this.redirMap, redirToken) : undefined
      if (d && redirRange)
        return new vscode.Hover(
          new vscode.MarkdownString(mdRedir(d)),
          redirRange,
        )
    }

    const ps = af.find(
      (fact): fact is ProcessSubstFact => fact.kind === "process-subst",
    )
    if (ps) {
      const prefix = ps.text.slice(0, 2)
      const opKey = `${prefix}...)` as ProcessSubstOp
      const d = this.processSubstMap?.get(opKey)
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdProcessSubst(d)),
          tokenRange,
        )
    }

    const rw = token
      ? af.find(
          (fact): fact is ReservedWordFact =>
            fact.kind === "reserved-word" &&
            line.slice(fact.span.start, fact.span.end) === token,
        )
      : undefined
    if (rw) {
      const d = this.reservedWordMap?.get(mkReservedWord(rw.text))
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdReservedWord(d)),
          tokenRange,
        )
    }
  }

  private optionAt(token: string): ZshOption | undefined {
    const direct = this.optionMap?.get(mkOptLookupName(token))
    if (direct) return direct

    const short = token.match(/^([+-])([A-Za-z0-9])$/)
    if (!short?.[1] || !short[2] || !this.flagMap) return
    const hits = this.flagMap
      .get(mkOptFlagChar(short[2]))
      ?.filter((hit) => hit.alias.on === short[1])
    return unique(hits)?.opt
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
  const { groupOp, tail } = parsed
  const docs = redirMap?.get(groupOp)
  if (!docs) return
  if (docs.length === 1) return docs[0]
  // Redirection docs are grouped by the leading operator token and only become
  // unique once the remaining signature tail is considered.
  return unique(
    docs.filter((doc) => redirTailKind(doc) === redirTailKindOf(tail)),
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
  if (tail === "-") return "-"
  if (tail === "p") return "p"
  if (tail.length > 0) return "word"
  return ""
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
  condOps: ReadonlyMap<CondOp, CondOpDoc>,
): vscode.Range | undefined {
  const range = activeTokenRangeAt(doc, pos)
  if (range) return range

  const text = doc.lineAt(pos.line).text
  const cut = commentStart(text) ?? text.length
  if (pos.character >= cut) return

  // Generic hover token splitting treats shell delimiters as separators, so
  // conditional operators made entirely from those chars need a cond-only path.
  const symbolic = [...condOps.keys()]
    .filter((op) => [...op].some(isTokenDelimiter))
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
