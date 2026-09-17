/**
 * Frontmatter of the shipped instructions file. `applyTo: "**"` attaches it to
 * every request: a glob would be matched against the request's attached files
 * only, and the manifest's `when` already says "zsh". `description` is what
 * the chat's customizations index shows the model.
 */
export const chatInstructionsMeta = {
  name: "Zsh",
  description:
    "Zsh language notes for editing zsh scripts: differences from bash, idioms, parameter-expansion flags, available snippets.",
  applyTo: "**",
}

export type ChatInstructionsMeta = typeof chatInstructionsMeta
