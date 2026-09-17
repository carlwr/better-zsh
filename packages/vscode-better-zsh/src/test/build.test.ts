import { describe, expect, test } from "vitest"
import { buildChatInstructions } from "../build/chat-instructions"
import { langConfig } from "../build/lang-config"
import { buildSnippetJson, readSnippets } from "../build/snippets"
import { manifest, settingKey, zshPathSetting } from "../manifest"

describe("snippets", () => {
  const snippets = readSnippets()

  // Duplicate prefixes silently shadow in VS Code's Insert-Snippet QuickPick;
  // names are the keys of the shipped JSON.
  test.each(["prefix", "name"] as const)("%s values are unique", field => {
    const seen = new Map<string, string>()
    for (const s of snippets) {
      expect(
        seen.get(s[field]),
        `"${s[field]}" on "${seen.get(s[field])}" and "${s.name}"`,
      ).toBeUndefined()
      seen.set(s[field], s.name)
    }
  })

  test("ship in VS Code's snippet shape", () => {
    expect(buildSnippetJson(snippets)["if/then/fi"]).toEqual({
      prefix: "if",
      body: ["if ${1:condition}; then", "\t${0}", "fi"],
      description: "if/then/fi block",
    })
  })

  test("chat instructions carry the bash differences and every snippet", () => {
    const md = buildChatInstructions(snippets)
    expect(md).toMatch(/^# Zsh — Key Differences from Bash/m)
    expect(md).toMatch(/## Word Splitting and Globbing/)
    for (const s of snippets)
      expect(md).toContain(`- \`${s.prefix}\` — ${s.desc}`)
  })
})

describe("manifest", () => {
  test("settings: JSON-schema type derived from the default; the zsh binary stays machine-scoped", () => {
    const props = manifest.contributes.configuration.properties
    expect(props[settingKey(zshPathSetting)]).toEqual({
      type: "string",
      scope: "machine",
      default: "",
      markdownDescription: expect.stringContaining("`off`"),
    })
    expect(props["betterZsh.diagnostics.enabled"]).toMatchObject({
      type: "boolean",
      default: true,
    })
  })

  test("language config word pattern is a loadable regex", () => {
    const wp = langConfig.wordPattern
    const re =
      typeof wp === "string"
        ? new RegExp(wp)
        : new RegExp(wp?.pattern ?? "", wp?.flags)
    expect(re.test("foo-bar")).toBe(true)
    expect(re.test("1.2")).toBe(true)
  })
})
