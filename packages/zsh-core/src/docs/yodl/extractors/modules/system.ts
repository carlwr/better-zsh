/**
 * mod_system.yo: builtins (syserror, sysopen, sysread, syswrite, sysseek,
 * zsystem flock, zsystem supports), special params (errnos, sysparams), and
 * mathfunc systell.
 *
 * Three top-level item regions: Builtins, Math Functions, Parameters
 * (under `subsect()` headings; `extractSectionBody` doesn't see them so we
 * use `extractTopLevelItemRegions`).
 *
 * `zsystem flock` / `zsystem supports` are documented as separate items
 * sharing the head name `zsystem`; `mergeBuiltinsByName` folds them.
 */
import { mkDocumented } from "../../../brands.ts"
import type { BuiltinDoc, MathfuncDoc, ShellParamDoc } from "../../../types.ts"
import { extractFirstItemList } from "../../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../../core/nodes.ts"
import { asNodes } from "../../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../../core/text.ts"
import {
  extractTopLevelItemRegions,
  mergeBuiltinsByName,
  parseModuleBuiltins,
  parseModuleParamsFromList,
} from "./helpers.ts"

export function extractSystem(yo: YodlSrc): {
  builtins: readonly BuiltinDoc[]
  params: readonly ShellParamDoc[]
  mathfuncs: readonly MathfuncDoc[]
} {
  const [builtinsRegion, mathfuncsRegion, paramsRegion] =
    extractTopLevelItemRegions(asNodes(yo))

  const builtins = builtinsRegion
    ? mergeBuiltinsByName(parseModuleBuiltins(builtinsRegion, "zsh/system"))
    : []
  const mathfuncs = mathfuncsRegion ? parseSystemMathfuncs(mathfuncsRegion) : []
  const params = paramsRegion
    ? parseModuleParamsFromList(
        extractFirstItemList(paramsRegion),
        "zsh/system",
        "shell-set",
      )
    : []

  return { builtins, params, mathfuncs }
}

function parseSystemMathfuncs(region: YNodeSeq): readonly MathfuncDoc[] {
  // The systell item has form: item(tt(systell(var(fd))))(desc)
  // (`normalizeHeader` flattens to `systell(fd)`.)
  for (const item of extractFirstItemList(region)) {
    const sig = normalizeHeader(item.header)
    if (!sig.startsWith("systell")) continue
    return [
      {
        name: mkDocumented("mathfunc", "systell"),
        sig: ["systell(fd)"],
        desc: item.body ? normalizeBody(item.body) : "",
        module: "zsh/system",
      },
    ]
  }
  return []
}
