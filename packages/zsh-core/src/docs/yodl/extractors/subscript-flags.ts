import type { SubscriptFlagDoc } from "../../types.ts"
import { parseSubscriptFlagSection } from "./flag-section.ts"

export function parseSubscriptFlags(yo: string): readonly SubscriptFlagDoc[] {
  return parseSubscriptFlagSection(yo, "Subscript Flags")
}
