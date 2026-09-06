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
  check: `pnpm lint:symlinks && pnpm lint:md && pnpm lint:root && ${verifiedRecursive("check")}`,
  test: "pnpm format:check && pnpm test:unit",
  "test:unit": verifiedRecursive("test"),
  "test:scripts": "node --test 'scripts/build/*.test.mjs'",
  // `lint:slowtypes` runs `deno publish --dry-run --no-check` on zsh-core: registry-independent, catches JSR slow-types regressions in seconds.
  qa: `pnpm check && ${pkg("@carlwr/zsh-core")} run lint:slowtypes && pnpm test:unit && pnpm test:scripts && pnpm cli:qa`,
  "test:integration": verifiedRecursive("test:integration"),
  vsix: `${pkg("better-zsh")} vsix`,
  "test:smoke": [
    `${pkg("@carlwr/zsh-core")} test:smoke`,
    `${pkg("@carlwr/zsh-core-tooldef")} test:smoke`,
    `${pkg("@carlwr/zshref-mcp")} test:smoke`,
    `${pkg("better-zsh")} test:smoke`,
    // Docs build is local and fast; the smoke tier catches a typedoc /
    // api-extractor break before the container run, without taxing `qa`.
    `${pkg("@carlwr/zsh-core")} docs:build`,
  ].join(" && "),
  cli: "make cli",
  "cli:debug": "make cli-debug",
  "cli:test": "make cli-test",
  "cli:check": "make cli-check",
  // One make invocation: `cli-test` and `cli-check` both depend on
  // `artifacts`; chaining via pnpm would rebuild artifacts twice.
  "cli:qa": "make cli-test cli-check",
}
