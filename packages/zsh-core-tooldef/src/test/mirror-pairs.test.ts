/**
 * Mirror-link integrity: `parity-units.ts` is the source of truth; markers in
 * sources must match it exactly. See DESIGN.md §"Parity surface units".
 *
 * The scan is intentionally narrow: only `.ts` / `.rs` source files outside
 * `test` / `tests` / build output trees count, so prose in docs does not look
 * like live markers.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { parityUnits } from "./parity-units.ts"

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
)

const ignoredDirs = new Set([
  ".git",
  "dist",
  "node_modules",
  "target",
  "test",
  "tests",
])
const markerRe = /^\/\/\s+(MIRRORED-IN|MIRROR-OF):\s+([A-Za-z0-9._/-]+)\s*$/

type MarkerKind = "MIRRORED-IN" | "MIRROR-OF"
interface Marker {
  readonly kind: MarkerKind
  readonly source: string
  readonly target: string
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(path))
      continue
    }
    if (
      !path.endsWith(".d.ts") &&
      (path.endsWith(".ts") || path.endsWith(".rs"))
    )
      out.push(path)
  }
  return out
}

function collectMarkers(): readonly Marker[] {
  const markers: Marker[] = []
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file)
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(markerRe)
      if (m)
        markers.push({
          kind: m[1] as MarkerKind,
          source: rel,
          target: m[2] ?? "",
        })
    }
  }
  return markers
}

const markers = collectMarkers()

const markerKey = (m: Marker) => `${m.source}\0${m.target}`

function countBy<T>(items: readonly T[], keyOf: (item: T) => string) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = keyOf(item)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

function serialCounts(m: Map<string, number>): string {
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|")
}

function markersFromUnits(): { ins: Marker[]; ofs: Marker[] } {
  const ins: Marker[] = []
  const ofs: Marker[] = []
  for (const u of parityUnits) {
    for (const ts of u.ts) {
      ins.push({ kind: "MIRRORED-IN", source: ts, target: u.rs })
      ofs.push({ kind: "MIRROR-OF", source: u.rs, target: ts })
    }
  }
  return { ins, ofs }
}

function firstSourceLine(rel: string): string {
  const body = readFileSync(join(repoRoot, rel), "utf8")
  const line = body.split(/\r?\n/)[0] ?? ""
  return line
}

describe("mirror-pairs", () => {
  test("parity unit names are unique", () => {
    const names = parityUnits.map(u => u.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("parity unit toolName values are unique", () => {
    const names = parityUnits.flatMap(u =>
      u.toolName !== undefined ? [u.toolName] : [],
    )
    expect(new Set(names).size).toBe(names.length)
  })

  test("declared TS↔RS edges match repo markers exactly", () => {
    const { ins: expIn, ofs: expOf } = markersFromUnits()
    const actIn = markers.filter(m => m.kind === "MIRRORED-IN")
    const actOf = markers.filter(m => m.kind === "MIRROR-OF")

    for (const marker of markers) {
      expect(extname(marker.source), marker.source).toBe(
        marker.kind === "MIRRORED-IN" ? ".ts" : ".rs",
      )
    }

    expect(
      serialCounts(countBy(actIn, markerKey)),
      "MIRRORED-IN multiset",
    ).toBe(serialCounts(countBy(expIn, markerKey)))
    expect(serialCounts(countBy(actOf, markerKey)), "MIRROR-OF multiset").toBe(
      serialCounts(countBy(expOf, markerKey)),
    )
  })

  test("each TS file starts with MIRRORED-IN to its unit rs", () => {
    for (const u of parityUnits) {
      for (const ts of u.ts) {
        const line = firstSourceLine(ts)
        expect(line, ts).toBe(`// MIRRORED-IN: ${u.rs}`)
      }
    }
  })
})
