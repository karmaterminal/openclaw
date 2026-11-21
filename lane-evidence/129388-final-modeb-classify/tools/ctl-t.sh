#!/usr/bin/env bash
# ctl-t.sh REF CONFIG FILE RUN PATTERN: ctl.sh's environment (isolation wrapper, umask 0022,
# FORCE_COLOR unset, Node v26.12.1, OPENCLAW_VITEST_RUNTIME=node, private 0700 HOME/TMPDIR, an
# include file naming FILE as oc-focused writes it), but runs
# `node scripts/run-vitest.mjs run --config CONFIG --maxWorkers=1 FILE -t PATTERN`, so only the
# tests whose names match PATTERN run. Raw log: controls/<ref>-t-<slug>-run<N>.log.
set -uo pipefail
ref=$1 config=$2 file=$3 run=$4 pattern=$5
case "$ref" in
  base) wt=/home/figs/classify-129388/base-1129d4c0 ;;
  cand) wt=/home/figs/classify-129388/cand-93a1e356 ;;
  probe) wt=/home/figs/classify-129388/probe-final ;;
  probeold) wt=/home/figs/classify-129388/probe-old ;;
  *) echo "ref must be base|cand|probe|probeold" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd)
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
slug=$(printf '%s' "$file" | sed -E 's#[/.]+#-#g; s#-(test|ts)-?#-#g; s#-+$##')
log="$here/controls/${ref}-t-${slug}-run${run}.log"
scratch=$(mktemp -d /tmp/oc-classify-XXXXXX)
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
printf '[\n  "%s"\n]\n' "$file" >"$scratch/include.json"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctl-t ref=$ref sha=$sha file=$file config=$config run=$run pattern=$pattern start=$start"
  (umask 0022 && timeout --kill-after=20 570 "$iso" "$wt" env -u FORCE_COLOR PATH="$node26:$PATH" \
    OPENCLAW_VITEST_RUNTIME=node HOME="$scratch/home" TMPDIR="$scratch/tmp" \
    OPENCLAW_VITEST_INCLUDE_FILE="$scratch/include.json" \
    node scripts/run-vitest.mjs run --config "$config" --maxWorkers=1 "$file" -t "$pattern")
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
counts=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aE '^\s+(Test Files|Tests)\s' | tail -n2 | tr -s ' ' | paste -sd ';')
secs=$(( $(date +%s) - t0 ))
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "$ref" "${sha:0:12}" "t:$pattern" "$file" "$run" "$rc" "$secs" \
  "${counts:-NO-COUNTS}" "$(basename "$log")" >>"$here/controls/summary.tsv"
rm -rf "$scratch"
echo "$ref $file -t '$pattern' run$run rc=$rc ${secs}s ${counts:-NO-COUNTS}"
