import { replaceSpecials, stripYodl, type YodlTok } from "./parse.ts"

export function sigText(header: string): string {
  return replaceSpecials(stripYodl(header)).replace(/\s+/g, " ").trim()
}

export function splitFlagSig(sig: string): { flag: string; args: string[] } {
  const parts = sig.split(":")
  return {
    flag: parts[0] ?? sig,
    args: parts.slice(1, -1).filter(Boolean),
  }
}

export function toksSig(toks: readonly YodlTok[]): string {
  return toks.map((tok) => tok.text).join("")
}
