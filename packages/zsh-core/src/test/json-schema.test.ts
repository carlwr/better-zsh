import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020, { type AnySchema } from "ajv/dist/2020"
import { describe, expect, test } from "vitest"
import {
  jsonDataFile,
  recordsSchemaDefs,
  recordsSchemaFile,
  resolverFixture,
  schemaFile,
} from "../docs/json-artifacts"
import { type DocCategory, docCategories } from "../docs/taxonomy"

// The emitted artifacts against the emitted schemas, under pack-release's
// ajv options: data/schema drift fails here, not only at packing time.

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const artifact = (...path: string[]) => join(pkgDir, "artifacts", ...path)

type Rec = Record<string, unknown>
const readJson = (path: string): Rec => JSON.parse(readFileSync(path, "utf8"))

const ajv = new Ajv2020({ allErrors: true, strict: true })
const bundle = readJson(artifact("schema", recordsSchemaFile))
ajv.addSchema(bundle as AnySchema)

const defValidator = (def: string) =>
  ajv.compile({ $ref: `${String(bundle.$id)}#/$defs/${def}` })
const validator = (cat: DocCategory) =>
  defValidator(recordsSchemaDefs.file(cat))
const records = (cat: DocCategory): Rec[] =>
  readJson(artifact("json", jsonDataFile(cat))) as unknown as Rec[]

describe("records bundle", () => {
  test.each(docCategories)("%s: the emitted records validate", cat => {
    const validate = validator(cat)
    expect(validate(records(cat)), ajv.errorsText(validate.errors)).toBe(true)
  })

  test.each(docCategories)("%s: record and id defs stand alone", cat => {
    const [rec] = records(cat)
    expect(defValidator(recordsSchemaDefs.record(cat))(rec)).toBe(true)
    const id = defValidator(recordsSchemaDefs.id(cat))
    expect(id(rec?._id)).toBe(true)
    expect(id("has space")).toBe(false)
  })

  test("the whole category map validates against the root", () => {
    const validate = ajv.compile({ $ref: String(bundle.$id) })
    const all = Object.fromEntries(docCategories.map(c => [c, records(c)]))
    expect(validate(all), ajv.errorsText(validate.errors)).toBe(true)
  })

  test("_subKind is required with an enum, or absent, per category", () => {
    const withSub = docCategories.filter(cat =>
      records(cat).some(r => "_subKind" in r),
    )
    expect(withSub.length).toBeGreaterThan(0)
    expect(withSub.length).toBeLessThan(docCategories.length)
    for (const cat of docCategories) {
      const validate = validator(cat)
      const [rec] = records(cat)
      const off = { ...rec }
      delete off._subKind
      expect(validate([off]), cat).toBe(!withSub.includes(cat))
      expect(validate([{ ...rec, _subKind: "bogus" }]), cat).toBe(false)
    }
  })

  const binary = (rs: Rec[]) => rs.find(r => r.arity === "binary")
  test.each<
    [string, DocCategory, (r: Rec) => Rec, ((rs: Rec[]) => Rec | undefined)?]
  >([
    ["unknown key", "builtin", r => ({ ...r, extra: 1 })],
    [
      "module outside moduleNames",
      "builtin",
      r => ({ ...r, module: "zsh/bogus" }),
    ],
    ["empty NonEmpty synopsis", "builtin", r => ({ ...r, synopsis: [] })],
    ["_id with whitespace", "builtin", r => ({ ...r, _id: "has space" })],
    [
      "cross-reference with whitespace",
      "builtin",
      r => ({ ...r, aliasOf: "has space" }),
    ],
    [
      "arity outside the union",
      "conditional_op",
      r => ({ ...r, arity: "ternary" }),
    ],
    [
      "binary op with one operand",
      "conditional_op",
      r => ({ ...r, operands: ["x"] }),
      binary,
    ],
    [
      "defaultIn outside emulations",
      "option",
      r => ({ ...r, defaultIn: ["bash"] }),
    ],
    [
      "keymap outside the union",
      "zle_widget",
      r => ({ ...r, defaultBindings: [{ keymap: "vim", keys: ["^B"] }] }),
    ],
  ])("rejects %s", (_, cat, mutate, pick = rs => rs[0]) => {
    const validate = validator(cat)
    const rec = pick(records(cat))
    if (!rec) throw new Error(`${cat}: no sample record`)
    expect(validate([rec]), ajv.errorsText(validate.errors)).toBe(true)
    expect(validate([mutate(rec)])).toBe(false)
  })
})

describe.each([
  [
    "index.json",
    artifact("json", "index.json"),
    artifact("schema", schemaFile("index.json")),
  ],
  [
    resolverFixture.file,
    artifact(resolverFixture.dir, resolverFixture.file),
    artifact(resolverFixture.dir, schemaFile(resolverFixture.file)),
  ],
])("%s", (_, json, schema) => {
  test("validates against its emitted schema", () => {
    const validate = ajv.compile(readJson(schema) as AnySchema)
    expect(validate(readJson(json)), ajv.errorsText(validate.errors)).toBe(true)
  })
})
