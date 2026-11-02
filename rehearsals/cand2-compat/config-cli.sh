#!/usr/bin/env bash
# CAND2 backward-compat rehearsal (karmaterminal/openclaw#1415): run one checkout's real
# `openclaw config validate --json` (the deploy path's config gate) on every config variant.
# Each variant gets a fresh isolated HOME / OPENCLAW_STATE_DIR; nothing touches a seat's ~/.openclaw.
#
#   config-cli.sh <checkout> <label> <out-dir>
#
# Writes <out-dir>/<label>/<variant>.json (stdout), .stderr and .exit, and prints one line per variant.
set -euo pipefail
umask 0022
checkout=$1
label=$2
out=$3/$label
variants=$(cd "$(dirname "$0")/config-variants" && pwd)
mkdir -p "$out"
sha=$(git -C "$checkout" rev-parse HEAD)
echo "checkout=$checkout HEAD=$sha" >"$out/HEAD"
for variant_path in "$variants"/*.json; do
  variant=$(basename "$variant_path" .json)
  home=$(mktemp -d "$out/home-$variant-XXXXXX")
  cp "$variant_path" "$home/openclaw.json"
  set +e
  (
    cd "$checkout"
    env -u FORCE_COLOR -u OPENCLAW_PROFILE \
      HOME="$home" USERPROFILE="$home" OPENCLAW_HOME="$home" \
      OPENCLAW_STATE_DIR="$home/state" OPENCLAW_CONFIG_PATH="$home/openclaw.json" \
      OPENCLAW_NO_RESPAWN=1 OPENCLAW_HIDE_BANNER=1 NO_COLOR=1 \
      timeout 900 pnpm --silent openclaw config validate --json
  ) >"$out/$variant.json" 2>"$out/$variant.stderr"
  code=$?
  set -e
  echo "$code" >"$out/$variant.exit"
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
  printf '%s\t%s\texit=%s\tconfig_unchanged=%s\tstate=%s\t%s\n' "$label" "$variant" "$code" "$unchanged" "$state" "$summary"
done
