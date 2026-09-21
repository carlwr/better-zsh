// Runtime forms of closed vocabularies the extractors validate against and
// iterate. Each tuple is the single source of its literal-union type.

// Alphabetical; the order is observable (an alias's emulation list follows it).
export const emulations = ["csh", "ksh", "sh", "zsh"] as const

export const optSections = [
  "Changing Directories",
  "Completion",
  "Expansion and Globbing",
  "History",
  "Initialisation",
  "Input/Output",
  "Job Control",
  "Prompting",
  "Scripts and Functions",
  "Shell Emulation",
  "Shell State",
  "Zle",
  "Option Aliases",
] as const

export const promptSubsections = [
  "Special characters",
  "Login information",
  "Shell state",
  "Date and time",
  "Visual effects",
  "Conditional Substrings in Prompts",
] as const

export const zleWidgetSubsections = [
  "Movement",
  "History Control",
  "Modifying Text",
  "Arguments",
  "Completion",
  "Miscellaneous",
  "Text Objects",
  "Special Widgets",
] as const
