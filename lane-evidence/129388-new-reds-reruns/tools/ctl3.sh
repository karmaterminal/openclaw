#!/usr/bin/env bash
# ctl3.sh REF FILE RUN: one focused run of FILE at REF, via oc-focused (planner-routed config,
# --maxWorkers=1, umask 0022, FORCE_COLOR unset) inside the frond-scribe live-gateway isolation
# wrapper (private /tmp/openclaw, no host systemd/dbus). CI facts reproduced: Node v26.12.1 (the
# ARC pod's, aarch64 like ronan), OPENCLAW_VITEST_RUNTIME=node, private 0700 HOME and TMPDIR.
#   REF: cand (16541aa5) | prior (93a1e356) | base (1129d4c0) | rv-<tag> (a revert probe worktree)
#   RUN: an iteration number; 0 = warm-up (links deps from final-fix via oc-focused; not counted).
# Keeps the full raw log as runs/<ref>-<slug>-run<N>.log and the 1 s /proc/meminfo samples as
# runs/<ref>-<slug>-run<N>.meminfo.tsv; appends one row to runs/summary.tsv with Dirty/Writeback
# before, after and max-during, load, disk use and the extdbw lane's process count.
# Exit 3 = disk stop (ronan / at or past 89.9 %), no run started.
set -uo pipefail
umask 022
ref=$1 file=$2 run=$3
W=/home/figs/flesh_beast_best_beast/source/WORKTREES
case "$ref" in
  cand) wt=$W/openclaw-129388-nrr-cand-16541aa5 ;;
  prior) wt=$W/openclaw-129388-nrr-prior-93a1e356 ;;
  base) wt=$W/openclaw-129388-nrr-base-1129d4c0 ;;
  rv-*) wt=$W/openclaw-129388-nrr-${ref} ;;
  *) echo "ref must be cand|prior|base|rv-<tag>" >&2; exit 2 ;;
esac
[[ -d "$wt" ]] || { echo "no worktree $wt" >&2; exit 2; }
here=$(cd "$(dirname "$0")/.." && pwd)
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
donor=$W/openclaw-129388-final-fix
link=()
[[ "$run" != 0 ]] || link=(--link-deps-from "$donor")
slug=$(printf '%s' "$file" | sed -E 's#^(src|test)/##; s#[/.]+#-#g; s#-(test|ts)-?#-#g; s#-+$##')
# CTL_FAKE_DIRTY_KB=N: one-variable control, the same isolation wrapper plus a /proc/meminfo whose
# Dirty: line reads N kB (iso-fake-dirty.sh). Its rows go to runs/controls.tsv, not summary.tsv.
wrap=("$iso")
summary="$here/runs/summary.tsv"
tag=$ref
if [[ -n "${CTL_FAKE_DIRTY_KB:-}" ]]; then
  wrap=("$(dirname "$0")/iso-fake-dirty.sh" "$CTL_FAKE_DIRTY_KB")
  summary="$here/runs/controls.tsv"
  tag="$ref+fakedirty$CTL_FAKE_DIRTY_KB"
fi
# CTL_TASKSET=CORES: one-variable control, the whole run (Vitest and its children) limited to the
# CPU list CORES with taskset; nothing else changes. Rows go to runs/controls.tsv.
if [[ -n "${CTL_TASKSET:-}" ]]; then
  [[ "$CTL_TASKSET" =~ ^[0-9,-]+$ ]] || { echo "CTL_TASKSET must be a CPU list" >&2; exit 2; }
  wrap=(taskset -c "$CTL_TASKSET" "${wrap[@]}")
  summary="$here/runs/controls.tsv"
  tag="$tag+cpus${CTL_TASKSET//,/_}"
fi
log="$here/runs/${tag}-${slug}-run${run}.log"
mem="$here/runs/${tag}-${slug}-run${run}.meminfo.tsv"

disk_pct() { df -B1 / | awk 'NR==2{printf "%.3f", 100*$3/($3+$4)}'; }
meminfo() { awk '/^Dirty:/{d=$2} /^Writeback:/{w=$2} END{printf "%s\t%s", d, w}' /proc/meminfo; }
load1() { cut -d' ' -f1 /proc/loadavg; }
extdbw() { pgrep -fc 'WORKTREES/openclaw-129388-extdbw-local-shard' || true; }

pct=$(disk_pct)
if awk -v p="$pct" 'BEGIN{exit !(p >= 89.9)}'; then
  echo "DISK-STOP: ronan / at ${pct}% (stop line 90%); not starting $ref $file run$run" >&2
  exit 3
