#!/usr/bin/env bash
# ctlbuild.sh SHA RUN: check out SHA in the scratch probe worktree and run CI's pretest-build
# command (`node --import ./scripts/tsx.mjs scripts/build-all.mts`) there, with the isolation
# wrapper, umask 0022, FORCE_COLOR unset, Node v26.12.1, private 0700 HOME/TMPDIR, niced and pinned
# to cores 12-19. Raw log: controls/probe-build-all-<sha8>-run<N>.log.
set -uo pipefail
sha=$1 run=$2
wt=/home/figs/classify-129388/probe
here=$(cd "$(dirname "$0")/.." && pwd)
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
[[ -z "$(git -C "$wt" status --porcelain --untracked-files=no)" ]] || { echo "probe has tracked changes" >&2; exit 1; }
git -C "$wt" checkout --quiet --detach "$sha" || exit 1
full=$(git -C "$wt" rev-parse HEAD)
log="$here/controls/probe-build-all-${full:0:8}-run${run}.log"
scratch=$(mktemp -d /tmp/oc-classify-XXXXXX); mkdir -m 0700 "$scratch/home" "$scratch/tmp"
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctlbuild sha=$full run=$run start=$start cmd=node --import ./scripts/tsx.mjs scripts/build-all.mts"
  (umask 0022 && timeout --kill-after=30 3000 taskset -c 12-19 nice -n 10 "$iso" "$wt" env -u FORCE_COLOR \
    PATH="$node26:$PATH" HOME="$scratch/home" TMPDIR="$scratch/tmp" \
    node --import ./scripts/tsx.mjs scripts/build-all.mts)
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
secs=$(( $(date +%s) - t0 ))
v=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aE 'PLUGIN SDK DTS|^\s+- .*exceeds|failed after' | tr -s ' ' | paste -sd '|' | cut -c1-600)
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "probe" "${full:0:12}" "build-all" "scripts/build-all.mts" "$run" "$rc" "$secs" "${v:-no-violations}" "$(basename "$log")" >>"$here/controls/summary.tsv"
rm -rf "$scratch"
echo "build ${full:0:12} run$run rc=$rc ${secs}s ${v:-no-violations}"
