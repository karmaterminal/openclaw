#!/usr/bin/env bash
# CAND2 backward-compat rehearsal (karmaterminal/openclaw#1415): run one checkout's built
# `node openclaw.mjs config validate` exactly as the deploy's verify gate does (openclaw-bootstrap
# deploy/openclaw_from_karmaterminal_fork/deploy.sh: "verify: openclaw config validate failed
# against staged build; live gateway was NOT stopped"), plus `--json` for the issue list, on every
# config variant. The checkout's dist must already be built from its product tree (build-info
# commit checked). Each variant gets a fresh isolated HOME / OPENCLAW_STATE_DIR; nothing touches a
# seat's ~/.openclaw.
#
#   config-cli.sh <checkout> <label> <expected-product-sha> <out-dir>
#
# Writes <out-dir>/<label>/<variant>.json (--json stdout), .stderr, .exit and .plain.exit, and prints
# one line per variant.
set -euo pipefail
umask 0022
checkout=$1
label=$2
expected=$3
out=$4/$label
variants=$(cd "$(dirname "$0")/config-variants" && pwd)
mkdir -p "$out"
sha=$(git -C "$checkout" rev-parse HEAD)
dist_commit=$(node -e 'process.stdout.write(require(process.argv[1]).commit ?? "")' "$checkout/dist/build-info.json")
# The built dist must be the expected product tree (the lane adds only rehearsals/ on top of CAND2).
git -C "$checkout" merge-base --is-ancestor "$expected" "$dist_commit"
git -C "$checkout" diff --quiet "$expected" "$dist_commit" -- . ':(exclude)rehearsals'
echo "checkout=$checkout HEAD=$sha dist_commit=$dist_commit product=$expected" >"$out/HEAD"
for variant_path in "$variants"/*.json; do
  variant=$(basename "$variant_path" .json)
  home=$(mktemp -d "$out/home-$variant-XXXXXX")
  cp "$variant_path" "$home/openclaw.json"
  run() {
    (
      cd "$home"
      env -u FORCE_COLOR -u OPENCLAW_PROFILE \
        HOME="$home" USERPROFILE="$home" OPENCLAW_HOME="$home" \
        OPENCLAW_STATE_DIR="$home/state" OPENCLAW_CONFIG_PATH="$home/openclaw.json" \
        OPENCLAW_NO_RESPAWN=1 OPENCLAW_HIDE_BANNER=1 NO_COLOR=1 \
        timeout 300 node "$checkout/openclaw.mjs" config validate "$@"
    )
  }
  set +e
  run >"$out/$variant.plain.out" 2>&1
  plain=$?
  run --json >"$out/$variant.json" 2>"$out/$variant.stderr"
  code=$?
  set -e
  echo "$code" >"$out/$variant.exit"
  echo "$plain" >"$out/$variant.plain.exit"
  # The config file must be byte-identical after validation, and validation must create no state.
  if cmp -s "$variant_path" "$home/openclaw.json"; then unchanged=yes; else unchanged=NO; fi
  if [ -e "$home/state" ]; then state=created; else state=none; fi
  summary=$(node -e '
    const fs = require("fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const start = text.indexOf("{");
    try {
      const out = JSON.parse(text.slice(start));
      const issues = (out.issues ?? []).map((i) => `${i.path}: ${i.message}`).join(" | ");
      process.stdout.write(`valid=${out.valid} ${issues}`);
    } catch {
      process.stdout.write("unparsed-output");
    }' "$out/$variant.json")
  printf '%s\t%s\texit=%s\tplain_exit=%s\tconfig_unchanged=%s\tstate=%s\t%s\n' "$label" "$variant" "$code" "$plain" "$unchanged" "$state" "$summary"
done
