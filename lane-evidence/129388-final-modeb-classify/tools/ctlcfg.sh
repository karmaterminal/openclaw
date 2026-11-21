#!/usr/bin/env bash
# ctlcfg.sh REF CONFIG RUN [EXTRA_ENV...]: one whole-config control run (every file the config owns,
# no include file) at REF (base|cand), `node scripts/run-vitest.mjs run --config CONFIG --maxWorkers=1`,
# with ctl.sh's environment: isolation wrapper, umask 0022, FORCE_COLOR unset, Node v26.12.1,
# OPENCLAW_VITEST_RUNTIME=node, private 0700 HOME/TMPDIR. Raw log: controls/<ref>-cfg-<name>-run<N>.log.
set -uo pipefail
ref=$1 config=$2 run=$3; shift 3
case "$ref" in
  base) wt=/home/figs/classify-129388/base-1129d4c0 ;;
  cand) wt=/home/figs/classify-129388/cand-93a1e356 ;;
  probe) wt=/home/figs/classify-129388/probe-final ;;
  *) echo "ref must be base|cand|probe" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd)
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
name=$(basename "$config" .config.ts); name=${name#vitest.}
log="$here/controls/${ref}-cfg-${name}-run${run}.log"
scratch=$(mktemp -d /tmp/oc-classify-XXXXXX)
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctlcfg ref=$ref sha=$sha config=$config run=$run start=$start"
  echo "# env: PATH=$node26:\$PATH OPENCLAW_VITEST_RUNTIME=node HOME=$scratch/home TMPDIR=$scratch/tmp umask=0022 $*"
  (umask 0022 && timeout --kill-after=30 ${CTLCFG_TIMEOUT:-3600} "$iso" "$wt" env -u FORCE_COLOR -u OPENCLAW_VITEST_INCLUDE_FILE \
    PATH="$node26:$PATH" OPENCLAW_VITEST_RUNTIME=node HOME="$scratch/home" TMPDIR="$scratch/tmp" "$@" \
    node scripts/run-vitest.mjs run --config "$config" --maxWorkers=1)
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
counts=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aE '^\s+(Test Files|Tests)\s' | tail -n2 | tr -s ' ' | paste -sd ';')
secs=$(( $(date +%s) - t0 ))
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "$ref" "${sha:0:12}" "cfg-node26121" "$config" "$run" "$rc" "$secs" \
  "${counts:-NO-COUNTS}" "$(basename "$log")" >>"$here/controls/summary.tsv"
rm -rf "$scratch"
printf '%s %s run%s rc=%s %ss %s\n' "$ref" "$config" "$run" "$rc" "$secs" "${counts:-NO-COUNTS}"
