import type { ParamFlagDoc } from "../../types.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { parseParamFlagSection } from "./flag-section.ts"

export function parseParamFlags(
  yo: string | YNodeSeq,
): readonly ParamFlagDoc[] {
  return parseParamFlagSection(yo, "Parameter Expansion Flags")
}
