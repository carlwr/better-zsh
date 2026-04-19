#!/usr/bin/env bash
# Emit a compact, always-fresh structural overview of the monorepo.
# Intended to be run by an agent at the start of a work session.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

echo "=== packages/zsh-core/src ==="
find packages/zsh-core/src -type f -name '*.ts' \
  | grep -v '/test/' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zsh-core/src/test ==="
find packages/zsh-core/src/test -type f -name '*.ts' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zsh-core-tooldef ==="
find packages/zsh-core-tooldef \
  -maxdepth 1 -type f -name '*.ts' 2>/dev/null \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done
find packages/zsh-core-tooldef/src -type f -name '*.ts' 2>/dev/null \
  | grep -v '/test/' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zsh-core-tooldef/src/test ==="
find packages/zsh-core-tooldef/src/test -type f -name '*.ts' 2>/dev/null \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zshref-mcp ==="
find packages/zshref-mcp \
  -maxdepth 1 -type f -name '*.ts' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done
find packages/zshref-mcp/src -type f -name '*.ts' 2>/dev/null \
  | grep -v '/test/' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zshref-mcp/src/test ==="
find packages/zshref-mcp/src/test -type f -name '*.ts' 2>/dev/null \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zshref ==="
find packages/zshref \
  -maxdepth 1 -type f -name '*.ts' 2>/dev/null \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done
find packages/zshref/src -type f -name '*.ts' 2>/dev/null \
  | grep -v '/test/' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/zshref/src/test ==="
find packages/zshref/src/test -type f -name '*.ts' 2>/dev/null \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/vscode-better-zsh/src ==="
find packages/vscode-better-zsh/src -type f -name '*.ts' \
  | grep -v '/test/' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== packages/vscode-better-zsh/src/test ==="
find packages/vscode-better-zsh/src/test -type f -name '*.ts' \
  | sort \
  | while read -r f; do printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"; done

echo ""
echo "=== zsh-core public API (dist/types/*.d.ts) ==="
if [ -d packages/zsh-core/dist/types ]; then
  for f in packages/zsh-core/dist/types/*.d.ts; do
    printf '  %4d  %s\n' "$(wc -l < "$f")" "$f"
  done
else
  echo "  (not built — run: pnpm --filter @carlwr/zsh-core build)"
fi
