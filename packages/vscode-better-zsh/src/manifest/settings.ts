import { BETTER_ZSH_CONFIG, BETTER_ZSH_DISPLAY_NAME } from "../ids"

interface SettingMeta {
  readonly default: boolean | string
  readonly scope?: "machine" | "resource"
  readonly description?: string
  readonly markdownDescription?: string
}

/** `zshPath` value that disables every zsh invocation. */
export const ZSH_PATH_OFF = "off"

const setting = <const M extends SettingMeta>(suffix: string, meta: M) => ({
  key: `${BETTER_ZSH_CONFIG}.${suffix}`,
  ...meta,
})

export const settings = {
  // Per folder: a multi-root folder's own `.vscode/settings.json` applies.
  diagnosticsEnabled: setting("diagnostics.enabled", {
    scope: "resource",
    default: true,
    markdownDescription: `Report syntax errors found by \`zsh -n\`. This is the only use of the host zsh: when off, no zsh is spawned for these files. To never run zsh at all, set \`#${BETTER_ZSH_CONFIG}.zshPath#\` to \`${ZSH_PATH_OFF}\`.`,
  }),
  zshPath: setting("zshPath", {
    scope: "machine",
    default: "",
    markdownDescription: `Absolute path to the zsh binary used for diagnostics. Leave empty to use \`zsh\` from PATH; set to \`${ZSH_PATH_OFF}\` to never run zsh. Relative paths are rejected.`,
  }),
}

export type Setting = (typeof settings)[keyof typeof settings]

/** The JSON-schema type of each setting follows its default. */
export const configuration = {
  title: BETTER_ZSH_DISPLAY_NAME,
  properties: Object.fromEntries(
    Object.values(settings).map(({ key, ...meta }) => [
      key,
      { type: typeof meta.default, ...meta },
    ]),
  ),
}
