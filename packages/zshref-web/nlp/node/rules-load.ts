// YAML → validated, normalized rules (the product `Rules` the ranker and the
// evals consume) and the JSON emit the SPA loads. The YAML is the editable
// form; the JSON is build output.

import { join } from "node:path"
import { mapAsync } from "@carlwr/typescript-extra"

import { ruleArtifact } from "../core/artifact-files"
import {
  byRuleFile,
  loadRules,
  RULE_FILES,
  type RuleFile,
  type Rules,
} from "../core/rules"
import { prettyJson, readYaml, writeFileDeep } from "./io"
import { PATHS } from "./paths"

export type RulePaths = Record<RuleFile, string>

/** The three rule files, validated and normalized (synonym terms trimmed and
 * lowercased — a phrase term like `process ID` never matches the lowercased
 * haystack otherwise). */
export async function loadRulesYaml(paths: RulePaths = PATHS): Promise<Rules> {
  const yamls = await mapAsync(RULE_FILES, f => readYaml(paths[f]))
  return loadRules(byRuleFile((_, at) => yamls[at]))
}

/**
 * Write one JSON per `RULE_FILES` under the artifacts `root` — the validated
 * form, so `synonyms.json` carries the normalized terms the SPA replays
 * before its own query embedding. Key order = shape order.
 */
export async function emitRulesJson(root: string, rules: Rules): Promise<void> {
  await mapAsync(RULE_FILES, f =>
    writeFileDeep(join(root, ruleArtifact(f)), prettyJson(rules[f])),
  )
}
