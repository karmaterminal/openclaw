#!/usr/bin/env bash
# ctl.sh REF FILE RUN [EXTRA_ENV...]: one focused control run of FILE at REF (base|cand), via
# oc-focused (planner-routed config, --maxWorkers=1, umask 0022, FORCE_COLOR unset) inside the
# frond-scribe live-gateway isolation wrapper (private /tmp/openclaw, no host systemd/dbus).
# CI facts reproduced: Node v26.12.1, OPENCLAW_VITEST_RUNTIME=node, private 0700 HOME and TMPDIR.
# The full raw log is kept as controls/<ref>-<mode>-<slug>-run<N>.log; one row goes to
# controls/summary.tsv. Extra KEY=VALUE args are added to the test env and named in <mode>.
set -uo pipefail
ref=$1 file=$2 run=$3; shift 3
case "$ref" in
  base) wt=/home/figs/classify-129388/base-41bdde21 ;;
  cand) wt=/home/figs/classify-129388/cand-9476c7aa ;;
  probe) wt=/home/figs/classify-129388/probe ;; # bisect probe; its SHA is in the log header and summary row
  *) echo "ref must be base|cand|probe" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd)
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
mode=node26121
for kv in "$@"; do mode="$mode+${kv%%=*}"; done
slug=$(printf '%s' "$file" | sed -E 's#[/.]+#-#g; s#-(test|ts)-?#-#g; s#-+$##')
log="$here/controls/${ref}-${mode}-${slug}-run${run}.log"
scratch=$(mktemp -d /tmp/oc-classify-XXXXXX)
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctl ref=$ref sha=$sha file=$file run=$run mode=$mode start=$start"
  echo "# env: PATH=$node26:\$PATH OPENCLAW_VITEST_RUNTIME=node HOME=$scratch/home TMPDIR=$scratch/tmp $*"
  timeout --kill-after=20 570 "$iso" "$wt" env PATH="$node26:$PATH" OPENCLAW_VITEST_RUNTIME=node \
    HOME="$scratch/home" TMPDIR="$scratch/tmp" "$@" \
    /home/figs/.local/bin/oc-focused --worktree "$wt" "$file"
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
verdict=$(grep -aE '^VERDICT ' "$log" | tail -n1)
secs=$(( $(date +%s) - t0 ))
dirty=$(git -C "$wt" status --porcelain | wc -l)
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "$ref" "${sha:0:12}" "$mode" "$file" "$run" "$rc" "$secs" \
  "${verdict:-NO-VERDICT}" "$(basename "$log")" >>"$here/controls/summary.tsv"
rm -rf "$scratch"
printf '%s %s run%s rc=%s %ss %s dirty=%s\n' "$ref" "$file" "$run" "$rc" "$secs" "${verdict:-NO-VERDICT}" "$dirty"
