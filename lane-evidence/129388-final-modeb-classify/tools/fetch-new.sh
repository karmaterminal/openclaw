#!/usr/bin/env bash
# fetch-new.sh: download every openclaw-local-ci-batch-* artifact of run 44871298969 not already
# under the download dir (one artifact listing call, then one download per new artifact; read-only
# token gh-scribe, memory gh-poll-rate-budget), then rebuild the failset and first-error digest.
set -uo pipefail
run=44871298969 repo=karmaterminal/openclaw-bootstrap
D=/home/figs/classify-129388/dl-$run/batches
here=$(cd "$(dirname "$0")" && pwd)
export GH_CONFIG_DIR=$HOME/.config/gh-scribe
names=$(gh api "repos/$repo/actions/runs/$run/artifacts?per_page=100" --jq '.artifacts[].name') || exit 1
new=0
for n in $names; do
  case $n in openclaw-local-ci-batch-*) ;; *) continue ;; esac
  [[ -d $D/$n ]] && continue
  gh run download "$run" --repo "$repo" --name "$n" --dir "$D/$n" >/dev/null 2>&1 && new=$((new + 1)) || echo "download failed: $n" >&2
done
echo "new artifacts: $new (total batch dirs: $(ls "$D" | wc -l))"
python3 -I "$here/failset.py" "$D" /home/figs/classify-129388/fs-live
python3 -I "$here/firsterr.py" "$D" /home/figs/classify-129388/fe-live.md 24
