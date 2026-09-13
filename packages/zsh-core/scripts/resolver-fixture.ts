import type { DocCorpus } from "../src/docs/corpus.ts"
import type {
  ResolverFixtureCase,
  ResolverFixtureCases,
  ResolverFixtureJson,
} from "../src/docs/json-types.ts"
import { lookupRaw, resolverFeedback } from "../src/docs/resolver.ts"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docDisplay,
  idOf,
} from "../src/docs/taxonomy.ts"

type Inputs = readonly string[]

/**
 * Inputs a resolver is known to have an opinion on: the resolver tests'
 * hit/miss tables, tooldef's pinned parity cases, JSDoc examples.
 */
const pinnedInputs: { readonly [K in DocCategory]?: Inputs } = {
  option: [
    "AUTO_CD",
    "auto_cd",
    "au_to_cd",
    "  AUTO_CD  ",
    "NO_AUTO_CD",
    "noautocd",
    "notify",
    "NO_NOTIFY",
    "bogus",
    "no_bogus",
  ],
  builtin: ["echo"],
  special_param: [
    "$#",
    "$?",
    "${#}",
    "$PATH",
    "${PATH}",
    "  $PATH  ",
    "compstate[context]",
    "$compstate[context]",
    "pipestatus[1]",
    "compstate[a.b]",
    "words[CURRENT]",
    "compstate[]",
    "unknown[x]",
    "${}",
    "$bogus",
    "${bogus}",
  ],
  redirection: [
    "> file",
    "2>&1",
    "2>& 1",
    "<<EOF",
    "<< EOF",
    "<<-EOF",
    "2<<EOF",
    "2<<-EOF",
    "> word",
    ">& number",
    "<<[-] word",
    "<<-",
    "2>&",
    "<&file",
    "<& file",
  ],
  subscript_flag: [
    "w",
    "(w)",
    "e",
    "(e)",
    "e:string:",
    "(e:string:)",
    "Z",
    "(Z)",
  ],
  param_expn_flag: [
    "@",
    "(@)",
    "U",
    "(U)",
    "j:string:",
    "(j:string:)",
    "Y",
    "(Y)",
  ],
  history_expn: [
    "!42",
    "!-3",
    "!foo",
    "!?bar",
    "!?bar?",
    "!?zsh",
    "!#",
    "!{...}",
    "!{foo}",
    "^old^new",
    "^old^new^",
    "  !42  ",
    "0",
    "a",
    "n",
    ":h",
    "h",
    "^",
    "^^",
    "^foo",
    "!!bogus",
    "!$",
  ],
  glob_flag: ["i", "(i)", "I", "(#I)", "Z", "(Z)", "(#Z)", "(#)"],
  glob_qualifier: [
    "/",
    "(/)",
    "(#q/)",
    "@",
    "(#q@)",
    "Z",
    "(Z)",
    "(#qZ)",
    "(#q)",
  ],
  job_spec: [
    "%%",
    "%+",
    "%-",
    "%5",
    "%42",
    "%bash",
    "%?foo",
    "  %1  ",
    "%number",
    "foo",
    "1",
    "%?",
    "not-a-spec",
  ],
  special_function: [
    "chpwd",
    "precmd",
    "TRAPDEBUG",
    "TRAPEXIT",
    "TRAPZERR",
    "chpwd_functions",
    "TRAPHUP",
    "TRAPUSR1",
    "TRAPERR",
    "foo_functions",
    "TRAPfoo",
  ],
}

/**
 * Fed to every category: a token that resolves in one category must not leak
 * into another (per-category answers fix the resolver-walk answer too).
 */
const crossCategoryInputs: Inputs = [
  "",
  " ",
  "AUTO_CD",
  "NO_AUTO_CD",
  "NOTIFY",
  "NO_NOTIFY",
  "autocd",
  "no_",
  "not-an-option",
  "echo",
  "[[",
  "for",
  "not-a-real-token",
  "anything",
  "-",
  "$",
  "$#",
  "x[y]",
  "%",
  "%1",
  "!",
  "!!",
  "(",
  ")",
  "()",
  "(#i)",
  ">",
  ">&",
  "<&",
  "2>&1",
  "<<",
  "<<EOF",
  "TRAP",
  "TRAPINT",
  "_functions",
  "precmd_functions",
]

