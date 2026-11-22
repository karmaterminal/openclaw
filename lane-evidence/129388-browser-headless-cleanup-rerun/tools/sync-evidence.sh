#!/usr/bin/env bash
# sync-evidence.sh: copy this lane's control logs into lane-evidence and index the CI receipts it
# read. The CI logs stay on the seat (openclaw-bootstrap is private); only paths, arch and sha256 go
# into ci/receipts.tsv.
set -euo pipefail
R=/home/figs/classify-129388-bhc
E=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-129388-browser-headless-cleanup-rerun/lane-evidence/129388-browser-headless-cleanup-rerun
S=/home/figs/.local/state/frond-scribe/receipts
umask 022
mkdir -p "$E/controls" "$E/ci"
cp -p "$R"/controls/* "$E/controls/"
printf '*.log -text\n' >"$E/.gitattributes"
{
  printf 'run_id\tproduct_sha\tworkflow_sha\trunner_arch\tdarwin_cache_case\tfile_sha256\tpath_under_receipts\n'
  f=openclaw-129388-a329243b-modeb/joblogs/137166030126.log
  printf '45008617882\ta329243bd1aa4e8677517a5eaf4a67aa30ca8647\t%s\t%s\t%s\t%s\t%s\n' \
    "$(grep -aom1 '[0-9a-f]\{40\}:refs/remotes/origin/main' "$S/$f" | cut -c1-40)" \
    "$(grep -aom1 'arch=[a-z0-9_]*' "$S/$f" | cut -d= -f2)" \
    "$(grep -aqE 'FAIL .*darwin cache shell only when ownsProfile=true' "$S/$f" && echo red || echo green)" \
    "$(sha256sum "$S/$f" | cut -d' ' -f1)" "$f"
  for d in openclaw-129388-stage4-absorb/aggregate openclaw-129388-new-reds-reruns/dl-meta/openclaw-local-ci-aggregate-16541aa5a8ee openclaw-129388-candidate-modeb-classify/agg; do
    b=$(cd "$S/$d" && ls -d openclaw-local-ci-batch-hosted-batch-023-*)
    rr="$S/$d/$b/routing-receipt.json" f="$d/$b/supplemental-extension-browser/ci-output.log"
    node -e 'const r=require(process.argv[1]);process.stdout.write([r.execution.run_id,r.target.sha,r.workflow.sha,r.worker.runner_arch].join("\t"))' "$rr"
    line=$(grep -aE 'darwin cache shell only when ownsProfile=true' "$S/$f" | head -1)
    printf '\t%s\t%s\t%s\n' "$(case "$line" in *✓*) echo green ;; *×*) echo red ;; *) echo '?' ;; esac)" \
      "$(sha256sum "$S/$f" | cut -d' ' -f1)" "$f"
  done
} >"$E/ci/receipts.tsv"
echo "synced to $E"
