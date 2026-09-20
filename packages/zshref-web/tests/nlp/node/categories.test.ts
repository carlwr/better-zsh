// `categories.json` drift against the committed file (the UI's category
// order + labels). Pure on the taxonomy — always runs.

import { docCategories } from "@carlwr/zsh-core"
import { describe, expect, it } from "vitest"

import { categoriesJson } from "../../../nlp/node/categories"
import { assertCommittedJson, PATHS } from "../../_helpers"

describe("categories.json", () => {
  it("matches the committed file", async () => {
    await assertCommittedJson(
      PATHS.categoriesJson,
      categoriesJson(),
      "UPDATE_CATEGORIES_JSON",
    )
  })

  it("follows docCategories order with a non-empty label each", () => {
    const { version, categories } = categoriesJson()
    expect(version).toBe(1)
    expect(categories.map(c => c.id)).toEqual([...docCategories])
    for (const c of categories) expect(c.label).not.toBe("")
  })
})
