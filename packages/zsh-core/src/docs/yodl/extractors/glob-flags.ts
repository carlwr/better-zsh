import { mkDocumented } from "../../brands.ts"
import type { GlobFlagDoc } from "../../types.ts"
import {
  extractFirstItemList,
  extractSectionBody,
  withBody,
} from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import {
  normalizeBody,
  normalizeHeader,
  ttTexts,
  varTexts,
} from "../core/text.ts"

const SECTION = "Globbing Flags"

export function parseGlobFlags(yo: YodlSrc): readonly GlobFlagDoc[] {
  return withBody(
    extractFirstItemList(extractSectionBody(yo, SECTION)),
  ).flatMap(item => {
    const desc = normalizeBody(item.body)
    const tt = ttTexts(item.header)
    const vars = varTexts(item.header)
    const sig = normalizeHeader(item.header)

    // `tt(a)tt(b)…` with no var() — header lists several solo flags sharing
    // a body. Emit one record per flag.
    if (vars.length === 0 && tt.length > 1) {
      return tt.map(
        flag =>
          ({
            flag: mkDocumented("glob_flag", flag),
            args: [],
            sig: flag,
            desc,
            section: SECTION,
          }) satisfies GlobFlagDoc,
      )
    }

    const [flag = sig] = tt
    return [
      {
        flag: mkDocumented("glob_flag", flag),
        args: vars,
        sig,
        desc,
        section: SECTION,
      } satisfies GlobFlagDoc,
    ]
  })
}
