import { readFileSync } from "node:fs"
import { type ParseError, parse, printParseErrorCode } from "jsonc-parser"
import { z } from "zod"
import { type ZshSnippet, zshSnippetSchema } from "../types/snippet"
import { snippetsPath } from "./paths"

const zshSnippetsSchema = z.array(zshSnippetSchema)

export function readSnippets(): ZshSnippet[] {
  const src = readFileSync(snippetsPath, "utf8")
  const errs: ParseError[] = []
  const json = parse(src, errs, {
    allowTrailingComma: true,
    disallowComments: false,
  })
  if (errs.length > 0) {
    const msg = errs
      .map(e => `${printParseErrorCode(e.error)} @ ${e.offset}`)
      .join(", ")
    throw new Error(`Invalid JSONC in ${snippetsPath}: ${msg}`)
  }
  return zshSnippetsSchema.parse(json)
}

/** VS Code's snippet file format, keyed by snippet name. */
export type VsCodeSnippets = Record<
  string,
  { prefix: string; body: string[]; description: string }
>

export function buildSnippetJson(
  snippets: readonly ZshSnippet[],
): VsCodeSnippets {
  return Object.fromEntries(
    snippets.map(s => [
      s.name,
      { prefix: s.prefix, body: s.body, description: s.desc },
    ]),
  )
}
