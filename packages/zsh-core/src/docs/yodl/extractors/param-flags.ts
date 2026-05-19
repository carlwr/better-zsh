import { mkDocumented } from "../../brands.ts"
import type { ParamFlagDoc } from "../../types.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { parseFlagSection } from "./flag-section.ts"

export function parseParamFlags(yo: YodlSrc): readonly ParamFlagDoc[] {
  return parseFlagSection(yo, "Parameter Expansion Flags", sig =>
    mkDocumented("param_expn_flag", sig),
  )
}
