import type { ParamFlagDoc } from "../../types.ts"
import { parseParamFlagSection } from "./flag-section.ts"

export function parseParamFlags(yo: string): readonly ParamFlagDoc[] {
  return parseParamFlagSection(yo, "Parameter Expansion Flags")
}
