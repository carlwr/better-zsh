// The layering fence. Every source file sits in one tier; each tier's imports
// are a table (`TIERS`), not prose. Pinned: the browser bundle (`nlp/core`,
// `nlp/browser`, `src`) carries no Node builtin and no Node-side package, and
// each of its tiers reaches only the tiers beneath it; the Node side
// (`nlp/node`, `scripts`) never imports the browser modules or the app; the
// app's one door into `nlp/` is the `$nlp` alias — the facade file, not the
// dir. Type-only imports count too: the seam is absolute. `vite build` is the
// fence's other half — this test names the offender before the bundle breaks.

import { readdirSync, readFileSync } from "node:fs"
import { builtinModules } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { PATHS } from "../nlp/node/paths"

const pkgDir = PATHS.pkgDir

interface Tier {
  name: string
  /** Package-relative dirs; a file root (`nlp/browser.ts`) is named without its extension. */
  roots: string[]
  /** No Node builtin, no `FORBIDDEN_PACKAGES`. */
  browser: boolean
  /** The `$…` specifiers the tier may use; none by default. */
  alias?: RegExp
  /** Relative imports must land under one of these. */
  within?: string[]
  /** Relative imports must land under none of these. */
  deny?: string[]
}

const TIERS: Tier[] = [
  { name: "core", roots: ["nlp/core"], browser: true, within: ["nlp/core"] },
  {
    name: "browser",
    roots: ["nlp/browser"],
    browser: true,
    within: ["nlp/browser", "nlp/core"],
  },
  {
    name: "src",
    roots: ["src"],
    browser: true,
    within: ["src"],
    alias: /^(\$lib|\$app)(\/|$)|^\$nlp$/,
  },
  {
    name: "node",
    roots: ["nlp/node", "scripts"],
    browser: false,
    deny: ["nlp/browser", "src"],
  },
]

const WALKED = ["src", "nlp", "scripts"]

const SOURCE_RE = /\.(ts|mts|js|mjs|svelte)$/

// Static `from '…'` (import and re-export), dynamic `import('…')`, and
// side-effect `import '…'`.
const SPECIFIER_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
]

const FORBIDDEN_PACKAGES = [
  "@carlwr/zsh-core",
  "onnxruntime-node",
  "yaml",
  "tsx",
]
const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules)

interface Import {
  file: string
  line: number
  specifier: string
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (SOURCE_RE.test(entry.name)) yield path
  }
}

function importsOf(file: string): Import[] {
  const text = readFileSync(file, "utf8")
  const out: Import[] = []
  for (const re of SPECIFIER_RES) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split("\n").length
      out.push({ file, line, specifier: m[1] ?? "" })
    }
  }
  return out
}

const isPackage = (spec: string, pkg: string): boolean =>
  spec === pkg || spec.startsWith(`${pkg}/`)

const isBuiltin = (spec: string): boolean =>
  spec.startsWith("node:") ||
  NODE_BUILTINS.has(spec) ||
  NODE_BUILTINS.has(spec.split("/")[0] ?? "")

/** `path` (absolute, extension-less) is `root` or beneath it. */
function under(path: string, root: string): boolean {
  const rel = relative(resolve(pkgDir, root), path)
  return rel === "" || !(rel.startsWith("..") || isAbsolute(rel))
}

const tierOf = (file: string): Tier | undefined => {
  const path = file.replace(/\.[^/.]+$/, "")
  return TIERS.find(t => t.roots.some(r => under(path, r)))
}

