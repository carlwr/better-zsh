#!/usr/bin/env bash
# List all public exports from source modules.
# Useful for finding functions, types, constants by name.
# Requires: ripgrep (rg)
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

pkg="${1:-}"
case "$pkg" in
  zsh-core)   dir=packages/zsh-core/src ;;
  tooldef)    dir=packages/zsh-core-tooldef ;;
  mcp)        dir=packages/zshref-mcp ;;
  zshref)     dir=packages/zshref ;;
  ext)        dir=packages/vscode-better-zsh/src ;;
  *)
    echo "Usage: $0 <zsh-core|tooldef|mcp|zshref|ext>"
    echo "Lists all 'export' lines from source (excluding tests)."
    exit 1
    ;;
esac

rg '^export ' --type ts -g '!test/' -g '!dist/' -g '!node_modules/' "$dir" | sort
