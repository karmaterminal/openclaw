#!/usr/bin/env bash
# ctl.sh REF FILE RUN [EXTRA_ENV...]: one focused control run of FILE at REF (cand|prior|up), via
# oc-focused (planner-routed config, --maxWorkers=1, umask 0022, FORCE_COLOR unset) inside the
# frond-scribe live-gateway isolation wrapper (private /tmp/openclaw, no host systemd/dbus).
# CI facts reproduced: Node v26.12.1, OPENCLAW_VITEST_RUNTIME=node, private 0700 HOME and TMPDIR.
# The full raw log is kept as controls/<ref>-<mode>-<slug>-run<N>.log; one row goes to
# controls/summary.tsv. Extra KEY=VALUE args are added to the test env and named in <mode>.
# Adapted from lane-evidence/129388-final-modeb-classify/tools/ctl.sh.
set -uo pipefail
ref=$1 file=$2 run=$3; shift 3
R=/home/figs/classify-129388-s4nr
WT=/home/figs/flesh_beast_best_beast/source/WORKTREES
case "$ref" in
  cand) wt=$R/cand-a329243b donor=$WT/openclaw-129388-stage4-pins-deletion-fix ;;
  prior) wt=$R/prior-16541aa5 donor=$WT/openclaw-129388-final-fix ;;
  up) wt=$R/up-5a3e6b1c donor=$WT/openclaw-129388-stage4-config-readiness-up ;;
  probe) wt=$R/probe donor=$WT/openclaw-129388-stage4-pins-deletion-fix ;; # bisect probe (lock 9608b4f2); SHA in log + row
  *) echo "ref must be cand|prior|up|probe" >&2; exit 2 ;;
esac
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
mode=node26121
for kv in "$@"; do mode="$mode+${kv%%=*}"; done
# CTL_ROOT_LEN=N bind-mounts the worktree at a path exactly N characters long (long-root.sh, private
# namespace) and runs from there: the Mode-B shard checkout root is 94 characters. The mode names it.
runwt=$wt
if [[ -n "${CTL_ROOT_LEN:-}" ]]; then
  lrbase=$R/lr/ci-batch-work-$ref- lrtail=/shard-1-x
  pad=$(( CTL_ROOT_LEN - ${#lrbase} - ${#lrtail} ))
  ((pad > 0)) || { echo "CTL_ROOT_LEN too short" >&2; exit 2; }
  runwt=$lrbase$(printf "%0${pad}d" 0)$lrtail
fi
wrap=("$iso" "$runwt")
if [[ -n "${CTL_ROOT_LEN:-}" ]]; then wrap=("$(dirname "$0")/long-root.sh" "$wt" "$runwt" "${wrap[@]}"); mode="$mode+rootlen$CTL_ROOT_LEN"; fi
# The first run at a ref hard-links node_modules from the lock-identical donor (oc-focused checks the
# pnpm-lock.yaml sha256 itself). The worktree path, not the long-root alias, receives the links.
link=()
[[ -e "$wt/node_modules" ]] || link=(--link-deps-from "$donor")
slug=$(printf '%s' "$file" | sed -E 's#[/.]+#-#g; s#-(test|ts)-?#-#g; s#-+$##')
files=("$file")
if [[ "$file" == @* ]]; then
  files=(); while IFS= read -r f; do [[ -f "$wt/$f" ]] && files+=("$f"); done <"${file#@}"
  slug=list-$(basename "${file#@}" .files)
fi
mkdir -p "$R/controls"
log="$R/controls/${ref}-${mode}-${slug}-run${run}.log"
[[ ! -e "$log" ]] || { echo "refusing to overwrite $log" >&2; exit 2; }
scratch=$(mktemp -d /tmp/oc-s4nr-XXXXXX)
chmod 0700 "$scratch"
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctl ref=$ref sha=$sha file=$file run=$run mode=$mode start=$start"
  echo "# files: ${#files[@]} runwt=$runwt (${#runwt} chars) link=${link[*]:-<present>}"
  echo "# env: PATH=$node26:\$PATH OPENCLAW_VITEST_RUNTIME=node HOME=$scratch/home TMPDIR=$scratch/tmp $* (timeout ${CTL_TIMEOUT:-570}s)"
  timeout --kill-after=20 "${CTL_TIMEOUT:-570}" "${wrap[@]}" env PATH="$node26:$PATH" OPENCLAW_VITEST_RUNTIME=node \
    HOME="$scratch/home" TMPDIR="$scratch/tmp" "$@" \
    /home/figs/.local/bin/oc-focused --worktree "$runwt" "${link[@]}" "${files[@]}"
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
verdict=$(grep -aE '^VERDICT ' "$log" | tail -n1)
secs=$(( $(date +%s) - t0 ))
dirty=$(git -C "$wt" status --porcelain | wc -l)
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "$ref" "${sha:0:12}" "$mode" "$file" "$run" "$rc" "$secs" \
  "${verdict:-NO-VERDICT}" "$(basename "$log")" >>"$R/controls/summary.tsv"
rm -rf "$scratch"
printf '%s %s run%s rc=%s %ss %s dirty=%s\n' "$ref" "$file" "$run" "$rc" "$secs" "${verdict:-NO-VERDICT}" "$dirty"
