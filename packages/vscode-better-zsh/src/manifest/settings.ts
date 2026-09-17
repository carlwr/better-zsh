import { BETTER_ZSH_CONFIG, BETTER_ZSH_DISPLAY_NAME } from "../ids"

interface SettingMeta {
  readonly default: boolean | string
  readonly scope?: "machine"
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
  diagnosticsEnabled: setting("diagnostics.enabled", {
    default: true,
    description: "Enable syntax checking via zsh -n",
  }),
  zshPath: setting("zshPath", {
    scope: "machine",
    default: "",
    markdownDescription: `Path to the zsh binary. Leave empty to use \`zsh\` from PATH. Set to \`${ZSH_PATH_OFF}\` to never invoke any zsh binary.`,
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
