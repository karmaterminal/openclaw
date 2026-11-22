#!/usr/bin/env bash
# ctlcfg.sh REF CONFIG INCLUDE_JSON RUN [EXTRA_ENV...]: replay one CI sub-shard invocation at REF
# (cand|prior|up): `node scripts/run-vitest.mjs run --config CONFIG --maxWorkers=1` with
# OPENCLAW_VITEST_INCLUDE_FILE=INCLUDE_JSON (CI's file list for that invocation), in ctl.sh's
# environment: isolation wrapper, umask 0022, FORCE_COLOR unset, Node v26.12.1,
# OPENCLAW_VITEST_RUNTIME=node, private 0700 HOME/TMPDIR. CTL_ROOT_LEN as in ctl.sh.
# Raw log: controls/<ref>-cfg-<mode>-<name>-run<N>.log. Adapted from the 129388-final-modeb-classify
# lane's ctlcfg.sh.
set -uo pipefail
ref=$1 config=$2 include=$3 run=$4; shift 4
R=/home/figs/classify-129388-s4nr
case "$ref" in
  cand) wt=$R/cand-a329243b ;;
  prior) wt=$R/prior-16541aa5 ;;
  up) wt=$R/up-5a3e6b1c ;;
  probe) wt=$R/probe ;; # CI product SHA 8fbf29f2
  *) echo "ref must be cand|prior|up|probe" >&2; exit 2 ;;
esac
[[ -e "$wt/node_modules" ]] || { echo "no node_modules at $wt; run ctl.sh there first" >&2; exit 2; }
iso=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
mode=cfg-node26121
for kv in "$@"; do mode="$mode+${kv%%=*}"; done
runwt=$wt
if [[ -n "${CTL_ROOT_LEN:-}" ]]; then
  lrbase=$R/lr/ci-batch-work-$ref- lrtail=/shard-1-x
  pad=$(( CTL_ROOT_LEN - ${#lrbase} - ${#lrtail} ))
  ((pad > 0)) || { echo "CTL_ROOT_LEN too short" >&2; exit 2; }
  runwt=$lrbase$(printf "%0${pad}d" 0)$lrtail
fi
wrap=("$iso" "$runwt")
if [[ -n "${CTL_ROOT_LEN:-}" ]]; then wrap=("$R/tools/long-root.sh" "$wt" "$runwt" "${wrap[@]}"); mode="$mode+rootlen$CTL_ROOT_LEN"; fi
name=$(basename "$config" .config.ts); name=${name#vitest.}-$(basename "$include" .include.json)
log="$R/controls/${ref}-${mode}-${name}-run${run}.log"
# CTL_DROP_CACHE=HASH removes node_modules/.vite/vitest/HASH (a Vitest results cache this lane's own
# replays created; never present in the donors) first, so every repeat starts from run 1's no-cache
# file order instead of "failed files first". The header records it.
dropped="<none>"
if [[ -n "${CTL_DROP_CACHE:-}" ]]; then
  [[ "$CTL_DROP_CACHE" =~ ^[0-9a-f]{40}$ ]] || { echo "CTL_DROP_CACHE must be a 40-hex cache dir" >&2; exit 2; }
  if [[ -d "$wt/node_modules/.vite/vitest/$CTL_DROP_CACHE" ]]; then rm -rf "$wt/node_modules/.vite/vitest/$CTL_DROP_CACHE"; dropped=$CTL_DROP_CACHE; fi
fi
[[ ! -e "$log" ]] || { echo "refusing to overwrite $log" >&2; exit 2; }
scratch=$(mktemp -d /tmp/oc-s4nr-XXXXXX)
chmod 0700 "$scratch"
mkdir -m 0700 "$scratch/home" "$scratch/tmp"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ctlcfg ref=$ref sha=$sha config=$config include=$include run=$run mode=$mode start=$start"
  echo "# runwt=$runwt (${#runwt} chars) include-sha256=$(sha256sum "$include" | cut -c1-16) files=$(grep -c '"' "$include")"
  echo "# dropped-vitest-cache=$dropped"
  echo "# env: PATH=$node26:\$PATH OPENCLAW_VITEST_RUNTIME=node HOME=$scratch/home TMPDIR=$scratch/tmp umask=0022 $* (timeout ${CTL_TIMEOUT:-3300}s)"
  (umask 0022 && timeout --kill-after=30 "${CTL_TIMEOUT:-3300}" "${wrap[@]}" env -u FORCE_COLOR \
    OPENCLAW_VITEST_INCLUDE_FILE="$include" PATH="$node26:$PATH" OPENCLAW_VITEST_RUNTIME=node \
    HOME="$scratch/home" TMPDIR="$scratch/tmp" "$@" \
    node scripts/run-vitest.mjs run --config "$config" --maxWorkers=1)
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
counts=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aE '^\s+(Test Files|Tests)\s' | tail -n2 | tr -s ' ' | paste -sd ';')
failing=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aE '^ +× ' | head -5 | tr -s ' ' | paste -sd '|')
secs=$(( $(date +%s) - t0 ))
dirty=$(git -C "$wt" status --porcelain | wc -l)
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\n' "$start" "$ref" "${sha:0:12}" "$mode" "$config@$(basename "$include")" "$run" "$rc" "$secs" \
  "${counts:-NO-COUNTS}${failing:+ FAILING: $failing}" "$(basename "$log")" >>"$R/controls/summary.tsv"
rm -rf "$scratch"
printf '%s %s run%s rc=%s %ss %s%s dirty=%s\n' "$ref" "$config" "$run" "$rc" "$secs" "${counts:-NO-COUNTS}" "${failing:+ FAILING: $failing}" "$dirty"
