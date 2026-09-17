// The extension manifest's contribution points, staged into the published
// `package.json` at build time (`build/extension-stage.ts`). Runtime
// registrations: `contributions.ts`. Must stay loadable without `vscode`.

import { BETTER_ZSH_CONFIG, BETTER_ZSH_DISPLAY_NAME, ZSH_LANG_ID } from "./ids"
import { associations } from "./manifest/associations"

// ── Generated assets under `out/` ──

export const outAsset = {
  langConfig: "language-configuration.json",
  snippets: "snippets.json",
  chatInstructions: "zsh-chat-instructions.md",
} as const

const outPath = (name: string) => `./out/${name}`

// ── Settings ──

interface SettingMeta<T extends boolean | string> {
  readonly suffix: string
  readonly default: T
  readonly scope?: "machine"
  readonly description?: string
  readonly markdownDescription?: string
}

/** `zshPath` value that disables every zsh invocation. */
export const ZSH_PATH_OFF = "off"

export const diagnosticsEnabledSetting: SettingMeta<boolean> = {
  suffix: "diagnostics.enabled",
  default: true,
  description: "Enable syntax checking via zsh -n",
}

export const zshPathSetting: SettingMeta<string> = {
  suffix: "zshPath",
  scope: "machine",
  default: "",
  markdownDescription: `Path to the zsh binary. Leave empty to use \`zsh\` from PATH. Set to \`${ZSH_PATH_OFF}\` to never invoke any zsh binary.`,
}

export const settingKey = ({ suffix }: SettingMeta<boolean | string>) =>
  `${BETTER_ZSH_CONFIG}.${suffix}`

const configuration = {
  title: BETTER_ZSH_DISPLAY_NAME,
  properties: Object.fromEntries(
    [diagnosticsEnabledSetting, zshPathSetting].map(setting => {
      const { suffix: _, ...meta } = setting
      return [settingKey(setting), { type: typeof meta.default, ...meta }]
    }),
  ),
}

// ── Semantic tokens: legend names, and TM scopes for theming them ──

export const tokenTypes = ["function", "keyword"] as const
export const tokenModifiers = ["defaultLibrary"] as const
export type TokenType = (typeof tokenTypes)[number]
export type TokenModifier = (typeof tokenModifiers)[number]

type TokenSelector = TokenType | `${TokenType}.${TokenModifier}`

const semanticTokenScopes: Partial<Record<TokenSelector, string[]>> = {
  "function.defaultLibrary": ["support.function.builtin.shell"],
}

// ── The manifest ──

export const manifest = {
  activationEvents: [`onLanguage:${ZSH_LANG_ID}`],
  contributes: {
    languages: [
      {
        id: ZSH_LANG_ID,
        aliases: ["Zsh", "zsh"],
        ...associations,
        configuration: outPath(outAsset.langConfig),
      },
    ],
    grammars: [
      {
        language: ZSH_LANG_ID,
        scopeName: "source.shell.zsh",
        path: "./syntaxes/shell-unix-bash.tmLanguage.json",
      },
    ],
    snippets: [{ language: ZSH_LANG_ID, path: outPath(outAsset.snippets) }],
    semanticTokenScopes: [
      { language: ZSH_LANG_ID, scopes: semanticTokenScopes },
    ],
    configuration,
    configurationDefaults: {
      [`[${ZSH_LANG_ID}]`]: {
        "editor.tabSize": 2,
        "editor.insertSpaces": false,
      },
    },
    chatInstructions: [
      {
        path: outPath(outAsset.chatInstructions),
        when: `resourceLangId == ${ZSH_LANG_ID}`,
      },
    ],
  },
}
