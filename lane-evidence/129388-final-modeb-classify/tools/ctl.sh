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
  base) wt=/home/figs/classify-129388/base-1129d4c0 ;;
  cand) wt=/home/figs/classify-129388/cand-93a1e356 ;;
  probe) wt=/home/figs/classify-129388/probe-final ;; # bisect probe; its SHA is in the log header and summary row
  *) echo "ref must be base|cand|probe" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd)
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
mode=node26121
for kv in "$@"; do mode="$mode+${kv%%=*}"; done
# CTL_ROOT_LEN=N bind-mounts the worktree at a path exactly N characters long (long-root.sh, private
# namespace) and runs from there: the Mode-B shard checkout root is 94 characters. The mode names it.
runwt=$wt
if [[ -n "${CTL_ROOT_LEN:-}" ]]; then
  lrbase=/home/figs/classify-129388/lr/ci-batch-work-$ref- lrtail=/shard-1-x
  pad=$(( CTL_ROOT_LEN - ${#lrbase} - ${#lrtail} ))
  ((pad > 0)) || { echo "CTL_ROOT_LEN too short" >&2; exit 2; }
  runwt=$lrbase$(printf "%0${pad}d" 0)$lrtail
fi
# CTL_NO_ISO=1 runs outside the user namespace (for tests that need real uid mapping, e.g. setfacl
# on another uid). Only for tests that never touch /tmp/openclaw; the mode names it.
wrap=("$iso" "$runwt")
if [[ "${CTL_NO_ISO:-}" == 1 ]]; then wrap=(); mode="$mode+noiso"; fi
# CTL_MASK_PROFILE_D=1 empties /etc/profile.d first (the runner image's state); the mode names it.
if [[ "${CTL_MASK_PROFILE_D:-}" == 1 ]]; then wrap=("$(dirname "$0")/mask-profile-d.sh" "${wrap[@]}"); mode="$mode+maskprofiled"; fi
# CTL_HIDE_BIN=NAME runs with PATH = Node 26.12.1 + a shim of /usr/bin and /bin minus NAME; the mode names it.
if [[ -n "${CTL_HIDE_BIN:-}" ]]; then
  shim=$(mktemp -d /tmp/oc-classify-shim-XXXXXX)
  for b in /usr/bin/* /bin/*; do n=${b##*/}; [[ "$n" == "$CTL_HIDE_BIN" || -e "$shim/$n" ]] || ln -s "$b" "$shim/$n"; done
  PATH=$shim; mode="$mode+hide-$CTL_HIDE_BIN"
fi
# CTL_CPU_STARVE=N pins the run to core 19 and runs N busy loops on that core for its duration
# (CPU starvation, the loaded-pod state); the mode names it.
starve=()
if [[ -n "${CTL_CPU_STARVE:-}" ]]; then
  for _ in $(seq "$CTL_CPU_STARVE"); do taskset -c 19 sh -c 'while :; do :; done' & starve+=($!); done
  wrap=(taskset -c 19 "${wrap[@]}"); mode="$mode+starve$CTL_CPU_STARVE"
fi
# CTL_SHM_SIZE=SIZE mounts a fresh SIZE tmpfs over /dev/shm (small-shm.sh); the ARC pod's is 64 MiB.
if [[ -n "${CTL_SHM_SIZE:-}" ]]; then wrap=("$(dirname "$0")/small-shm.sh" "$CTL_SHM_SIZE" "${wrap[@]}"); mode="$mode+shm$CTL_SHM_SIZE"; fi
if [[ -n "${CTL_ROOT_LEN:-}" ]]; then wrap=("$(dirname "$0")/long-root.sh" "$wt" "$runwt" "${wrap[@]}"); mode="$mode+rootlen$CTL_ROOT_LEN"; fi
slug=$(printf '%s' "$file" | sed -E 's#[/.]+#-#g; s#-(test|ts)-?#-#g; s#-+$##')
# FILE may be @LIST: run every file named in LIST (one per line, files absent at REF dropped) in one
# oc-focused call, e.g. a CI sub-shard's file list.
files=("$file")
if [[ "$file" == @* ]]; then
  files=(); while IFS= read -r f; do [[ -f "$wt/$f" ]] && files+=("$f"); done <"${file#@}"
  slug=list-$(basename "${file#@}" .files)
fi
log="$here/controls/${ref}-${mode}-${slug}-run${run}.log"
scratch=$(mktemp -d /tmp/oc-classify-XXXXXX)
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctl ref=$ref sha=$sha file=$file run=$run mode=$mode start=$start"
  echo "# files: ${#files[@]} runwt=$runwt (${#runwt} chars)"
  echo "# env: PATH=$node26:\$PATH OPENCLAW_VITEST_RUNTIME=node HOME=$scratch/home TMPDIR=$scratch/tmp $*"
  timeout --kill-after=20 570 "${wrap[@]}" env PATH="$node26:$PATH" OPENCLAW_VITEST_RUNTIME=node \
    HOME="$scratch/home" TMPDIR="$scratch/tmp" "$@" \
    /home/figs/.local/bin/oc-focused --worktree "$runwt" "${files[@]}"
  echo "# exit=$?"
} >"$log" 2>&1
((${#starve[@]})) && kill "${starve[@]}" 2>/dev/null
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
verdict=$(grep -aE '^VERDICT ' "$log" | tail -n1)
secs=$(( $(date +%s) - t0 ))
dirty=$(git -C "$wt" status --porcelain | wc -l)
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "$ref" "${sha:0:12}" "$mode" "$file" "$run" "$rc" "$secs" \
  "${verdict:-NO-VERDICT}" "$(basename "$log")" >>"$here/controls/summary.tsv"
rm -rf "$scratch" ${shim:+"$shim"}
printf '%s %s run%s rc=%s %ss %s dirty=%s\n' "$ref" "$file" "$run" "$rc" "$secs" "${verdict:-NO-VERDICT}" "$dirty"
