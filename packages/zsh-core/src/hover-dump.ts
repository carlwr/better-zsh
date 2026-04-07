import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { HoverDoc, HoverKind } from "./hover-md.ts"

export type HoverDumpFile =
  | "all.md"
  | "options.md"
  | "cond-ops.md"
  | "params.md"
  | "builtins.md"
  | "precmds.md"
  | "redirs.md"
  | "process-substs.md"
  | "reserved-words.md"
  | "suspicious.md"

const dumpFiles: readonly [HoverKind | "all", HoverDumpFile][] = [
  ["all", "all.md"],
  ["option", "options.md"],
  ["cond-op", "cond-ops.md"],
  ["param", "params.md"],
  ["builtin", "builtins.md"],
  ["precmd", "precmds.md"],
  ["redir", "redirs.md"],
  ["process-subst", "process-substs.md"],
  ["reserved-word", "reserved-words.md"],
]

const suspiciousPatterns: readonly [string, RegExp][] = [
  ["empty ref", /\b(?:See|see|described in|noted in) (?:\\ )?\./],
  ["dangling continuation", /\\$/m],
  ["raw yodl marker", /\b(?:tt|var|example|manref|noderef)\(/],
]

function section(doc: HoverDoc): string {
  return `## ${doc.key}\n\n${doc.md}`
}

/** Split rendered hover docs into markdown dump files for QA/review. */
export function dumpText(
  docs: readonly HoverDoc[],
): Map<HoverDumpFile, string> {
  const byKind = new Map<HoverKind, HoverDoc[]>([
    ["option", []],
    ["cond-op", []],
    ["param", []],
    ["builtin", []],
    ["precmd", []],
    ["redir", []],
    ["process-subst", []],
    ["reserved-word", []],
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

/** Write hover markdown dump files to a directory. */
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
