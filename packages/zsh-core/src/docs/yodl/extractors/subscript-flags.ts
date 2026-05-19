import { mkDocumented } from "../../brands.ts"
import type { SubscriptFlagDoc } from "../../types.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { parseFlagSection } from "./flag-section.ts"

export function parseSubscriptFlags(yo: YodlSrc): readonly SubscriptFlagDoc[] {
  return parseFlagSection(yo, "Subscript Flags", sig =>
    mkDocumented("subscript_flag", sig),
  )
}
