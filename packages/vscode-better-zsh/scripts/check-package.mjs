import { execFileSync } from "node:child_process"

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

const files = execFileSync(pnpm, ["exec", "vsce", "ls", "--no-dependencies"], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const required = [
  "LICENSE",
  "package.json",
  "syntaxes/shell-unix-bash.tmLanguage.json",
  "out/extension.js",
  "out/extension.js.map",
  "out/language-configuration.json",
  "out/snippets.json",
  "out/zsh-chat-instructions.md",
  "out/zsh-core-data/SOURCE.md",
  "out/zsh-core-data/builtins.yo",
  "out/zsh-core-data/cond.yo",
  "out/zsh-core-data/grammar.yo",
  "out/zsh-core-data/options.yo",
]

const forbidden = [
  [/^out\/src\//, "compiled source/test output"],
  [/^out\/build\.js(?:\.map)?$/, "compiled build script output"],
  [/\.test\.js(?:\.map)?$/, "compiled test file"],
  [/^node_modules\//, "node_modules content"],
]

const missing = required.filter((file) => !files.includes(file))
const hits = forbidden.flatMap(([pat, desc]) =>
  files.filter((file) => pat.test(file)).map((file) => ({ desc, file })),
)

if (missing.length > 0 || hits.length > 0) {
  const parts = []
  if (missing.length > 0) {
    parts.push(`missing required files:\n- ${missing.join("\n- ")}`)
  }
  if (hits.length > 0) {
    parts.push(
      `found forbidden files:\n- ${hits.map(({ file, desc }) => `${file} (${desc})`).join("\n- ")}`,
    )
  }
  throw new Error(parts.join("\n\n"))
}

process.stdout.write("package files: OK\n")
