import { type DocCategory, docCategories } from "./taxonomy.ts"

export const jsonArtifact = {
  builtin: { file: "builtins.json", count: "builtins", schema: "BuiltinsJson" },
  complex_command: {
    file: "complex-commands.json",
    count: "complexCommands",
    schema: "ComplexCommandsJson",
  },
  conditional_op: {
    file: "conditional-ops.json",
    count: "conditionalOps",
    schema: "ConditionalOpsJson",
  },
  glob_flag: {
    file: "glob-flags.json",
    count: "globFlags",
    schema: "GlobFlagsJson",
  },
  glob_op: {
    file: "glob-operators.json",
    count: "globOperators",
    schema: "GlobOperatorsJson",
  },
  glob_qualifier: {
    file: "glob-qualifiers.json",
    count: "globQualifiers",
    schema: "GlobQualifiersJson",
  },
  history_expn: {
    file: "history-expns.json",
    count: "historyExpns",
    schema: "HistoryExpnsJson",
  },
  option: { file: "options.json", count: "options", schema: "OptionsJson" },
  param_expn: {
    file: "param-expns.json",
    count: "paramExpns",
    schema: "ParamExpnsJson",
  },
  param_expn_flag: {
    file: "param-expn-flags.json",
    count: "paramExpnFlags",
    schema: "ParamExpnFlagsJson",
  },
  precmd_modifier: {
    file: "precmd-modifiers.json",
    count: "precmdModifiers",
    schema: "PrecmdModifiersJson",
  },
  process_subst: {
    file: "process-substs.json",
    count: "processSubsts",
    schema: "ProcessSubstsJson",
  },
  prompt_escape: {
    file: "prompt-escapes.json",
    count: "promptEscapes",
    schema: "PromptEscapesJson",
  },
  redirection: {
    file: "redirections.json",
    count: "redirections",
    schema: "RedirectionsJson",
  },
  reserved_word: {
    file: "reserved-words.json",
    count: "reservedWords",
    schema: "ReservedWordsJson",
  },
  special_param: {
    file: "special-params.json",
    count: "specialParams",
    schema: "SpecialParamsJson",
  },
  subscript_flag: {
    file: "subscript-flags.json",
    count: "subscriptFlags",
    schema: "SubscriptFlagsJson",
  },
  zle_widget: {
    file: "zle-widgets.json",
    count: "zleWidgets",
    schema: "ZleWidgetsJson",
  },
  keymap: { file: "keymaps.json", count: "keymaps", schema: "KeymapsJson" },
  job_spec: {
    file: "job-specs.json",
    count: "jobSpecs",
    schema: "JobSpecsJson",
  },
  arith_op: {
    file: "arith-ops.json",
    count: "arithOps",
    schema: "ArithOpsJson",
  },
  special_function: {
    file: "special-functions.json",
    count: "specialFunctions",
    schema: "SpecialFunctionsJson",
  },
} as const satisfies {
  [K in DocCategory]: {
    file: string
    count: string
    schema: string
  }
}

type JsonArtifact = (typeof jsonArtifact)[DocCategory]

export type JsonDataFile = JsonArtifact["file"]
export type JsonCountKey = JsonArtifact["count"]
export type JsonSchemaRoot = JsonArtifact["schema"]

export const jsonDataFiles = [...docCategories]
  .map(cat => jsonArtifact[cat].file)
  .sort() as readonly JsonDataFile[]

export const jsonFiles = ["index.json", ...jsonDataFiles] as const

export function schemaFile(file: string): string {
  return file.replace(/\.json$/, ".schema.json")
}