type ExtraInputs<K extends DocCategory> = (doc: DocRecordMap[K]) => Inputs

// Operand example per documented tail word; a sig with a tail not listed here
// fails the build rather than going untested.
const redirTailExamples: Readonly<Record<string, string>> = {
  number: "1",
  word: "file",
  "-": "-",
  p: "p",
}

const redirInputs: ExtraInputs<"redirection"> = ({ sig, groupOp }) => {
  const tail = sig.slice(groupOp.length).trim()
  const ex = redirTailExamples[tail]
  if (ex === undefined) throw new Error(`no operand example for tail ${tail}`)
  const ops = groupOp === "<<[-]" ? ["<<", "<<-"] : [groupOp]
  return ops.flatMap(op => [op, `${op}${ex}`, `${op} ${ex}`, `2${op}${ex}`])
}

const colonFlagInputs: ExtraInputs<
  "subscript_flag" | "param_expn_flag"
> = d => [`(${d.flag})`, `(${d.sig})`]

const globInputs =
  (marker: string): ExtraInputs<"glob_flag" | "glob_qualifier"> =>
  d => [`(${marker}${d.flag})`, `(${d.flag})`]

/**
 * Per-record surface forms beyond id and display: the shapes a category's
 * resolver accepts (sigils, wrapping parens, negation, operands).
 */
const extraInputs: { readonly [K in DocCategory]?: ExtraInputs<K> } = {
  option: d => [`NO_${d.display}`, `no${d.name}`, d.name.toUpperCase()],
  special_param: d => [
    `$${d.name}`,
    `\${${d.name}}`,
    `${d.name}[1]`,
    `$${d.name}[1]`,
  ],
  redirection: redirInputs,
  subscript_flag: colonFlagInputs,
  param_expn_flag: colonFlagInputs,
  glob_flag: globInputs("#"),
  glob_qualifier: globInputs("#q"),
  special_function: d => [`${d.name}_functions`],
}

/** Every record's id, its display form where it differs, and `extraInputs`. */
function recordInputs<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): Inputs {
  const extra = extraInputs[cat] ?? (() => [])
  return [...corpus[cat].values()].flatMap(doc => {
    const id: string = idOf(cat, doc)
    const display = docDisplay(cat, doc)
    return [id, ...(display === id ? [] : [display]), ...extra(doc)]
  })
}

/**
 * Printable ASCII, one line. Keeps the fixture clear of inputs where a JS
 * regex and Rust's `char` methods legitimately disagree (Unicode whitespace,
 * line terminators) — those have no right answer to pin.
 */
const INPUT_RE = /^[\x20-\x7E]*$/

function caseFor(
  corpus: DocCorpus,
  cat: DocCategory,
  input: string,
): ResolverFixtureCase {
  if (!INPUT_RE.test(input)) {
    throw new Error(
      `${cat}: input ${JSON.stringify(input)} is not printable ASCII`,
    )
  }
  return {
    input,
    id: lookupRaw(corpus, cat, input)?.id ?? null,
    feedback: resolverFeedback(corpus, cat, input) ?? null,
  }
}

function casesFor(corpus: DocCorpus, cat: DocCategory): ResolverFixtureCases {
  const inputs = new Set([
    ...(pinnedInputs[cat] ?? []),
    ...crossCategoryInputs,
    ...recordInputs(corpus, cat),
  ])
  return [...inputs].map(input => caseFor(corpus, cat, input))
}

export function buildResolverFixture(
  corpus: DocCorpus,
  meta: { readonly packageVersion: string; readonly dataHash: string },
): ResolverFixtureJson {
  const cases = Object.fromEntries(
    docCategories.map(cat => [cat, casesFor(corpus, cat)]),
  ) as ResolverFixtureJson["cases"]
  return { version: 1, ...meta, cases }
}
