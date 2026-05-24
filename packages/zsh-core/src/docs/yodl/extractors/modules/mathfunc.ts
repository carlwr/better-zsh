/**
 * mod_mathfunc.yo: math functions for use in `$(( ))` arithmetic.
 *
 * No `findex` per function — function names are embedded in arity-class prose
 * paragraphs. Strategy: extract tt() tokens from the relevant sentences and
 * synthesize a MathfuncDoc per function.
 *
 * Arity classes identified by keyword anchors in the source text:
 * - "single floating point argument" → arity-1 float, sig: name(x)
 * - "two floating point arguments" → arity-2 float, sig: name(x, y)
 * - "integer first argument and a floating point second" → sig: name(n, x)
 * - "floating point first argument and an integer second" → sig: name(x, n)
 * - atan: special (optional 2nd arg) → sig: ["atan(x)", "atan(x, y)"]
 * - ilogb: returns int → sig: ilogb(x)
 * - signgam: no args, returns int → sig: signgam()
 * - abs: no conversion → sig: abs(x)
 * - float/int: conversion → sig: float(x) / int(x)
 * - rand48: optional arg → sig: ["rand48()", "rand48(seed)"]
 *
 * "min, max, sum" are explicitly excluded (autoloadable, not in this module).
 */
import type { NonEmpty } from "@carlwr/typescript-extra"
import { mkDocumented } from "../../../brands.ts"
import type { MathfuncDoc } from "../../../types.ts"
import type { YNodeSeq, YodlSrc } from "../../core/nodes.ts"

const MODULE = "zsh/mathfunc" as const

export function extractMathfunc(yo: YodlSrc): readonly MathfuncDoc[] {
  // Need raw yodl text (tt(...) macros intact) so tt()-token extractor and
  // regex anchors agree. YNodeSeq (corpus path) re-serialises; string form
  // (tests) passes through.
  const raw = typeof yo === "string" ? yo : rawYodlText(yo)
  return parseMathfuncSource(raw)
}

// Re-serialise to raw-Yodl-like string for regex matching. Single-arg form
// `macroname(arg0)` covers all macros used here (`tt(name)`, `var(...)`).
// Lossy round-trip, sufficient for known arity-class sentences.
function rawYodlText(nodes: YNodeSeq): string {
  let out = ""
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.text
    } else {
      // Flatten first arg only — enough for `tt(name)` patterns
      out += `${node.name}(${rawYodlText(node.args[0] ?? [])})`
    }
  }
  return out
}

function rec(name: string, sig: NonEmpty<string>, desc: string): MathfuncDoc {
  return {
    name: mkDocumented("mathfunc", name),
    sig,
    desc,
    module: MODULE,
  }
}

/**
 * Push one record per function name in the matched arity-class paragraph.
 * `sigOf(name)` builds the call-form sig (e.g. `${name}(x)`); `descOf(name)`
 * builds the per-record desc (most arity classes share a description with the
 * name interpolated for `man 3 <name>`).
 */
function pushArityClass(
  out: MathfuncDoc[],
  src: string,
  re: RegExp,
  sigOf: (name: string) => string,
  descOf: (name: string) => string,
  filter: (name: string) => boolean = () => true,
): string[] {
  const match = src.match(re)
  if (!match) return []
  const names = extractTtNames(match[1] ?? "").filter(filter)
  for (const name of names) out.push(rec(name, [sigOf(name)], descOf(name)))
  return names
}

const stdDesc = (kind: string, name: string) =>
  `Standard mathematical function. ${kind}. See \`man 3 ${name}\`.`

function parseMathfuncSource(src: string): MathfuncDoc[] {
  const out: MathfuncDoc[] = []

  // --- arity-1 float ---
  // Paragraph ends with the sentence about atan's optional second argument.
  const arity1Names = pushArityClass(
    out,
    src,
    /following functions take a single floating point argument:\s*([\s\S]+?)(?=\n\nThe function tt\(signgam\)|\n\nThe functions tt\(min\))/,
    n => `${n}(x)`,
    n =>
      stdDesc(
        "Takes a single floating-point argument and returns a floating-point value",
        n,
      ),
    n => n !== "atan" && n !== "atan2" && n !== "ilogb",
  )

  // ilogb lives in the arity-1 paragraph but returns int.
  if (arity1Names.length > 0 || src.includes("tt(ilogb)")) {
    out.push(
      rec(
        "ilogb",
        ["ilogb(x)"],
        "Takes a single floating-point argument but returns an integer (the binary exponent of the argument). See `man 3 ilogb`.",
      ),
    )
  }

  // --- atan (optional 2nd arg) and signgam (zero-arg, returns int) ---
  out.push(
    rec(
      "atan",
      ["atan(x)", "atan(x, y)"],
      "Arctangent. With one argument, behaves like C `atan`. With two floating-point arguments, behaves like C `atan2(x, y)`. See `man 3 atan`.",
    ),
    rec(
      "signgam",
      ["signgam()"],
      "Takes no arguments; returns the C variable `signgam` (an integer indicating the sign of the most recent `gamma` or `lgamma` call). Useful only immediately after calling `gamma` or `lgamma`. Note: `signgam()` and `signgam` are distinct expressions. See `man 3 gamma`.",
    ),
  )

  // --- two float args ---
  pushArityClass(
    out,
    src,
    /following functions take two floating point arguments:\s*([\s\S]+?)(?=\n\n)/,
    n => `${n}(x, y)`,
    n => stdDesc("Takes two floating-point arguments", n),
  )

  // --- integer first, float second: jn, yn ---
  // NOTE: "second\nargument:" spans a line break in the source — use \s+
  pushArityClass(
    out,
    src,
    /following take an integer first argument and a floating point second\s+argument:\s*([\s\S]+?)(?=\n\n)/,
    n => `${n}(n, x)`,
    n =>
      stdDesc(
        "Takes an integer first argument and a floating-point second argument",
        n,
      ),
  )

  // --- float first, integer second: ldexp, scalb ---
  pushArityClass(
    out,
    src,
    /following take a floating point first argument and an integer second\s+argument:\s*([\s\S]+?)(?=\n\n)/,
    n => `${n}(x, n)`,
    n =>
      stdDesc(
        "Takes a floating-point first argument and an integer second argument",
        n,
      ),
  )

  // --- per-function specials ---
  out.push(
    rec(
      "abs",
      ["abs(x)"],
      "Returns the absolute value of its argument without converting its type: if given a floating-point number, returns a float; if given an integer, returns an integer.",
    ),
    rec(
      "float",
      ["float(x)"],
      "Converts its argument to a floating-point value.",
    ),
    rec(
      "int",
      ["int(x)"],
      "Converts its argument to an integer value (by truncation).",
    ),
    rec(
      "rand48",
      ["rand48()", "rand48(seed)"],
      "Returns a pseudo-random floating-point number between 0 and 1, using the `erand48(3)` library function. Without an argument, initialises the seed via three calls to `rand(3)`. With a string argument `seed`, stores and maintains the 12-digit hex seed in that parameter across calls, enabling independent random sequences. Available only if the system's math library provides `erand48`.",
    ),
  )

  return out
}

function extractTtNames(fragment: string): string[] {
  const names: string[] = []
  const rx = /tt\(([^)]+)\)/g
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
  while ((m = rx.exec(fragment)) !== null) {
    const name = m[1]?.trim()
    if (name && /^[a-zA-Z_]\w*$/.test(name)) names.push(name)
  }
  return names
}
