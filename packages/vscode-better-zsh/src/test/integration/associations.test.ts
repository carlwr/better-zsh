import * as assert from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { rm_rf } from "@carlwr/typescript-extra/node"
import * as vscode from "vscode"
import { ZSH_LANG_ID } from "../../ids"

// The manifest's association fields through VS Code's own resolution: path
// globs, line-1 markers, and precedence against the built-in `shellscript`.
const cases: [relPath: string, line1: string, zsh: boolean][] = [
  // paths: distribution dirs hold unmarked functions; site-functions only `_*`
  ["share/zsh/5.9/functions/Zle/edit-command-line", "local x", true],
  ["share/zsh/functions/Completion/compinit", "local x", true],
  ["share/zsh/site-functions/_tldr", "# Old style completion.", true],
  ["share/zsh/site-functions/git-completion.bash", "# bash/zsh", false],
  // names
  ["zshrc_Apple_Terminal", "# Apple", true],
  ["private_executable_dot_zshrc", "# chezmoi", true],
  ["dot_zshrc.tmpl", "# chezmoi template", false],
  // line 1: only files no language claims by path
  ["bin/deploy", "#!/usr/bin/env zsh", true],
  ["completions/_mytool", "#compdef mytool", true],
  ["functions/foo", "emulate -L zsh", true],
  ["notes", "# zsh", false],
  ["deploy.sh", "#!/usr/bin/env zsh", false],
]

suite("ZshAssociations", () => {
  let dir: string

  suiteSetup(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "better-zsh-assoc."))
    for (const [rel, line1] of cases) {
      const file = path.join(dir, rel)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, `${line1}\n`)
    }
  })

  suiteTeardown(() => rm_rf(dir))

  for (const [rel, line1, zsh] of cases) {
    test(`${zsh ? "zsh" : "not zsh"}: ${rel} (${line1})`, async () => {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.join(dir, rel)),
      )
      assert.strictEqual(doc.languageId === ZSH_LANG_ID, zsh, doc.languageId)
    })
  }
})
