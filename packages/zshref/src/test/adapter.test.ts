import { docCategories, loadCorpus } from "@carlwr/zsh-core"
import { toolDefs } from "@carlwr/zsh-core-tooldef"
import { EnumType } from "@cliffy/command"
import { describe, expect, test } from "vitest"
import { buildCli, subcommandName } from "../adapter.ts"

const corpus = loadCorpus()
const cli = buildCli({
  corpus,
  toolDefs,
  name: "zshref",
  version: "0.0.0-test",
})

describe("subcommandName", () => {
  test.each([
    ["zsh_classify", "classify"],
    ["zsh_lookup_option", "lookup_option"],
    ["zsh_search", "search"],
    ["zsh_describe", "describe"],
  ])("%s → %s", (input, expected) => {
    expect(subcommandName(input)).toBe(expected)
  })
})

describe("buildCli tree", () => {
  test("one subcommand per toolDef, plus completions", () => {
    const names = cli
      .getCommands()
      .map((c: { getName(): string }) => c.getName())
    for (const td of toolDefs) {
      expect(names).toContain(subcommandName(td.name))
    }
    expect(names).toContain("completions")
  })

  test("classify subcommand has a --raw option", () => {
    const classify = cli.getCommand("classify")
    expect(classify).toBeDefined()
    const optNames = (classify?.getOptions() ?? []).map(
      (o: { name: string }) => o.name,
    )
    expect(optNames).toContain("raw")
  })

  test("search subcommand --category option is populated from docCategories", () => {
    const search = cli.getCommand("search")
    expect(search).toBeDefined()
    const catOpt = search?.getOption("category")
    expect(catOpt).toBeDefined()
    const typeName = catOpt?.args?.[0]?.type
    expect(typeName).toBe("category")
    // The EnumType instance is the registered handler; its .values()
    // exposes the enumeration.
    const typeDef = search?.getType("category")
    expect(typeDef).toBeDefined()
    const handler = typeDef?.handler
    expect(handler).toBeInstanceOf(EnumType)
    const values = (handler as EnumType<string>).values()
    for (const c of docCategories) {
      expect(values).toContain(c)
    }
  })

  test("describe subcommand exposes both category and id", () => {
    const describeCmd = cli.getCommand("describe")
    const optNames = (describeCmd?.getOptions() ?? []).map(
      (o: { name: string }) => o.name,
    )
    expect(optNames).toContain("category")
    expect(optNames).toContain("id")
  })

  test("root command has correct name and version", () => {
    expect(cli.getName()).toBe("zshref")
    expect(cli.getVersion()).toBe("0.0.0-test")
  })
})
