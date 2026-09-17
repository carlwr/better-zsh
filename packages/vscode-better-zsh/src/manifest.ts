import { BETTER_ZSH_DISPLAY_NAME, ZSH_LANG_ID } from "./ids"
import { associations } from "./manifest/associations"
import { semanticTokenScopes } from "./manifest/semantic-tokens"
import { configuration } from "./manifest/settings"

/** Generated under `out/` by the build; the manifest points at them by path. */
export const outAsset = {
  langConfig: "language-configuration.json",
  snippets: "snippets.json",
  chatInstructions: "zsh-chat-instructions.md",
} as const

export type OutAsset = keyof typeof outAsset

const out = (asset: OutAsset) => `./out/${outAsset[asset]}`

export const manifest = {
  displayName: BETTER_ZSH_DISPLAY_NAME,
  activationEvents: [`onLanguage:${ZSH_LANG_ID}`],
  contributes: {
    languages: [
      {
        id: ZSH_LANG_ID,
        aliases: ["Zsh", "zsh"],
        ...associations,
        configuration: out("langConfig"),
      },
    ],
    grammars: [
      {
        language: ZSH_LANG_ID,
        scopeName: "source.shell.zsh",
        path: "./syntaxes/shell-unix-bash.tmLanguage.json",
      },
    ],
    snippets: [{ language: ZSH_LANG_ID, path: out("snippets") }],
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
        path: out("chatInstructions"),
        when: `resourceLangId == ${ZSH_LANG_ID}`,
      },
    ],
  },
}
