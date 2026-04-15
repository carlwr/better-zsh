import * as assert from "node:assert"
import * as fs from "node:fs"
import * as path from "node:path"
import { buildChatInstructions } from "../build/chat-instructions"
import { langConfig } from "../build/lang-config"
import { buildSnippetJson, readSnippets } from "../build/snippets"

function asRegExp(
  pattern: string | { pattern: string; flags?: string } | undefined,
) {
  if (!pattern) throw new Error("expected regex pattern")
  return typeof pattern === "string"
    ? new RegExp(pattern)
    : new RegExp(pattern.pattern, pattern.flags)
}

suite("build assets", () => {
  test("package metadata keeps zshPath machine-scoped", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
    ) as {
      contributes?: {
        configuration?: {
          properties?: Record<string, Record<string, unknown>>
        }
      }
    }
    const prop =
      pkg.contributes?.configuration?.properties?.["betterZsh.zshPath"] ?? {}

    assert.strictEqual(prop.scope, "machine")
    assert.strictEqual(prop.default, "")
    assert.strictEqual(prop.type, "string")
    assert.match(
      String(prop.markdownDescription ?? ""),
      /Leave empty to use `zsh` from PATH/,
    )
    assert.match(
      String(prop.markdownDescription ?? ""),
      /Set to `off` to never invoke any zsh binary/,
    )
  })

  test("snippet source parses into distinct shipped snippets", () => {
    const snippets = readSnippets()
    assert.ok(snippets.length > 0, "expected vendored snippets")

    const names = snippets.map(s => s.name)
    const prefixes = snippets.map(s => s.prefix)
    assert.strictEqual(new Set(names).size, names.length)
    assert.strictEqual(new Set(prefixes).size, prefixes.length)

    const json = buildSnippetJson(snippets)
    assert.ok(json["if/then/fi"])
    assert.ok(json["autoload -Uz"])
  })

  test("chat instructions include bash differences and shipped snippets", () => {
    const md = buildChatInstructions(readSnippets())
    assert.match(md, /^# Zsh — Key Differences from Bash/m)
    assert.match(md, /## Word Splitting and Globbing/)
    assert.match(md, /## Available Snippets/)
    assert.match(md, /- `if` — if\/then\/fi block/)
    assert.match(md, /- `autoload` — autoload function/)
  })

  test("generated language config stays loadable as regex", () => {
    const wordPattern = asRegExp(langConfig.wordPattern)
    assert.ok(wordPattern.test("foo-bar"))
    assert.ok(wordPattern.test("1.2"))
  })
})
