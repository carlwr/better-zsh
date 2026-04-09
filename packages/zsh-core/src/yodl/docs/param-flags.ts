import type { ParamFlagDoc } from "../../types/zsh-data.ts"
import { parseFlagSection } from "./flag-section.ts"

export function parseParamFlags(yo: string): ParamFlagDoc[] {
  return parseFlagSection(yo, "Parameter Expansion Flags")
}
