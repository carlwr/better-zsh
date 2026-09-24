import { readFileSync } from "node:fs"
import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  buildChatInstructions,
  toVsCodeSnippets,
} from "../../build/generate-assets"
import { chatInstructionsMd } from "../../build/paths"
import { chatInstructionsMeta } from "../../manifest/chat-instructions"
import { snippets } from "../../manifest/snippets"

describe("generated assets", () => {
  test("snippets ship in VS Code's snippet shape", () => {
    expect(toVsCodeSnippets(snippets)["if/then/fi"]).toEqual({
      prefix: "if",
      body: ["if ${1:condition}; then", "\t${0}", "fi"],
      description: "if/then/fi block",
    })
  })

  test("chat instructions: frontmatter, the markdown, then every snippet", () => {
    const md = buildChatInstructions(
      chatInstructionsMeta,
      "# Zsh\n\nbody\n\n",
      snippets,
    )
    expect(md).toMatch(
      /^---\nname: "Zsh"\ndescription: ".+"\napplyTo: ".+"\n---\n\n# Zsh\n\nbody\n\n## Available Snippets\n/,
    )
    for (const s of snippets)
      expect(md).toContain(`- \`${s.prefix}\` - ${s.desc}`)
  })

  // The shipped instructions are injected into agent chats: they must be
  // exactly what a reader of the file sees, and nothing but zsh notes.
  describe("chat instructions content fence", () => {
    const shipped = buildChatInstructions(
      chatInstructionsMeta,
      readFileSync(chatInstructionsMd, "utf8"),
      snippets,
    )

    test("printable ASCII and newlines only: no hidden or invisible characters", () => {
      expect(shipped).toMatch(/^[\x20-\x7E\n]*$/)
    })

    test("the build refuses any other character, naming it and its line", () => {
      const bad = fc.oneof(
        fcu.element([0x09, 0x0d, 0x7f, 0xe9, 0x2014, 0x200b]),
        fc
          .integer({ min: 0, max: 0xffff })
          .filter(c => c !== 0x0a && (c < 0x20 || c > 0x7e)),
      )
      const line = fc.stringMatching(/^[ -~]*$/)
      fc.assert(
        fc.property(bad, fc.array(line, { maxLength: 3 }), (c, pre) => {
          const md = `# Zsh\n\n${[...pre, `bo${String.fromCharCode(c)}dy`].join("\n")}\n`
          const hex = c.toString(16).padStart(4, "0")
          // The frontmatter is five lines, then blank, `# Zsh`, blank.
          expect(() =>
            buildChatInstructions(chatInstructionsMeta, md, []),
          ).toThrow(`non-ASCII U+${hex} on line ${9 + pre.length}`)
        }),
      )
    })

    test("no links, no HTML comments", () => {
      expect(shipped).not.toMatch(/:\/\//)
      expect(shipped).not.toContain("<!--")
    })

    test("frontmatter carries only the documented keys", () => {
      const block = shipped.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ""
      const keys = block.split("\n").map(line => line.replace(/:.*$/, ""))
      expect(new Set(keys)).toEqual(new Set(["name", "description", "applyTo"]))
    })

    test("bounded size", () => {
      expect(Buffer.byteLength(shipped)).toBeLessThan(16 * 1024)
    })
  })
})
