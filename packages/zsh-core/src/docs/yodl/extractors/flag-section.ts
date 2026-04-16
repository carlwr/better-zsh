import { mkDocumented } from "../../brands.ts"
import type { ParamFlagDoc, SubscriptFlagDoc } from "../../types.ts"
import { extractItems, extractSectionBody } from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

export function flagSigText(
  header: Parameters<typeof normalizeHeader>[0],
): string {
  return normalizeHeader(header)
}

export interface FlagSigParts {
  readonly flag: string
  readonly args: readonly string[]
}

export function splitFlagSig(sig: string): FlagSigParts {
  const parts = sig.split(":")
  return {
    flag: parts[0] ?? sig,
    args: parts.slice(1, -1).filter(Boolean),
  }
}

export function parseSubscriptFlagSection(
  yo: string,
  section: string,
): readonly SubscriptFlagDoc[] {
  return parseFlagSection(yo, section, sig =>
    mkDocumented("subscript_flag", sig),
  )
}

export function parseParamFlagSection(
  yo: string,
  section: string,
): readonly ParamFlagDoc[] {
  return parseFlagSection(yo, section, sig => mkDocumented("param_flag", sig))
}

function parseFlagSection<T>(
  yo: string,
  section: string,
  mkFlag: (raw: string) => T,
): readonly {
  readonly flag: T
  readonly args: readonly string[]
  readonly sig: string
  readonly desc: string
  readonly section: string
}[] {
  return extractItems(extractSectionBody(yo, section), 1).flatMap(item => {
    if (!item.body) return []
    const sig = normalizeHeader(item.header)
    const { args } = splitFlagSig(sig)
    return [
      {
        flag: mkFlag(sig),
        args,
        sig,
        desc: normalizeBody(item.body),
        section,
      },
    ]
  })
}
