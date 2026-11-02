#!/usr/bin/env bash
# CAND2 backward-compat rehearsal (karmaterminal/openclaw#1415): the rollback deploy's
# `--migrate-config` step, as openclaw-bootstrap deploy/lib/runtime-config-migration.sh runs it
# (bootstrap main 293d9f24): a private copy of the live config, the TARGET build's
# `doctor --fix --non-interactive --yes` against it with isolated state, then the target's
# `config validate`. Here the target is an old build (built dist in <checkout>).
#
# Differences from the seat, all toward host isolation: HOME is a temp dir, the user bus variables
# are unset and a failing `systemctl`/`loginctl` leads PATH, so Doctor cannot reach this host's
# systemd user manager; gateway URL/credential variables are unset and OPENCLAW_GATEWAY_PORT points
# at an unused port, so no probe can reach a live Gateway on this host's default port.
#
#   doctor-migrate.sh <checkout> <label> <out-dir>
set -euo pipefail
umask 0022
checkout=$1
label=$2
out=$3/$label
variants=$(cd "$(dirname "$0")/config-variants" && pwd)
mkdir -p "$out"
echo "checkout=$checkout HEAD=$(git -C "$checkout" rev-parse HEAD)" >"$out/HEAD"
fence=$(mktemp -d "$out/fence-XXXXXX")
for tool in systemctl loginctl; do
  printf '#!/bin/sh\necho "%s fenced by the CAND2 rehearsal" >&2\nexit 1\n' "$tool" >"$fence/$tool"
  chmod 755 "$fence/$tool"
done
for variant in a-clean b-both b1-process-only b2-groupchat-only b3-agent-groupchat-only b4-disabled-values; do
  home=$(mktemp -d "$out/home-$variant-XXXXXX")
  staged="$home/openclaw.json.deploy-migrated"
  state="$home/config-migration-state"
  mkdir -m 700 "$state"
  install -m 600 "$variants/$variant.json" "$staged"
  run() {
    env -u FORCE_COLOR -u OPENCLAW_PROFILE -u DBUS_SESSION_BUS_ADDRESS -u XDG_RUNTIME_DIR \
      -u OPENCLAW_GATEWAY_URL -u OPENCLAW_GATEWAY_TOKEN -u OPENCLAW_GATEWAY_PASSWORD \
      OPENCLAW_GATEWAY_PORT="${CAND2_COMPAT_GATEWAY_PORT:-59461}" \
      PATH="$fence:$PATH" HOME="$home" USERPROFILE="$home" \
      OPENCLAW_CONFIG_PATH="$staged" OPENCLAW_STATE_DIR="$state" NO_COLOR=1 \
      timeout 600 node "$checkout/openclaw.mjs" "$@"
  }
  set +e
  (cd "$home" && run doctor --fix --non-interactive --yes) >"$out/$variant.doctor.log" 2>&1
  doctor=$?
  (cd "$home" && run config validate --json) >"$out/$variant.validate.json" 2>"$out/$variant.validate.stderr"
  validate=$?
  set -e
  cp "$staged" "$out/$variant.after.json"
  # Key paths whose presence changed (values are synthetic, but compare paths like the deploy audit).
  removed=$(node -e '
    const fs = require("fs");
    const json5 = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
    const paths = (v, prefix = "") => v && typeof v === "object" && !Array.isArray(v)
      ? Object.entries(v).flatMap(([k, c]) => [prefix + k, ...paths(c, prefix + k + ".")]) : [];
    const before = new Set(paths(json5(process.argv[1])));
    const afterValue = json5(process.argv[2]);
    if (!afterValue) { process.stdout.write("after=unparsed(json5?)"); process.exit(0); }
    const after = new Set(paths(afterValue));
    const gone = [...before].filter((p) => !after.has(p));
    const added = [...after].filter((p) => !before.has(p));
    process.stdout.write(`removed=[${gone.join(",")}] added=[${added.join(",")}]`);
  ' "$variants/$variant.json" "$staged")
  printf '%s\t%s\tdoctor_exit=%s\tvalidate_exit=%s\t%s\n' "$label" "$variant" "$doctor" "$validate" "$removed"
done
