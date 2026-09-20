import type { SubscriptFlagDoc } from "../../types.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { parseFlagSection } from "./flag-section.ts"

export function parseSubscriptFlags(yo: YodlSrc): readonly SubscriptFlagDoc[] {
  return parseFlagSection(yo, "Subscript Flags", "subscript_flag")
}
