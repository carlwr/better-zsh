/**
 * Modules whose entire .yo file is a single flat builtin-list or
 * special-param-list with no quirks.
 */
import type { YodlSourceFile } from "../../../source-files.ts"
import type { ModuleName } from "../../../taxonomy.ts"
import type {
  BuiltinDoc,
  SpecialParamDoc,
  SpecialParamScope,
} from "../../../types.ts"
import type { YNodeSeq } from "../../core/nodes.ts"
import { parseModuleBuiltins, parseModuleParams } from "./helpers.ts"

type GetNodes = (file: YodlSourceFile) => YNodeSeq

interface TrivialBuiltinModule {
  readonly file: YodlSourceFile
  readonly module: ModuleName
}

interface TrivialParamModule {
  readonly file: YodlSourceFile
  readonly module: ModuleName
  readonly scope: SpecialParamScope
}

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
): readonly SpecialParamDoc[] {
  return TRIVIAL_PARAM_MODULES.flatMap(({ file, module, scope }) =>
    parseModuleParams(gn(file), module, scope),
  )
}
