#!/usr/bin/env bash
# sync-evidence.sh: copy this lane's receipts (controls, tools, lists, CI index) into the lane
# worktree's lane-evidence dir. Raw bootstrap artifacts stay on the seat (openclaw-bootstrap is
# private); only their IDs, names and sha256 are indexed here.
set -euo pipefail
R=/home/figs/classify-129388-s4nr
E=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-129388-stage4-new-reds-reruns/lane-evidence/129388-stage4-new-reds-reruns
umask 022
mkdir -p "$E/controls" "$E/tools" "$E/lists" "$E/ci"
cp -p "$R"/controls/* "$E/controls/"
cp -p "$R"/tools/*.sh "$E/tools/"
cp -p "$R"/lists/* "$E/lists/"
printf '*.log -text\n' >"$E/.gitattributes"
{
  printf 'artifact_id\tname\tsize_bytes\texpired\n'
  grep -E 'local-batch-058|local-batch-047|hosted-batch-012|hosted-batch-009' "$R/dl-44990430565/artifacts.tsv"
} >"$E/ci/artifacts-used.tsv"
(cd "$R/dl-44990430565/batches" && find . -name 'gate-test-shard-*.log' -o -name 'summary.json' -o -name 'routing-receipt.json' | sort | xargs sha256sum) \
  >"$E/ci/artifact-files.sha256"
echo "synced to $E"
