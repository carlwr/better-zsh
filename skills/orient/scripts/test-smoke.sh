#!/usr/bin/env bash
# Smoke-test the orientation scripts. Run from anywhere in the repo.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
fail=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }

assert_exit() {
  local want="$1"; shift
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then got=0; else got=$?; fi
  if [ "$got" -eq "$want" ]; then pass "$desc"; else die "$desc (exit $got, want $want)"; fi
}

# capture-then-check avoids SIGPIPE/pipefail issues with grep -q on pipes
assert_output_min_lines() {
  local min="$1"; shift
  local desc="$1"; shift
  local out n
  out=$("$@" 2>&1) || true
  n=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  if [ "$n" -ge "$min" ]; then pass "$desc ($n lines)"; else die "$desc ($n lines, want ≥$min)"; fi
}

assert_output_contains() {
  local pattern="$1"; shift
  local desc="$1"; shift
  local out
  out=$("$@" 2>&1) || true
  if printf '%s\n' "$out" | grep -q "$pattern"; then pass "$desc"; else die "$desc (missing: $pattern)"; fi
}

assert_path_kind() {
  local kind="$1"; shift
  local desc="$1"; shift
  local path="$1"
  case "$kind" in
    symlink) [ -L "$path" ] ;;
    file) [ -f "$path" ] ;;
    dir) [ -d "$path" ] ;;
    *) die "$desc (bad kind: $kind)"; return ;;
  esac
  if [ $? -eq 0 ]; then pass "$desc"; else die "$desc ($path)"; fi
}

assert_skill_relative_exec() {
  local desc="$1"; shift
  local skill_file="$1"
  local out
  out=$(
    cd "$(dirname "$skill_file")" &&
    bash ./scripts/overview.sh
  ) || true
  if printf '%s\n' "$out" | grep -q "=== packages/zsh-core/src ==="; then
    pass "$desc"
  else
    die "$desc (relative ./scripts/overview.sh failed from $(dirname "$skill_file"))"
  fi
}

echo "orient skill scripts smoke test"
echo "================================"

echo ""
echo "overview.sh:"
assert_exit 0 "exits 0" bash "$dir/overview.sh"
assert_output_contains "=== packages/zsh-core/src ===" \
  "contains zsh-core source header" bash "$dir/overview.sh"
assert_output_contains "=== packages/vscode-better-zsh/src ===" \
  "contains ext source header" bash "$dir/overview.sh"
assert_output_contains "=== packages/zsh-core/src/test ===" \
  "contains zsh-core test header" bash "$dir/overview.sh"
assert_output_min_lines 30 "produces substantial output" bash "$dir/overview.sh"

echo ""
echo "exports.sh:"
assert_exit 0 "zsh-core exits 0" bash "$dir/exports.sh" zsh-core
assert_exit 0 "ext exits 0" bash "$dir/exports.sh" ext
assert_exit 1 "no args exits 1" bash "$dir/exports.sh"
assert_exit 1 "bad arg exits 1" bash "$dir/exports.sh" badarg
assert_output_min_lines 50 "zsh-core has ≥50 exports" bash "$dir/exports.sh" zsh-core
assert_output_min_lines 10 "ext has ≥10 exports" bash "$dir/exports.sh" ext

echo ""
echo "providers.sh:"
assert_exit 0 "exits 0" bash "$dir/providers.sh"
assert_output_contains "Provider" "mentions Provider" bash "$dir/providers.sh"
assert_output_contains "semanticTokenScopes" "mentions semanticTokenScopes" bash "$dir/providers.sh"

echo ""
echo "skill symlinks:"
root="$(git -C "$dir" rev-parse --show-toplevel)"
assert_path_kind symlink "Claude Code  skill dir is symlink" "$root/.claude/skills/orient"
assert_path_kind file    "Claude Code  skill file resolves"  "$root/.claude/skills/orient/SKILL.md"
assert_path_kind dir     "Claude Code  scripts dir resolves" "$root/.claude/skills/orient/scripts"
assert_skill_relative_exec "Claude Code  relative script exec works" "$root/.claude/skills/orient/SKILL.md"

assert_path_kind symlink "Codex        skill dir is symlink" "$root/.agents/skills/orient"
assert_path_kind file    "Codex        skill file resolves"  "$root/.agents/skills/orient/SKILL.md"
assert_path_kind dir     "Codex        scripts dir resolves" "$root/.agents/skills/orient/scripts"
assert_skill_relative_exec "Codex        relative script exec works" "$root/.agents/skills/orient/SKILL.md"

assert_path_kind symlink "Open Code    skill dir is symlink" "$root/.opencode/skills/orient"
assert_path_kind file    "Open Code    skill file resolves"  "$root/.opencode/skills/orient/SKILL.md"
assert_path_kind dir     "Open Code    scripts dir resolves" "$root/.opencode/skills/orient/scripts"
assert_skill_relative_exec "Open Code    relative script exec works" "$root/.opencode/skills/orient/SKILL.md"

assert_path_kind symlink "Cursor       rule file is symlink"    "$root/.cursor/rules/orient.mdc"
assert_path_kind symlink "Cursor       scripts dir is symlink"  "$root/.cursor/rules/scripts"
assert_path_kind file    "Cursor       scripts resolve"         "$root/.cursor/rules/scripts/overview.sh"
assert_skill_relative_exec "Cursor       relative script exec works" "$root/.cursor/rules/orient.mdc"

echo ""
if [ "$fail" -eq 0 ]; then
  printf '\033[32mall passed\033[0m\n'
else
  printf '\033[31msome tests failed\033[0m\n'
  exit 1
fi
