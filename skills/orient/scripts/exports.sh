#!/usr/bin/env bash
# List all public exports from source modules.
# Useful for finding functions, types, constants by name.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

pkg="${1:-}"
case "$pkg" in
  zsh-core)   dir=packages/zsh-core/src ;;
  ext)        dir=packages/vscode-better-zsh/src ;;
  *)
    echo "Usage: $0 <zsh-core|ext>"
    echo "Lists all 'export' lines from source (excluding tests)."
    exit 1
    ;;
esac

rg '^export ' --type ts -g '!test/' "$dir" | sort
