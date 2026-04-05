import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { HoverDoc, HoverKind } from "./hover-md"

export type HoverDumpFile =
  | "all.md"
  | "options.md"
  | "cond-ops.md"
  | "params.md"
  | "suspicious.md"

const dumpFiles: readonly [HoverKind | "all", HoverDumpFile][] = [
  ["all", "all.md"],
  ["option", "options.md"],
  ["cond-op", "cond-ops.md"],
  ["param", "params.md"],
]

const suspiciousPatterns: readonly [string, RegExp][] = [
  ["empty ref", /\b(?:See|see|described in|noted in) (?:\\ )?\./],
  ["dangling continuation", /\\$/m],
  ["raw yodl marker", /\b(?:tt|var|example|manref|noderef)\(/],
]

function section(doc: HoverDoc): string {
  return `## ${doc.key}\n\n${doc.md}`
}

export function dumpText(
  docs: readonly HoverDoc[],
): Map<HoverDumpFile, string> {
  const byKind = new Map<HoverKind, HoverDoc[]>([
    ["option", []],
    ["cond-op", []],
    ["param", []],
  ])
  for (const doc of docs) byKind.get(doc.kind)?.push(doc)

  const entries: [HoverDumpFile, string][] = [
    ...dumpFiles.map(
      ([kind, file]) =>
        [
          file,
          (kind === "all" ? docs : (byKind.get(kind) ?? []))
            .map(section)
            .join("\n\n---\n\n")
            .concat("\n"),
        ] satisfies [HoverDumpFile, string],
    ),
    ["suspicious.md", suspiciousText(docs)],
  ]
  return new Map(entries)
}

export async function writeHoverDump(
  dir: string,
  docs: readonly HoverDoc[],
): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const [file, text] of dumpText(docs)) {
    await writeFile(join(dir, file), text, "utf8")
  }
}

function suspiciousText(docs: readonly HoverDoc[]): string {
  const hits = docs.flatMap((doc) =>
    suspiciousPatterns
      .filter(([, re]) => re.test(doc.md))
      .map(([name]) => `- ${doc.kind}:${doc.key} — ${name}`),
  )
  return hits.length > 0 ? `${hits.join("\n")}\n` : ""
}
