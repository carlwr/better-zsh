import type { SubscriptFlagDoc } from "../../types/zsh-data.ts"
import { parseFlagSection } from "./flag-section.ts"

export function parseSubscriptFlags(yo: string): SubscriptFlagDoc[] {
  return parseFlagSection(yo, "Subscript Flags")
}
