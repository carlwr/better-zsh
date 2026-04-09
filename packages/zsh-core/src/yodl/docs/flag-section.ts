import { extractItems, extractSectionBody } from "../core/doc.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

export function flagSigText(
  header: Parameters<typeof normalizeHeader>[0],
): string {
  return normalizeHeader(header)
}

export function splitFlagSig(sig: string): { flag: string; args: string[] } {
  const parts = sig.split(":")
  return {
    flag: parts[0] ?? sig,
    args: parts.slice(1, -1).filter(Boolean),
  }
}

interface FlagDocShape {
  flag: string
  args: readonly string[]
  sig: string
  desc: string
  section: string
}

export function parseFlagSection(yo: string, section: string): FlagDocShape[] {
  return extractItems(extractSectionBody(yo, section), 1).flatMap((item) => {
    if (!item.body) return []
    const sig = normalizeHeader(item.header)
    const { args } = splitFlagSig(sig)
    return [{ flag: sig, args, sig, desc: normalizeBody(item.body), section }]
  })
}
