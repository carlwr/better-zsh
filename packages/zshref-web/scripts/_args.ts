// Arguments are decided before any asset loads — `--help` and a refused
// argument cost no model — so tests/nlp/reporters.test.ts spawns every
// script ungated.

import {
  assetsMissing,
  type EvalAssets,
  loadEvalAssets,
} from "../nlp/eval/assets"

/**
 * The flags given, or the process exits: `--help` prints `usage` (exit 0);
 * an argument outside `known` is refused with a note on stderr (exit 2).
 */
export function scriptFlags(
  name: string,
  usage: string,
  known: readonly string[],
): ReadonlySet<string> {
  const args = new Set(process.argv.slice(2))
  if (args.has("--help") || args.has("-h")) {
    process.stdout.write(`${usage}\n`)
    process.exit(0)
  }
  const unknown = [...args].filter(a => !known.includes(a))
  if (unknown.length > 0) {
    console.error(`${name}: unknown argument(s): ${unknown.join(" ")}`)
    process.exit(2)
  }
  return args
}

/** A reporter's preamble: the assets; a missing model exits 1 with the fetch hint, before anything loads. */
export async function reporterAssets(name: string): Promise<EvalAssets> {
  const missing = assetsMissing()
  if (missing.length > 0) {
    console.error(
      `${name}: missing ${missing.join(", ")} — run scripts/fetch-model`,
    )
    process.exit(1)
  }
  return loadEvalAssets()
}

/** The `BZ_TUNE_BASE` candidate spec; empty when unset. */
export const tuneBaseSpec = (): string => process.env.BZ_TUNE_BASE ?? ""
