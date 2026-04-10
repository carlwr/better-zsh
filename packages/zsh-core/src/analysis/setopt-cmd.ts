/** Shared `setopt`/`unsetopt`/`set +/-` recognition for both fact and lightweight checks. */
/** Recognize the command text of a setopt-like invocation, including `set +/-o`. */
export function isSetoptCommandText(text: string, continued = false): boolean {
  const words = text.trimStart().split(/\s+/).filter(Boolean)
  const cmd = words[0]
  if (cmd === "setopt" || cmd === "unsetopt") return true
  return cmd === "set" && (continued || words.slice(1).some(isSetoptFlagWord))
}

function isSetoptFlagWord(word: string): boolean {
  return /^[+-][A-Za-z0-9]/.test(word)
}
