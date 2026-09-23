import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { withoutFirstSubstring } from "@carlwr/typescript-extra"
import Ajv2020, { type AnySchema } from "ajv/dist/2020"
import { describe, expect, test } from "vitest"
import {
  recordsFile,
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
  defValidator(recordsSchemaDefs.records(cat))
const all = readJson(artifact("json", recordsFile))
const records = (cat: DocCategory): Rec[] => all[cat] as Rec[]

const defs = bundle.$defs as Record<string, Rec>
const deref = (schema: Rec): Rec => {
  if (typeof schema.$ref !== "string") return schema
  const def =
    defs[decodeURIComponent(withoutFirstSubstring("#/$defs/", schema.$ref))]
  if (!def) throw new Error(`unresolved $ref ${schema.$ref}`)
  return def
}

/** The values a category's record schema admits for `subKind`; `undefined` when it declares none. */
function subKindEnum(cat: DocCategory): string[] | undefined {
  const record = defs[recordsSchemaDefs.record(cat)]
  if (!record) throw new Error(`${cat}: no record def`)
  const branches = Array.isArray(record.anyOf)
    ? (record.anyOf as Rec[])
    : [record]
  const values = new Set<string>()
  let declared = false
  for (const branch of branches) {
    const prop = (branch.properties as Rec | undefined)?.subKind as
      | Rec
      | undefined
    if (!prop) continue
    declared = true
    const schema = deref(prop)
    if (Array.isArray(schema.enum))
      for (const v of schema.enum) values.add(String(v))
    else if (typeof schema.const === "string") values.add(schema.const)
    else throw new Error(`${cat}: subKind is neither an enum nor a const`)
  }
  return declared ? [...values].sort() : undefined
}

describe("records bundle", () => {
  test.each(docCategories)("%s: the emitted records validate", cat => {
    const validate = validator(cat)
    expect(validate(records(cat)), ajv.errorsText(validate.errors)).toBe(true)
  })

  test.each(docCategories)("%s: id is an id; display is printable", cat => {
    const [rec] = records(cat)
    const record = defValidator(recordsSchemaDefs.record(cat))
    const id = defValidator(recordsSchemaDefs.id(cat))
    expect(record(rec)).toBe(true)
    expect(id(rec?.id)).toBe(true)
    expect(record({ ...rec, id: "has space" })).toBe(false)
    expect(record({ ...rec, display: "" })).toBe(false)
    expect(record({ ...rec, display: "tab\there" })).toBe(false)
  })

  // `category` pins each record definition to its category: the defs are
  // disjoint, so a record validates against its own and no other — a
  // bare record classifies without its file.
  test.each(docCategories)("%s: category pins the definition", cat => {
    const [rec] = records(cat)
    const record = defValidator(recordsSchemaDefs.record(cat))
    expect(rec?.category).toBe(cat)
    const off = { ...rec }
    delete off.category
    expect(record(off)).toBe(false)
    for (const other of docCategories) {
      if (other === cat) continue
      expect(record({ ...rec, category: other }), other).toBe(false)
      expect(defValidator(recordsSchemaDefs.record(other))(rec), other).toBe(
        false,
      )
    }
  })

  // A category declares `subKind` on every record or on none; the schema
  // then requires it with the closed union, or forbids it. The union is
  // type-derived — every declared literal is to occur in the corpus, so the
  // schema names no vocabulary the data never exhibits.
  test("subKind: required with the corpus enum, or absent, per category", () => {
    const withSub = docCategories.filter(cat => subKindEnum(cat) !== undefined)
    expect(withSub.length).toBeGreaterThan(0)
    expect(withSub.length).toBeLessThan(docCategories.length)
    for (const cat of docCategories) {
      const validate = validator(cat)
      const [rec] = records(cat)
      const off = { ...rec }
      delete off.subKind
      expect(validate([off]), cat).toBe(!withSub.includes(cat))
      expect(validate([{ ...rec, subKind: "bogus" }]), cat).toBe(false)
      const seen = new Set(records(cat).map(r => r.subKind))
      expect(subKindEnum(cat), cat).toEqual(
        withSub.includes(cat) ? [...seen].sort() : undefined,
      )
    }
  })

  const binary = (rs: Rec[]) => rs.find(r => r.subKind === "binary")
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
    [
      "cross-reference with whitespace",
      "builtin",
      r => ({ ...r, aliasOf: "has space" }),
    ],
    [
      "subKind outside the union",
      "conditional_op",
      r => ({ ...r, subKind: "ternary" }),
    ],
    ["id with whitespace", "precmd_modifier", r => ({ ...r, id: "no glob" })],
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
    recordsFile,
    artifact("json", recordsFile),
    artifact("schema", recordsSchemaFile),
  ],
  [
    resolverFixture.file,
    artifact(resolverFixture.dir, resolverFixture.file),
    artifact(resolverFixture.dir, schemaFile(resolverFixture.file)),
  ],
])("%s", (_, json, schema) => {
  test("validates against its emitted schema", () => {
    // A fresh instance: `ajv` above already holds the records bundle by `$id`.
    const fresh = new Ajv2020({ allErrors: true, strict: true })
    const validate = fresh.compile(readJson(schema) as AnySchema)
    expect(validate(readJson(json)), fresh.errorsText(validate.errors)).toBe(
      true,
    )
  })
})
