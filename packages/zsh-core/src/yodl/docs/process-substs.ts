import type { ProcessSubstDoc } from "../../types/zsh-data.ts"
import { extractSectionBody } from "../core/doc.ts"

const DOCS = [
  {
    op: "<(...)",
    sig: "<(...)",
    desc: "Run `list` as a subprocess and pass a special file connected to its output. The argument is usually a `/dev/fd/*` path or FIFO.",
  },
  {
    op: ">(...)",
    sig: ">(...)",
    desc: "Run `list` as a subprocess and pass a special file that feeds its standard input when written to.",
  },
  {
    op: "=(...)",
    sig: "=(...)",
    desc: "Run `list`, write its output to a temporary file, and pass that filename. This is useful for programs that need `lseek(2)`.",
  },
] as const

export function parseProcessSubsts(yo: string): ProcessSubstDoc[] {
  return extractSectionBody(yo, "Process Substitution").length > 0
    ? DOCS.map((doc) => ({ ...doc, section: "Process Substitution" }))
    : []
}
