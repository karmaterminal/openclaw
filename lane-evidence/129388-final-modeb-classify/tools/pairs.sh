#!/usr/bin/env bash
# pairs.sh RUNS BUDGET_SECONDS FILE...: alternate base/cand control runs (ctl.sh) for each FILE,
# RUNS times each, and stop starting new runs once BUDGET_SECONDS have elapsed.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
runs=$1 budget=$2; shift 2
t0=$(date +%s)
for f in "$@"; do
  for n in $(seq "$runs"); do
    for ref in base cand; do
      if (( $(date +%s) - t0 > budget )); then echo "BUDGET-STOP before $ref $f run$n"; exit 0; fi
      "$here/ctl.sh" "$ref" "$f" "$n"
    done
  done
done
