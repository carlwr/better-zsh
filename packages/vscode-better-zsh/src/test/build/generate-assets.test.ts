import { describe, expect, test } from "vitest"
import {
  buildChatInstructions,
  toVsCodeSnippets,
} from "../../build/generate-assets"
import { snippets } from "../../manifest/snippets"

describe("generated assets", () => {
  test("snippets ship in VS Code's snippet shape", () => {
    expect(toVsCodeSnippets(snippets)["if/then/fi"]).toEqual({
      prefix: "if",
      body: ["if ${1:condition}; then", "\t${0}", "fi"],
      description: "if/then/fi block",
    })
  })

  test("chat instructions: the markdown, then every snippet", () => {
    const md = buildChatInstructions("# Zsh\n\nbody\n\n", snippets)
    expect(md).toMatch(/^# Zsh\n\nbody\n\n## Available Snippets\n/)
    for (const s of snippets)
      expect(md).toContain(`- \`${s.prefix}\` — ${s.desc}`)
  })
})
