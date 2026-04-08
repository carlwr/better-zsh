#!/usr/bin/env bash
# Show how extension providers are registered and which source files define them.
# Requires: ripgrep (rg)
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

echo "=== Provider registrations (extension.ts) ==="
rg 'new \w+Provider|register\w+Provider|languages\.register' \
  packages/vscode-better-zsh/src/extension.ts 2>/dev/null || echo "  (none found)"

echo ""
echo "=== Provider classes ==="
rg 'class \w+Provider' --type ts packages/vscode-better-zsh/src/ 2>/dev/null || echo "  (none found)"

echo ""
echo "=== semanticTokenScopes in package.json ==="
rg -A2 'semanticTokenScopes' packages/vscode-better-zsh/package.json 2>/dev/null | head -30
