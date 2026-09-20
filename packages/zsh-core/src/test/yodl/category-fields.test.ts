import { allUnique } from "@carlwr/typescript-extra"
import { describe, expect, test } from "vitest"
import {
  promptSubsections,
  zleBindingKeymaps,
  zleWidgetSubsections,
} from "../../docs/types"
import { parseArithOps } from "../../docs/yodl/extractors/arith-ops"
import { parseCompUtils } from "../../docs/yodl/extractors/comp-utils"
import { parseJobSpecs } from "../../docs/yodl/extractors/job-specs"
import { parseKeymaps } from "../../docs/yodl/extractors/keymaps"
import { extractDeltochar } from "../../docs/yodl/extractors/modules/deltochar"
import { parsePromptEscapes } from "../../docs/yodl/extractors/prompt-escapes"
import {
  parseShellParams,
  parseWidgetParams,
} from "../../docs/yodl/extractors/shell-params"
import { parseSpecialFunctions } from "../../docs/yodl/extractors/special-functions"
import { parseZleWidgets } from "../../docs/yodl/extractors/zle-widgets"
import { mkDocumented_ } from "../id-fns"
import { by, readVendoredYo } from "./test-util"

const km = mkDocumented_("keymap")
const js = mkDocumented_("job_spec")
const ao = mkDocumented_("arith_op")
const sfn = mkDocumented_("special_function")
const sp = mkDocumented_("special_param")
const cu = mkDocumented_("comp_utility")
const zw = mkDocumented_("zle_widget")

describe("parseKeymaps", () => {
  const map = by(parseKeymaps(readVendoredYo("zle.yo")), d => d.id)

  test("covers the eight initial keymaps", () => {
    expect([...map.keys()].sort()).toEqual(
      [
        "emacs",
        "viins",
        "vicmd",
        "viopp",
        "visual",
        "isearch",
        "command",
        ".safe",
      ].sort(),
    )
  })

  test.each([
    [".safe", true],
    ["emacs", false],
  ])("isSpecial: %s → %s", (name, want) => {
    expect(map.get(km(name))?.isSpecial).toBe(want)
  })

  test.each([
    ["emacs", ["main"]],
    ["viins", []],
  ] as const)("linkedFrom: %s → %j", (name, want) => {
    expect(map.get(km(name))?.linkedFrom).toEqual(want)
  })
})

describe("parseJobSpecs", () => {
  const map = by(parseJobSpecs(readVendoredYo("jobs.yo")), d => d.id)
  test.each([
    ["%number", "number"],
    ["%string", "string"],
    ["%?string", "contains"],
    ["%%", "current"],
    ["%+", "current"],
    ["%-", "previous"],
  ] as const)("%s → %s", (key, kind) => {
    expect(map.get(js(key))?.kind).toBe(kind)
  })
})

describe("parseArithOps", () => {
  const docs = parseArithOps(readVendoredYo("arith.yo"))
  const map = by(docs, d => d.id)

  test.each([
    ["!", "unary"],
    ["~", "unary"],
    ["<<", "binary"],
    ["==", "binary"],
    ["**", "binary"],
    ["?", "ternary"],
    [":", "ternary"],
    ["+", "overloaded"],
    ["-", "overloaded"],
  ] as const)("%s → %s", (op, arity) => {
    expect(map.get(ao(op))?.arity).toBe(arity)
  })

  test("C_PRECEDENCES table is not also emitted", () => {
    // The native table has 15 rows; per-op dedup yields ~42 records. C_PRECEDENCES
    // adds no new ops and would double-count if we parsed both tables.
    expect(docs.length).toBeLessThan(50)
    expect(docs.length).toBeGreaterThan(30)
  })
})

describe("parseSpecialFunctions", () => {
  const map = by(parseSpecialFunctions(readVendoredYo("func.yo")), d => d.id)

  test.each([
    ["chpwd", "chpwd_functions"],
    ["precmd", "precmd_functions"],
    ["zshexit", "zshexit_functions"],
  ])("hook %s carries %s array name", (name, arr) => {
    expect(map.get(sfn(name))?.hookArray).toBe(arr)
  })

  test.each([
    ["TRAPDEBUG", "trap-literal"],
    ["TRAPEXIT", "trap-literal"],
    ["TRAPZERR", "trap-literal"],
    ["TRAPNAL", "trap-template"],
  ] as const)("%s is %s", (name, kind) => {
    const d = map.get(sfn(name))
    expect(d?.kind).toBe(kind)
    expect(d?.hookArray).toBeUndefined()
  })

  // The resolver keys `<hook>_functions` input on `hookArray`.
  test("kind hook ⇔ hookArray present, and it is `${name}_functions`", () => {
    for (const d of map.values()) {
      expect(d.hookArray !== undefined, d.id).toBe(d.kind === "hook")
      if (d.kind === "hook") expect(d.hookArray).toBe(`${d.id}_functions`)
    }
  })
})

describe("parsePromptEscapes — typed subsection (enrichment)", () => {
  const docs = parsePromptEscapes(readVendoredYo("prompt.yo"))
  test("all records land on a closed-union subsection", () => {
    expect([...new Set(docs.map(d => d.section))].sort()).toEqual(
      [...promptSubsections].sort(),
    )
  })
})

describe("parseShellParams — typed scope (enrichment)", () => {
  // Subset of `ShellParamScope` covering params.yo; zle.yo and compwid.yo
  // carry the other two scopes.
  test("every record lands on a shell-set or shell-used scope", () => {
    for (const d of parseShellParams(readVendoredYo("params.yo"))) {
      expect(["shell-set", "shell-used"]).toContain(d.scope)
    }
  })
})

