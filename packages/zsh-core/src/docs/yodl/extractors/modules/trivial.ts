/**
 * Trivial module extractors — modules whose entire .yo file is a single flat
 * builtin-list or special-param-list with no per-module quirks. The wiring
 * here replaces what would otherwise be ~13 near-identical 7-line files.
 *
 * Non-trivial modules (multi-region, custom synopsis collapsing, mathfunc,
 * etc.) keep their own per-module files for explicit per-module logic.
 */
import type { CorpusYodlFile } from "../../../source-files.ts"
import type { ModuleName } from "../../../taxonomy.ts"
import type {
  BuiltinDoc,
  ShellParamDoc,
  ShellParamScope,
} from "../../../types.ts"
import type { YNodeSeq } from "../../core/nodes.ts"
import { parseModuleBuiltins, parseModuleParams } from "./helpers.ts"

type GetNodes = (file: CorpusYodlFile) => YNodeSeq

interface TrivialBuiltinModule {
  readonly file: CorpusYodlFile
  readonly module: ModuleName
}

interface TrivialParamModule {
  readonly file: CorpusYodlFile
  readonly module: ModuleName
  readonly scope: ShellParamScope
}

/**
 * Modules whose mod_*.yo file is a single `startitem()/enditem()` block of
 * builtins with no per-module quirks.
 */
const TRIVIAL_BUILTIN_MODULES: readonly TrivialBuiltinModule[] = [
  { file: "mod_attr.yo", module: "zsh/attr" },
  { file: "mod_cap.yo", module: "zsh/cap" },
  { file: "mod_clone.yo", module: "zsh/clone" },
  { file: "mod_computil.yo", module: "zsh/computil" },
  { file: "mod_db_gdbm.yo", module: "zsh/db/gdbm" },
  { file: "mod_private.yo", module: "zsh/param/private" },
  { file: "mod_zprof.yo", module: "zsh/zprof" },
  { file: "mod_zselect.yo", module: "zsh/zselect" },
  { file: "mod_zutil.yo", module: "zsh/zutil" },
]

/**
 * Modules whose mod_*.yo file is a single `startitem()/enditem()` block of
 * special-params with no per-module quirks.
 */
const TRIVIAL_PARAM_MODULES: readonly TrivialParamModule[] = [
  { file: "mod_langinfo.yo", module: "zsh/langinfo", scope: "shell-set" },
  { file: "mod_mapfile.yo", module: "zsh/mapfile", scope: "shell-set" },
  { file: "mod_parameter.yo", module: "zsh/parameter", scope: "shell-set" },
  {
    file: "mod_zleparameter.yo",
    module: "zsh/zleparameter",
    scope: "shell-set",
  },
]

export function extractTrivialBuiltinModules(
  gn: GetNodes,
): readonly BuiltinDoc[] {
  return TRIVIAL_BUILTIN_MODULES.flatMap(({ file, module }) =>
    parseModuleBuiltins(gn(file), module),
  )
}

export function extractTrivialParamModules(
  gn: GetNodes,
): readonly ShellParamDoc[] {
  return TRIVIAL_PARAM_MODULES.flatMap(({ file, module, scope }) =>
    parseModuleParams(gn(file), module, scope),
  )
}
