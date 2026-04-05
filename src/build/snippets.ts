import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type ParseError, parse, printParseErrorCode } from "jsonc-parser"
import { z } from "zod"
import { type ZshSnippet, zshSnippetSchema } from "../types/snippet"

const snippetsPath = join("src", "assets", "zsh", "snippets.jsonc")
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
      .map((e) => `${printParseErrorCode(e.error)} @ ${e.offset}`)
      .join(", ")
    throw new Error(`Invalid JSONC in ${snippetsPath}: ${msg}`)
  }

  return zshSnippetsSchema.parse(json)
}

/** Convert snippets to VS Code snippet JSON format */
export function buildSnippetJson(
  snippets: readonly ZshSnippet[],
): Record<string, { prefix: string; body: string[]; description: string }> {
  const out: Record<
    string,
    { prefix: string; body: string[]; description: string }
  > = {}
  for (const s of snippets) {
    out[s.name] = { prefix: s.prefix, body: s.body, description: s.desc }
  }
  return out
}
