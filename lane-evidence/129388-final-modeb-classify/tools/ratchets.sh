#!/usr/bin/env bash
# ratchets.sh REF BASE [SCRIPT]: run CI's baseline-ratchets row command at REF (base|cand) against
# BASE with --no-merge-base: `node --import ./scripts/tsx.mjs scripts/ci-baseline-ratchets.mts`, or
# one ratchet SCRIPT (e.g. scripts/check-test-lines-ratchet.mts). umask 0022, FORCE_COLOR unset,
# Node v26.12.1, a 3600 s ceiling (CI's row budget is 1200 s; the wall time is recorded, not
# enforced). Raw log: static/ratchets-<ref>-vs-<base8>[-<script>].log; one row to
# static/ratchets-summary.tsv.
set -uo pipefail
ref=$1 base=$2 script=${3:-scripts/ci-baseline-ratchets.mts}
case "$ref" in
  base) wt=/home/figs/classify-129388/base-1129d4c0 ;;
  cand) wt=/home/figs/classify-129388/cand-93a1e356 ;;
  *) echo "ref must be base|cand" >&2; exit 2 ;;
esac
node26=/home/figs/.nvm/versions/node/v26.12.1/bin
# package.json runs the database-worker ratchet with a 4 GiB heap; match it.
heap=(); [[ "$script" == *database-worker* ]] && heap=(--max-old-space-size=4096)
here=$(cd "$(dirname "$0")/.." && pwd)
name=$(basename "$script" .mts); name=${name#check-}
full=$(git -C "$wt" rev-parse "$base")
log="$here/static/ratchets-$ref-vs-${full:0:8}-$name.log"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# ratchets ref=$ref sha=$sha base=$full script=$script start=$start host=$(hostname) nproc=$(nproc)"
  (cd "$wt" && umask 0022 && env -u FORCE_COLOR PATH="$node26:$PATH" timeout --kill-after=30 3600 \
    node "${heap[@]}" --import ./scripts/tsx.mjs "$script" --base "$full" --no-merge-base)
  echo "# exit=$? wall=$(( $(date +%s) - t0 ))s"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+) .*/\1/p' "$log" | tail -n1)
secs=$(( $(date +%s) - t0 ))
verdicts=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | sed -n '/\[baseline-ratchets\] summary/,$p' | grep -E '^\s+[0-9.]+m?s\s' | tr -s ' ' | paste -sd ';')
printf '%s\t%s\t%s\t%s\t%s\t%s\t%ss\t%s\n' "$start" "$ref" "${sha:0:12}" "${full:0:12}" "$script" "$rc" "$secs" "${verdicts:-see-log}" >>"$here/static/ratchets-summary.tsv"
echo "$ref vs ${full:0:8} $name rc=$rc ${secs}s ${verdicts:-see-log}"
