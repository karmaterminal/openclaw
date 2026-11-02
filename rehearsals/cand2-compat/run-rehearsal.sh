#!/usr/bin/env bash
# CAND2 backward-compat rehearsal driver (karmaterminal/openclaw#1415). One coherent pass:
#   1. write every persisted surface with CAND2 (this checkout must be 15aa7e9333);
#   2. seal the post-exit fixture bytes;
#   3. read them with CAND2 (same-build control), 22f49a43 and 3d3364dd, each from its own
#      detached worktree with a hardlinked same-lockfile install.
# Each step runs in the foreground through the repository runner, one worker, umask 0022.
#
#   run-rehearsal.sh <root> <old-22f49a43-worktree> <old-3d3364dd-worktree>
set -euo pipefail
umask 0022
root=$1
old_22f49a43=$2
old_3d3364dd=$3
lane=$(cd "$(dirname "$0")/../.." && pwd)
rehearsal=rehearsals/cand2-compat
export CAND2_COMPAT_ROOT=$root

# Kill only orphans this rehearsal registered: recorded pid whose cmdline is the fixture Codex.
reap_rehearsal_orphans() {
  local manifest=$root/fixtures/manifest.json
  [ -f "$manifest" ] || return 0
  node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const codex = m.surfaces?.["codex-registration"];
    if (!codex) process.exit(0);
    const marker = `${codex.bin}/codex`;
    for (const { pid } of Object.values(codex.perReader)) {
      let cmdline = "";
      try { cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8"); } catch { continue; }
      if (cmdline.split("\0").includes(marker)) {
        process.kill(pid, "SIGKILL");
        console.log(`reaped leftover rehearsal orphan ${pid}`);
      }
    }' "$manifest"
}

run_vitest() {
  local checkout=$1 phase=$2 reader=${3:-}
  (
    cd "$checkout"
    env -u FORCE_COLOR CAND2_COMPAT_PHASE="$phase" CAND2_COMPAT_READER="$reader" \
      timeout 1200 node scripts/run-vitest.mjs run \
      --config "$rehearsal/vitest.rehearsal.config.ts" --maxWorkers=1
  )
}

reap_rehearsal_orphans
rm -rf "$root/fixtures" "$root/read" "$root/results"
mkdir -p "$root/logs"

echo "== write @ $(git -C "$lane" rev-parse HEAD)"
run_vitest "$lane" write >"$root/logs/write.log" 2>&1 || { tail -60 "$root/logs/write.log"; exit 1; }
node "$lane/$rehearsal/seal-fixtures.mjs"

status=0
for pair in "cand2-15aa7e93:$lane" "old-22f49a43:$old_22f49a43" "old-3d3364dd:$old_3d3364dd"; do
  reader=${pair%%:*}
  checkout=${pair#*:}
  if [ "$checkout" != "$lane" ]; then
    rm -rf "${checkout:?}/$rehearsal"
    mkdir -p "$checkout/rehearsals"
    cp -R "$lane/$rehearsal" "$checkout/rehearsals/"
  fi
  echo "== read $reader @ $(git -C "$checkout" rev-parse HEAD)"
  if run_vitest "$checkout" read "$reader" >"$root/logs/read-$reader.log" 2>&1; then
    echo "   pass"
  else
    status=1
    echo "   FAIL (see $root/logs/read-$reader.log)"
  fi
  grep -E '^ +(✓|×|↓)|Tests +[0-9]' "$root/logs/read-$reader.log" | sed 's/^/   /' || true
done

reap_rehearsal_orphans
exit $status
