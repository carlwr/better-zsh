#!/bin/sh
# Cold loadCorpus() timings. N fresh node processes (default 10). Prints
# sorted per-run ms plus summary stats. Requires dist/ to be built.
#
# Usage: scripts/bench-load-corpus.sh [N]
set -eu
N=${1:-10}
cd "$(dirname "$0")/.."
for _ in $(seq "$N"); do
  node --input-type=module -e "const t0=performance.now(); const m=await import('./dist/index.mjs'); m.loadCorpus(); console.log((performance.now()-t0).toFixed(2))"
done | sort -n | awk '{ print; a[NR]=$1; s+=$1 } END { printf "---\nN=%d mean=%.2fms min=%s median=%s max=%s\n", NR, s/NR, a[1], a[int((NR+1)/2)], a[NR] }'