/** Why `specifier`, imported from `file`, breaches the fence; null if it does not. */
function breach(file: string, specifier: string): string | null {
  const tier = tierOf(file)
  if (!tier) return "untiered source file"
  if (specifier.startsWith("$"))
    return tier.alias?.test(specifier) ? null : `no such alias for ${tier.name}`
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(file), specifier)
    const hit = tier.deny?.find(d => under(target, d))
    if (hit) return `${tier.name} reaches ${hit}`
    if (tier.within && !tier.within.some(w => under(target, w)))
      return `leaves ${tier.name}`
    return null
  }
  if (!tier.browser) return null
  if (isBuiltin(specifier)) return "Node builtin"
  const pkg = FORBIDDEN_PACKAGES.find(p => isPackage(specifier, p))
  return pkg ? `Node-side package ${pkg}` : null
}

describe("import fence", () => {
  const files = WALKED.flatMap(d => [...walk(resolve(pkgDir, d))])
  const imports = files.flatMap(importsOf)

  // A scanner that finds nothing would pass vacuously.
  it.each(TIERS)("sees the $name tier", tier => {
    expect(imports.filter(i => tierOf(i.file) === tier).length).toBeGreaterThan(
      0,
    )
  })

  it("every source file sits in a tier", () => {
    const stray = files.filter(f => !tierOf(f)).map(f => relative(pkgDir, f))
    expect(stray).toEqual([])
  })

  it("every import stays in its tier's table", () => {
    const offenders = imports.flatMap(i => {
      const why = breach(i.file, i.specifier)
      return why
        ? [`${relative(pkgDir, i.file)}:${i.line}  ${i.specifier}  (${why})`]
        : []
    })
    expect(
      offenders,
      `imports crossing the fence:\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  it.each([
    ["src/lib/x.ts", "node:fs", "Node builtin"],
    ["src/lib/x.ts", "fs/promises", "Node builtin"],
    ["src/lib/x.ts", "path", "Node builtin"],
    ["src/lib/x.ts", "@carlwr/zsh-core", "Node-side package @carlwr/zsh-core"],
    [
      "src/lib/x.ts",
      "@carlwr/zsh-core/resolver",
      "Node-side package @carlwr/zsh-core",
    ],
    ["src/lib/x.ts", "onnxruntime-node", "Node-side package onnxruntime-node"],
    ["src/lib/x.ts", "../../nlp/node/paths", "leaves src"],
    ["src/lib/x.ts", "../../nlp/browser", "leaves src"],
    ["src/lib/x.ts", "../../tests/_helpers", "leaves src"],
    ["src/lib/x.ts", "$nlp/core/rank", "no such alias for src"],
    ["src/lib/x.ts", "./view", null],
    ["src/lib/x.ts", "../app.css", null],
    ["src/lib/x.ts", "$lib/view", null],
    ["src/lib/x.ts", "$app/state", null],
    ["src/lib/x.ts", "$nlp", null],
    ["nlp/browser/x.ts", "yaml", "Node-side package yaml"],
    ["nlp/browser/x.ts", "../node/paths", "leaves browser"],
    ["nlp/browser/x.ts", "../core/rank", null],
    ["nlp/browser/x.ts", "@huggingface/transformers", null],
    ["nlp/browser.ts", "./browser/search", null],
    ["nlp/core/x.ts", "../browser/search", "leaves core"],
    ["nlp/core/x.ts", "../node/paths", "leaves core"],
    ["nlp/core/x.ts", "$nlp", "no such alias for core"],
    ["nlp/core/x.ts", "zod", null],
    ["nlp/node/x.ts", "node:fs", null],
    ["nlp/node/x.ts", "yaml", null],
    ["nlp/node/x.ts", "../browser/search", "node reaches nlp/browser"],
    ["nlp/node/x.ts", "../browser", "node reaches nlp/browser"],
    ["nlp/node/x.ts", "../core/rank", null],
    ["scripts/x.ts", "../src/lib/errors", "node reaches src"],
    ["scripts/x.ts", "../nlp/node/paths", null],
    ["tests/x.ts", "./_helpers", "untiered source file"],
  ])("%s importing %s: %s", (file, specifier, why) => {
    expect(breach(resolve(pkgDir, file), specifier)).toBe(why)
  })
})
