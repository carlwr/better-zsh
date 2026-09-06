// Which script invocations can rebuild a shared upstream `dist/`.
//
// Split out from the contract verifier so the detection is unit-testable on
// fixtures: a guard that silently stops matching still exits 0, so nothing
// else would notice it had stopped guarding.

export const upstreamPkgs = ["@carlwr/zsh-core", "@carlwr/zsh-core-tooldef"]

export function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Ends a script name: not a longer name sharing the prefix, but `)` and `;`
// still close one — `(pnpm --filter @carlwr/zsh-core build)` is an invocation.
const nameEnd = String.raw`(?:[\s&);]|$)`
const filterFlags = ["--filter", "-F"]

/** `pnpm --filter <pkg> <script>`, in any spelling of filter and `run`. */
function pkgInvokes(cmd, pkgName, script) {
  const call = `(?:run )?${reEscape(script)}${nameEnd}`
  return filterFlags.some(flag =>
    new RegExp(`pnpm ${flag} ${reEscape(pkgName)} ${call}`).test(cmd),
  )
}

export function hasUpstreamBuild(cmd) {
  return upstreamPkgs.some(name => pkgInvokes(cmd, name, "build"))
}

/** `pnpm <script>` / `pnpm run <script>`, not a longer name sharing the prefix. */
function invokes(cmd, script) {
  return new RegExp(`pnpm (?:run )?${reEscape(script)}${nameEnd}`).test(cmd)
}

/**
 * A package's scripts whose invocation can rebuild upstream: those carrying an
 * upstream-rebuilding `pre*` hook, plus, transitively, any sibling calling one.
 */
export function upstreamTriggering(scripts) {
  const triggering = new Set()
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!hasUpstreamBuild(cmd)) continue
    triggering.add(name.startsWith("pre") ? name.slice(3) : name)
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, cmd] of Object.entries(scripts)) {
      if (triggering.has(name)) continue
      if (![...triggering].some(target => invokes(cmd, target))) continue
      triggering.add(name)
      grew = true
    }
  }
  return triggering
}

/**
 * Root scripts compose each other, so a fan-out can hide behind an alias.
 * Inline what a referenced root command actually runs, except references
 * already routed through the readiness helper: those are safe by construction,
 * and inlining them would flag every aggregator assembled from safe parts.
 */
export function expandRootRefs(cmd, rootCommands, routedMarker, depth = 3) {
  if (depth === 0) return cmd
  return cmd.replace(/pnpm (?:run )?(\w[\w:.-]*)/g, (ref, name) => {
    const target = rootCommands[name]
    if (target === undefined || target.includes(routedMarker)) return ref
    return `${ref} ${expandRootRefs(target, rootCommands, routedMarker, depth - 1)}`
  })
}

/**
 * Distinct invocations in one root command that can each rebuild upstream.
 * Two or more means a fan-out: it needs the readiness helper, whether it is
 * spelled `pnpm -r` or as a hand-rolled chain of `--filter` calls.
 */
export function upstreamRebuildSources(cmd, triggeringByPkg) {
  const sources = new Set()
  for (const upstream of upstreamPkgs) {
    if (!pkgInvokes(cmd, upstream, "build")) continue
    sources.add(`${upstream}:build`)
  }
  for (const [pkgName, scripts] of triggeringByPkg) {
    for (const script of scripts) {
      if (!pkgInvokes(cmd, pkgName, script)) continue
      sources.add(`${pkgName}:${script}`)
      break
    }
  }
  return sources
}
