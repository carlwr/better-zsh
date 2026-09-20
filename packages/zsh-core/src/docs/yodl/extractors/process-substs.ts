import { identity } from "../../brands.ts"
import type { ProcessSubstDoc } from "../../types.ts"
import { extractSectionBody } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"

// Hand-authored: the manual's section is prose without per-form items.
const DOCS: readonly { readonly op: string; readonly desc: string }[] = [
  {
    op: "<(...)",
    desc: "Run `list` as a subprocess and pass a special file connected to its output. The argument is usually a `/dev/fd/*` path or FIFO.",
  },
  {
    op: ">(...)",
    desc: "Run `list` as a subprocess and pass a special file that feeds its standard input when written to.",
  },
  {
    op: "=(...)",
    desc: "Run `list`, write its output to a temporary file, and pass that filename. This is useful for programs that need `lseek(2)`.",
  },
]

const SECTION = "Process Substitution"

export function parseProcessSubsts(yo: YodlSrc): readonly ProcessSubstDoc[] {
  return extractSectionBody(yo, SECTION).length > 0
    ? DOCS.map(({ op, desc }) => ({
        ...identity("process_subst", op),
        sig: op,
        desc,
        section: SECTION,
      }))
    : []
}
