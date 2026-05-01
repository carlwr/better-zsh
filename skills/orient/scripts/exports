#!/usr/bin/env bash

set -euo pipefail

help="
Usage: $0 <zsh-core|tooldef|mcp|ext>

Lists all 'export' lines from source (excluding tests). Each output line is filename + first line of the export expression.

The Rust CLI under zshref-rs/ is out of scope; browse that crate directly.

Useful for: finding functions, types, constants by name.

Requires: ripgrep (rg)
"

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

pkg="${1:-}"
case "$pkg" in
  (zsh-core)   dir=packages/zsh-core/src ;;
  (tooldef)    dir=packages/zsh-core-tooldef ;;
  (mcp)        dir=packages/zshref-mcp ;;
  (ext)        dir=packages/vscode-better-zsh/src ;;
  (-h|--help)  echo "$help"     && exit 0;;
  (*)          echo "$help" >&2 && exit 1;;
esac

rg '^export ' --type ts -g '!test/' -g '!dist/' -g '!node_modules/' "$dir" | sort
