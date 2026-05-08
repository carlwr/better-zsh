const pkg = name => `pnpm --filter ${name}`
const recursive = script =>
  `node scripts/build/upstream-ready.mjs run pnpm -r --filter './packages/*' --if-present ${script}`
const verifiedRecursive = script =>
  `pnpm verify:upstream && ${recursive(script)}`

export const buildTasks = {
  build: `${pkg("better-zsh")} build`,
  format:
    "pnpm format:root && pnpm -r --filter './packages/*' --if-present format",
  "format:check": "pnpm lint && pnpm verify:upstream",
  lint: "pnpm lint:root && pnpm -r --filter './packages/*' --if-present lint",
  typecheck: verifiedRecursive("typecheck"),
  check: `pnpm lint:symlinks && pnpm lint:root && ${verifiedRecursive("check")}`,
  test: "pnpm format:check && pnpm test:unit",
  "test:unit": verifiedRecursive("test"),
  "test:scripts": "node --test 'scripts/build/*.test.mjs'",
  qa: "pnpm check && pnpm test:unit && pnpm test:scripts",
  "test:integration": verifiedRecursive("test:integration"),
  vsix: `${pkg("better-zsh")} vsix`,
  "test:smoke": [
    `${pkg("@carlwr/zsh-core")} test:smoke`,
    `${pkg("@carlwr/zsh-core-tooldef")} test:smoke`,
    `${pkg("@carlwr/zshref-mcp")} test:smoke`,
    `${pkg("better-zsh")} test:smoke`,
  ].join(" && "),
  cli: "make cli",
  "cli:debug": "make cli-debug",
  "cli:test": "make cli-test",
  "cli:check": "make cli-check",
}
