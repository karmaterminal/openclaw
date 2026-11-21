#!/usr/bin/env bash
# knip.sh REF SCAN: one knip 6.40.0 scan at REF (base|cand), run straight from ronan's cached knip
# package with Node v26.12.1 (no pnpm: the workorder forbids it in worktrees). The arguments are the
# repository's own: deadcode:full's two commands (package.json) and check-deadcode-exports.mts's
# KNIP_SCANS plus KNIP_COMMON_ARGS. Raw log: static/knip-<ref>-<scan>.log; one row to
# static/knip-summary.tsv.
set -uo pipefail
ref=$1 scan=$2
case "$ref" in
  base) wt=/home/figs/classify-129388/base-1129d4c0 ;;
  cand) wt=/home/figs/classify-129388/cand-93a1e356 ;;
  *) echo "ref must be base|cand" >&2; exit 2 ;;
esac
knip=/home/figs/.cache/pnpm/dlx/9f98e7f30b7f94f0e1c2677bcc90d9c2/mvl7dxvs-1df7t/node_modules/knip/bin/knip.js
node=/home/figs/.nvm/versions/node/v26.12.1/bin/node
common=(--no-progress --reporter compact --include exports,nsExports,types,nsTypes,enumMembers,namespaceMembers --no-config-hints)
case "$scan" in
  dep-prod) args=(--config config/knip.config.ts --production --no-progress --reporter compact --no-config-hints --exclude duplicates) ;;
  dep-exports) args=(--config config/knip.all-exports.config.ts --no-progress --reporter compact --no-config-hints --exports --exclude duplicates) ;;
  exp-prod) args=(--config config/knip.config.ts --production "${common[@]}") ;;
  exp-full) args=(--config config/knip.all-exports.config.ts "${common[@]}") ;;
  exp-script) args=(--config config/knip.scripts-exports.config.ts --include-entry-exports "${common[@]}") ;;
  *) echo "scan must be dep-prod|dep-exports|exp-prod|exp-full|exp-script" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd)
log="$here/static/knip-$ref-$scan.log"
sha=$(git -C "$wt" rev-parse HEAD)
start=$(date -u +%FT%TZ); t0=$(date +%s)
{
  echo "# knip ref=$ref sha=$sha scan=$scan start=$start knip=$("$node" "$knip" --version) node=$("$node" --version)"
  echo "# argv: knip ${args[*]}"
  (cd "$wt" && umask 0022 && env -u FORCE_COLOR timeout --kill-after=10 580 "$node" "$knip" "${args[@]}")
  echo "# exit=$?"
} >"$log" 2>&1
rc=$(sed -nE 's/^# exit=([0-9]+)$/\1/p' "$log" | tail -n1)
findings=$(grep -vE '^#' "$log" | grep -E '^\S.*: ' | paste -sd ';' | cut -c1-600)
secs=$(( $(date +%s) - t0 ))
printf '%s\t%s\t%s\t%s\t%s\t%ss\t%s\n' "$start" "$ref" "${sha:0:12}" "$scan" "$rc" "$secs" "${findings:-no-findings}" >>"$here/static/knip-summary.tsv"
echo "$ref $scan rc=$rc ${secs}s ${findings:-no-findings}"
