import { BETTER_ZSH_CONFIG } from "./ids"

interface SettingMeta {
  readonly suffix: string
  readonly type: "boolean" | "string"
  readonly default: boolean | string
  readonly scope?: "machine"
  readonly description?: string
  readonly markdownDescription?: string
}

export const diagnosticsEnabledSetting = {
  suffix: "diagnostics.enabled",
  type: "boolean",
  default: true,
  description: "Enable syntax checking via zsh -n",
} as const satisfies SettingMeta

export const zshPathSetting = {
  suffix: "zshPath",
  type: "string",
  scope: "machine",
  default: "",
  markdownDescription:
    "Path to the zsh binary. Leave empty to use `zsh` from PATH. Set to `off` to never invoke any zsh binary.",
} as const satisfies SettingMeta

export const settingFullKey = ({ suffix }: SettingMeta) =>
  `${BETTER_ZSH_CONFIG}.${suffix}` as const

export function buildSettingsConfiguration() {
  return {
    title: "Better Zsh",
    properties: Object.fromEntries(
      [diagnosticsEnabledSetting, zshPathSetting].map(setting => {
        const { suffix: _, ...manifest } = setting
        return [settingFullKey(setting), manifest]
      }),
    ),
  }
}
