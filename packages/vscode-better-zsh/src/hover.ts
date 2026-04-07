import * as vscode from "vscode"
import type {
  BuiltinDoc,
  CmdHeadFact,
  CondOperator,
  OptFlagAlias,
  PrecmdDoc,
  PrecmdFact,
  ProcessSubstDoc,
  ProcessSubstFact,
  RedirDoc,
  RedirFact,
  ReservedWordDoc,
  ReservedWordFact,
  ZshOption,
} from "zsh-core"
import {
  factsAt,
  factText,
  mkCondOp,
  mkOptName,
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

export class HoverProvider implements vscode.HoverProvider {
  private md: HoverMdCtx
  private builtinMap: Map<string, BuiltinDoc> | undefined
  private params: Map<string, string> | undefined
  private optionMap: Map<string, ZshOption> | undefined
  private flagMap:
    | Map<string, { opt: ZshOption; alias: OptFlagAlias }>
    | undefined
  private condOpMap: Map<string, CondOperator> | undefined
  private precmdMap: Map<string, PrecmdDoc> | undefined
  private redirMap: Map<string, RedirDoc> | undefined
  private processSubstMap: Map<string, ProcessSubstDoc> | undefined
  private reservedWordMap: Map<string, ReservedWordDoc> | undefined

  constructor(
    params?: Map<string, string>,
    options?: ZshOption[],
    condOps?: CondOperator[],
    builtins?: BuiltinDoc[],
    precmds?: PrecmdDoc[],
    redirDocs?: RedirDoc[],
    processSubstDocs?: ProcessSubstDoc[],
    reservedWordDocs?: ReservedWordDoc[],
  ) {
    this.md = mkHoverMdCtx(options)
    if (builtins) {
      this.builtinMap = new Map(
        builtins.map((builtin) => [builtin.name as string, builtin]),
      )
    }
    this.params = params
    if (options) {
      this.optionMap = new Map(options.map((o) => [o.name as string, o]))
      this.flagMap = new Map(
        options.flatMap((opt) =>
          opt.flags.map(
            (alias) => [alias.char as string, { opt, alias }] as const,
          ),
        ),
      )
    }
    if (condOps) {
      this.condOpMap = new Map(condOps.map((o) => [o.op as string, o]))
    }
    if (precmds) {
      this.precmdMap = new Map(precmds.map((doc) => [doc.name, doc]))
    }
    if (redirDocs) {
      this.redirMap = new Map(redirDocs.map((doc) => [doc.op, doc]))
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
    const range = activeTokenRangeAt(doc, pos)
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
    if (!this.params) return
    const range = activeWordRangeAt(doc, pos)
    if (!range) return
    const w = doc.getText(range)
    const ptype = this.params.get(w)
    if (ptype)
      return new vscode.Hover(new vscode.MarkdownString(mdParam(w, ptype)))
  }

  private factBasedHover(doc: vscode.TextDocument, pos: vscode.Position) {
    const tokenRange = activeTokenRangeAt(doc, pos)
    if (!tokenRange) return
    const token = doc.getText(tokenRange)
    const af = factsAt(doc, pos.line, pos.character)

    const precmd = af.find(
      (fact): fact is PrecmdFact =>
        fact.kind === "precmd" && factText(doc, fact.span) === token,
    )
    if (precmd) {
      const d = this.precmdMap?.get(precmd.name)
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdPrecmd(d)),
          tokenRange,
        )
    }

    const head = af.find(
      (fact): fact is CmdHeadFact =>
        fact.kind === "cmd-head" && factText(doc, fact.span) === token,
    )
    if (head) {
      const d = this.builtinMap?.get(token)
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdBuiltin(d)),
          tokenRange,
        )
    }

    const redir = af.find((fact): fact is RedirFact => fact.kind === "redir")
    if (redir) {
      const op = redir.text.replace(/^[0-9]+/, "")
      const d = this.redirMap?.get(op)
      if (d && (token === redir.text || token.startsWith(redir.text)))
        return new vscode.Hover(
          new vscode.MarkdownString(mdRedir(d)),
          tokenRange,
        )
    }

    const ps = af.find(
      (fact): fact is ProcessSubstFact => fact.kind === "process-subst",
    )
    if (ps) {
      const prefix = ps.text.slice(0, 2)
      const opKey = `${prefix}...)`
      const d = this.processSubstMap?.get(opKey)
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdProcessSubst(d)),
          tokenRange,
        )
    }

    const rw = af.find(
      (fact): fact is ReservedWordFact =>
        fact.kind === "reserved-word" && factText(doc, fact.span) === token,
    )
    if (rw) {
      const d = this.reservedWordMap?.get(rw.text)
      if (d)
        return new vscode.Hover(
          new vscode.MarkdownString(mdReservedWord(d)),
          tokenRange,
        )
    }
  }

  private optionAt(token: string): ZshOption | undefined {
    const direct = this.optionMap?.get(mkOptName(token))
    if (direct) return direct

    const noPrefixed = this.optionMap?.get(
      mkOptName(token.replace(/^no_?/i, "")),
    )
    if (noPrefixed) return noPrefixed

    const short = token.match(/^([+-])([A-Za-z0-9])$/)
    if (!short?.[1] || !short[2] || !this.flagMap) return
    // The hovered doc is keyed by the underlying option; sign only affects whether it sets or unsets it.
    const hit = this.flagMap.get(short[2])
    return hit?.opt
  }
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
