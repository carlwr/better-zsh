import { snippets } from "./snippets";

export function buildChatInstructions(): string {
	const snippetList = snippets
		.map((s) => `- \`${s.prefix}\` — ${s.desc}`)
		.join("\n");

	return `# Zsh — Key Differences from Bash

## Word Splitting and Globbing

- **No implicit word splitting** on unquoted parameter expansions:
  \`val="a b"; print $val\` prints \`a b\` as one word (unlike bash).
  Use \`\${(s: :)val}\` or \`\${=val}\` when splitting is intended.
- **Glob patterns** are expanded by default. Use \`setopt no_nomatch\` or
  quote patterns to suppress errors on no-match.
- Arrays are **1-indexed**: \`arr[1]\` is the first element.
- Associative arrays: \`typeset -A map; map=(key1 val1 key2 val2)\`

## Conditional Expressions

- Prefer \`[[ ... ]]\` over \`[ ... ]\` — it supports pattern matching and regex.
- \`=\` and \`==\` are equivalent inside \`[[ ]]\` (both do pattern matching).
- Use \`=~\` for regex matching: \`[[ $str =~ ^[0-9]+$ ]]\`
- \`-eq\`, \`-lt\`, etc. for numeric comparisons.
- For pure numeric comparisons, \`(( ... ))\` is often clearer.

## Common Gotchas

- \`setopt\` options are case-insensitive and ignore underscores:
  \`EXTENDED_GLOB\`, \`extendedglob\`, \`extended_glob\` are all the same.
- Default options differ from bash — don't assume bash defaults.
- \`echo\` behaves differently in zsh (processes escape sequences by default).
  Prefer \`print -r --\` for reliable output.
- \`==\` inside \`[[ ]]\` does pattern matching, not string equality.
  Use \`[[ $a == $b ]]\` with \`$b\` quoted for literal comparison:
  \`[[ $a == "$b" ]]\`

## Idiomatic Patterns

- \`emulate -LR zsh\` — set strict zsh mode, reset all options (local scope).
- \`emulate -L zsh\` at the top of functions — isolate option changes.
- \`\${var:-default}\` — default value if unset/empty.
- \`\${(f)content}\` — split on newlines.
- \`print -r --\` — reliable echo replacement (raw, no option processing).
- \`local\` in functions — always scope variables.
- \`autoload -Uz funcname\` — autoload with zsh mode, no aliases.
- \`() { ... }\` — anonymous function for scope isolation.

## Parameter Expansion Flags

Zsh parameter expansion flags are placed inside \`\${(flags)...}\`:

- \`(f)\` — split on newlines
- \`(s:,:)\` — split on delimiter (here: comma)
- \`(j:,:)\` — join array with delimiter
- \`(k)\` — keys of associative array
- \`(v)\` — values of associative array
- \`(t)\` — type of parameter
- \`(Q)\` — remove one level of quoting
- \`(Z+Cn+)\` — shell-word split (parse into tokens)
- \`(U)\` / \`(L)\` — uppercase / lowercase
- \`(M)\` / \`(R)\` — keep matching / non-matching elements

## Useful Modules

- \`zsh/parameter\` — inspect shell state: \`$commands\`, \`$functions\`, \`$parameters\`
- \`zsh/mathfunc\` — math functions: \`sin\`, \`cos\`, \`sqrt\`, etc.
- \`zsh/zutil\` — \`zparseopts\` for option parsing
- \`zsh/datetime\` — \`strftime\`, \`$EPOCHSECONDS\`

## Function Best Practices

\`\`\`zsh
# Always guard with emulate -L zsh:
my_func() {
    emulate -L zsh
    setopt extended_glob  # safe: scoped to this function
    # ...
}

# Autoload pattern (for functions in fpath):
autoload -Uz my_func
\`\`\`

## Available Snippets

${snippetList}
`;
}