describe("parseWidgetParams (ZLE widget-local parameters)", () => {
  const docs = parseWidgetParams(readVendoredYo("zle.yo"))
  const map = by(docs, d => d.id)

  test("includes well-known widget params", () => {
    for (const n of ["BUFFER", "CURSOR", "CONTEXT", "WIDGET", "LBUFFER"]) {
      expect(map.has(sp(n))).toBe(true)
    }
  })

  test("all records carry scope: zle-widget and no tied pairing", () => {
    for (const d of docs) {
      expect(d.scope).toBe("zle-widget")
      expect(d.tied).toBeUndefined()
    }
  })
})

describe("parseZleWidgets — typed subsection (enrichment)", () => {
  test("all subsection values are in the closed union", () => {
    const subs = new Set(zleWidgetSubsections)
    for (const d of parseZleWidgets(readVendoredYo("zle.yo"))) {
      expect(subs.has(d.section)).toBe(true)
    }
  })
})

describe("zle widgets — default bindings (corpus invariants)", () => {
  const zleYo = readVendoredYo("zle.yo")
  const docs = [
    ...parseZleWidgets(zleYo),
    ...extractDeltochar(readVendoredYo("mod_deltochar.yo")),
  ]
  const map = by(docs, d => d.id)
  const keymaps = by(parseKeymaps(zleYo), d => d.id)
  const KEY_RE = /^[\x21-\x7E]+$/ // printable ASCII, no whitespace
  const PROSE_RE = /^[\x20-\x7E]+$/ // printable ASCII, spaces allowed

  test("every record: keymaps in the closed union, documented, unique", () => {
    for (const d of docs) {
      expect(Array.isArray(d.defaultBindings)).toBe(true)
      expect(allUnique(d.defaultBindings.map(b => b.keymap))).toBe(true)
      for (const b of d.defaultBindings) {
        expect(zleBindingKeymaps).toContain(b.keymap)
        expect(keymaps.has(km(b.keymap))).toBe(true)
      }
    }
  })

  test("keys: printable ASCII, whitespace-free except self-insert's prose", () => {
    const prose: [string, string][] = []
    for (const d of docs) {
      for (const key of d.defaultBindings.flatMap(b => b.keys)) {
        expect(key).toMatch(PROSE_RE)
        if (!KEY_RE.test(key)) prose.push([d.id, key])
      }
    }
    expect(prose).toEqual([
      ["self-insert", "printable characters"],
      ["self-insert", "printable characters and some control characters"],
    ])
  })

  // Vendored-corpus invariant (zle.yo + mod_deltochar.yo): 139 records list
  // at least one binding, the rest carry `[]`. Bump on re-vendor.
  test("139 records list at least one binding", () => {
    expect(docs.filter(d => d.defaultBindings.length > 0)).toHaveLength(139)
  })

  test.each([
    ["backward-char", [{ keymap: "emacs", keys: ["^B", "ESC-[D"] }]],
    [
      "vi-backward-char",
      [
        { keymap: "vicmd", keys: ["^H", "h", "^?"] },
        { keymap: "viins", keys: ["ESC-[D"] },
      ],
    ],
    [
      "digit-argument",
      [
        { keymap: "emacs", keys: ["ESC-0..ESC-9"] },
        { keymap: "vicmd", keys: ["1-9"] },
      ],
    ],
    [
      "select-a-word",
      [
        { keymap: "viopp", keys: ["aw"] },
        { keymap: "visual", keys: ["aw"] },
      ],
    ],
    ["zle-line-init", []],
    ["delete-to-char", []],
  ])("%s → %j", (name, want) => {
    expect(map.get(zw(name))?.defaultBindings).toEqual(want)
  })
})

describe("parseCompUtils", () => {
  const docs = parseCompUtils(readVendoredYo("compsys.yo"))
  const map = by(docs, d => d.id)

  test("every record: leading underscore, non-empty synopsis+desc, Utility section", () => {
    for (const d of docs) {
      expect(d.id).toMatch(/^_/)
      expect(d.synopsis[0]).toBeTruthy()
      expect(d.desc).toBeTruthy()
      expect(d.section).toBe("Utility Functions")
    }
  })

  test("includes core utility functions", () => {
    for (const n of [
      "_absolute_command_paths",
      "_all_labels",
      "_alternative",
      "_arguments",
      "_describe",
      "_message",
      "_normal",
      "_tags",
      "_values",
      "_wanted",
      "_requested",
      "_files",
      "_guard",
      "_path_files",
      "_numbers",
      "_regex_arguments",
      "_regex_words",
    ]) {
      expect(map.has(cu(n)), n).toBe(true)
    }
  })

  test("_options_set and _options_unset share identical desc", () => {
    const set = map.get(cu("_options_set"))
    const unset = map.get(cu("_options_unset"))
    expect(set?.desc).toBeTruthy()
    expect(set?.desc).toBe(unset?.desc)
  })

  test("_arguments captures a flag group (depth-1 nested list)", () => {
    const args = map.get(cu("_arguments"))
    expect(args?.flagGroups?.length).toBeGreaterThan(0)
  })

  test("_describe: SPACES() continuation folds into synopsis[0]", () => {
    expect(map.get(cu("_describe"))?.synopsis[0]).toContain("[ --")
  })

  test("no function names appear more than once", () => {
    expect(allUnique(docs.map(d => d.id))).toBe(true)
  })
})