fi
scratch=$(mktemp -d /tmp/oc-nrr-XXXXXX)
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
sha=$(git -C "$wt" rev-parse HEAD)
mb=$(meminfo); lb=$(load1); xb=$(extdbw)
# write_bytes / cancelled_write_bytes of this process, which accumulates every reaped descendant
# (the run's whole process tree): the page-cache bytes this run itself dirtied.
ioacct() { awk '/^write_bytes:/{w=$2} /^cancelled_write_bytes:/{c=$2} END{printf "%s\t%s", w, c}' "/proc/$$/io"; }
io0=$(ioacct)
start=$(date -u +%FT%TZ); t0=$(date +%s)
printf 'epoch\tdirty_kb\twriteback_kb\n' >"$mem"
( while :; do printf '%s\t%s\n' "$(date +%s)" "$(meminfo)" >>"$mem"; sleep 1; done ) &
sampler=$!
# A killed ctl3 must not leave its sampler behind.
trap 'kill "$sampler" 2>/dev/null' EXIT
{
  echo "# ctl3 ref=$tag sha=$sha file=$file run=$run start=$start host=$(hostname) arch=$(uname -m)"
  echo "# before: dirty_kb/writeback_kb=${mb/$'\t'//} load1=$lb disk=${pct}% extdbw_procs=$xb"
  echo "# env: PATH=$node26:\$PATH OPENCLAW_VITEST_RUNTIME=node HOME=$scratch/home TMPDIR=$scratch/tmp umask=$(umask)"
  echo "# argv: ${wrap[*]} $wt env ... oc-focused ${link[*]} --worktree $wt $file"
  timeout --kill-after=20 1200 "${wrap[@]}" "$wt" env PATH="$node26:$PATH" OPENCLAW_VITEST_RUNTIME=node \
    HOME="$scratch/home" TMPDIR="$scratch/tmp" \
    /home/figs/.local/bin/oc-focused "${link[@]}" --worktree "$wt" "$file"
  echo "# exit=$?"
} >"$log" 2>&1
kill "$sampler" 2>/dev/null; wait "$sampler" 2>/dev/null
ma=$(meminfo); la=$(load1); xa=$(extdbw)
io1=$(ioacct)
iow=$(( ${io1%%$'\t'*} - ${io0%%$'\t'*} )); ioc=$(( ${io1##*$'\t'} - ${io0##*$'\t'} ))
[[ -s "$here/runs/io.tsv" ]] || printf 'start\tref\tfile\trun\trun_write_bytes\trun_cancelled_write_bytes\tdirty_before_kb\tdirty_max_kb\n' >"$here/runs/io.tsv"
maxd=$(awk -F'\t' 'NR>1 && $2>m{m=$2} END{print m+0}' "$mem")
maxw=$(awk -F'\t' 'NR>1 && $3>m{m=$3} END{print m+0}' "$mem")
echo "# after: dirty_kb/writeback_kb=${ma/$'\t'//} max_during_dirty_kb=$maxd max_during_writeback_kb=$maxw load1=$la extdbw_procs=$xa run_write_bytes=$iow run_cancelled_write_bytes=$ioc" >>"$log"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$start" "$tag" "$file" "$run" "$iow" "$ioc" "${mb%%$'\t'*}" "$maxd" >>"$here/runs/io.tsv"
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
verdict=$(grep -aE '^VERDICT ' "$log" | tail -n1)
secs=$(( $(date +%s) - t0 ))
dirty=$(git -C "$wt" status --porcelain --untracked-files=no | wc -l)
[[ -s "$summary" ]] || printf 'start\tref\tsha\tfile\trun\trc\tsecs\tverdict\tdirty_before_kb\twb_before_kb\tdirty_after_kb\twb_after_kb\tdirty_max_kb\twb_max_kb\tload1_before\tload1_after\tdisk_pct\textdbw_before\textdbw_after\ttracked_dirty\tlog\n' >"$summary"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$start" "$tag" "${sha:0:12}" "$file" "$run" "$rc" "$secs" \
  "${verdict:-NO-VERDICT}" "$mb" "$ma" "$maxd" "$maxw" "$lb" "$la" "$pct" "$xb" "$xa" "$dirty	$(basename "$log")" >>"$summary"
rm -rf "$scratch"
printf '%s %s run%s rc=%s %ss %s dirty_max=%skB disk=%s%%\n' "$tag" "$file" "$run" "$rc" "$secs" "${verdict:-NO-VERDICT}" "$maxd" "$pct"
