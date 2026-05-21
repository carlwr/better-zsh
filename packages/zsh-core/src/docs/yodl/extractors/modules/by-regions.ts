/**
 * Table-driven extractors for module .yo files whose extraction composes from
 * `parseModuleByRegions` or `mergeBuiltinsByName(parseModuleBuiltins(...))`.
 * The wiring here replaces what would otherwise be ~9 near-identical tiny
 * files (datetime, pcre, regex, sched, socket, termcap, terminfo, watch,
 * zpty).
 *
 * Non-trivial modules (mod_mathfunc, mod_system, mod_stat, mod_deltochar)
 * keep their own per-module files for explicit per-module logic. Truly flat
 * one-region modules live in the parallel `trivial.ts` tables.
 */
import type { CorpusYodlFile } from "../../../source-files.ts"
import type { ModuleName } from "../../../taxonomy.ts"
import type { BuiltinDoc, CondOpDoc, ShellParamDoc } from "../../../types.ts"
import type { YNodeSeq } from "../../core/nodes.ts"
import {
  mergeBuiltinsByName,
  parseModuleBuiltins,
  parseModuleByRegions,
  type RegionSpec,
} from "./helpers.ts"

type GetNodes = (file: CorpusYodlFile) => YNodeSeq

interface RegionModule {
  readonly file: CorpusYodlFile
  readonly module: ModuleName
  readonly regions: readonly RegionSpec[]
}

interface MergedBuiltinModule {
  readonly file: CorpusYodlFile
  readonly module: ModuleName
}

const params = {
  kind: "params",
  scope: "shell-set",
} as const satisfies RegionSpec
const builtins = { kind: "builtins" } as const satisfies RegionSpec
const condOps = { kind: "condOps" } as const satisfies RegionSpec

/**
 * Modules whose mod_*.yo has multiple top-level `startitem()/enditem()`
 * regions, each carrying a single doc category. See `parseModuleByRegions`.
 */
const REGION_MODULES: readonly RegionModule[] = [
  {
    file: "mod_datetime.yo",
    module: "zsh/datetime",
    regions: [builtins, params],
  },
  { file: "mod_pcre.yo", module: "zsh/pcre", regions: [builtins, condOps] },
  { file: "mod_regex.yo", module: "zsh/regex", regions: [condOps] },
  { file: "mod_sched.yo", module: "zsh/sched", regions: [builtins, params] },
  {
    file: "mod_termcap.yo",
    module: "zsh/termcap",
    regions: [builtins, params],
  },
  {
    file: "mod_terminfo.yo",
    module: "zsh/terminfo",
    regions: [builtins, params],
  },
  { file: "mod_watch.yo", module: "zsh/watch", regions: [params, builtins] },
]

/**
 * Modules whose mod_*.yo documents one builtin name spread across sibling
 * item blocks; `mergeBuiltinsByName` folds them into one multi-synopsis
 * record.
 */
const MERGED_BUILTIN_MODULES: readonly MergedBuiltinModule[] = [
  { file: "mod_socket.yo", module: "zsh/net/socket" },
  { file: "mod_zpty.yo", module: "zsh/zpty" },
]

const hasKind = (m: RegionModule, kind: RegionSpec["kind"]): boolean =>
  m.regions.some(r => r.kind === kind)

const parseRegion = (gn: GetNodes, m: RegionModule) =>
  parseModuleByRegions(gn(m.file), m.module, m.regions)

export const extractRegionBuiltins = (gn: GetNodes): readonly BuiltinDoc[] =>
  REGION_MODULES.filter(m => hasKind(m, "builtins")).flatMap(
    m => parseRegion(gn, m).builtins,
  )

export const extractRegionParams = (gn: GetNodes): readonly ShellParamDoc[] =>
  REGION_MODULES.filter(m => hasKind(m, "params")).flatMap(
    m => parseRegion(gn, m).params,
  )

export const extractRegionCondOps = (gn: GetNodes): readonly CondOpDoc[] =>
  REGION_MODULES.filter(m => hasKind(m, "condOps")).flatMap(
    m => parseRegion(gn, m).condOps,
  )

export const extractMergedBuiltinModules = (
  gn: GetNodes,
): readonly BuiltinDoc[] =>
  MERGED_BUILTIN_MODULES.flatMap(({ file, module }) =>
    mergeBuiltinsByName(parseModuleBuiltins(gn(file), module)),
  )
