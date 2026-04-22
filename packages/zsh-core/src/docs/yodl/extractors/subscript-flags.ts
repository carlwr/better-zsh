import type { SubscriptFlagDoc } from "../../types.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { parseSubscriptFlagSection } from "./flag-section.ts"

export function parseSubscriptFlags(
  yo: string | YNodeSeq,
): readonly SubscriptFlagDoc[] {
  return parseSubscriptFlagSection(yo, "Subscript Flags")
}
