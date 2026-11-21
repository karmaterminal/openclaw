#!/usr/bin/env bash
# Run the extension-database-workers shard at one tree through CI's own shard runner.
# usage: run-shard.sh <tree> <outdir> <label> [group-json override, smoke only]
# Launch detached: setsid nohup run-shard.sh ... > <outdir>/launcher.log 2>&1 < /dev/null &
# Writes <outdir>/run.log (raw), <outdir>/rc.txt (exit code), <outdir>/disk.log, <outdir>/times.txt.
set -u
tree=$1; out=$2; label=$3
umask 022
NODE_BIN=$HOME/.nvm/versions/node/v26.12.1/bin
ISO=/home/figs/flesh_beast_best_beast/source/frond-scribe/skills/pr-drift-cure-gates/run-isolated-from-live-gateways.sh
GROUP=${4:-'[{"configs":["test/vitest/vitest.extension-database-workers.config.ts"],"includePatterns":null,"shard_name":"extension-database-workers","env":null}]'}
DISK_STOP_PCT=90.0

mkdir -p "$out"
R="$out/runtime"
rm -rf "$R"
mkdir -p "$R/home" "$R/xdg/cache" "$R/xdg/config" "$R/xdg/data" "$R/xdg/state" "$R/tmp/xdg-runtime" "$R/config" "$R/gh" "$R/openclaw-tmp"
chmod 0700 "$R" "$R/tmp" "$R/tmp/xdg-runtime" "$R/openclaw-tmp"
: > "$R/gh/output"; : > "$R/gh/env"; : > "$R/gh/step-summary"

head=$(git -C "$tree" rev-parse HEAD)
disk_pct() { df -B1 / | awk 'NR==2 { printf "%.3f", $3*100/($3+$4) }'; }
{
  echo "label=$label"
  echo "tree=$tree"
  echo "head=$head"
  echo "status_before=$(git -C "$tree" status --porcelain | wc -l) lines"
  echo "node=$("$NODE_BIN/node" -v)"
  echo "host=$(hostname) arch=$(uname -m) nproc=$(nproc)"
  echo "start_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "start_epoch=$(date -u +%s)"
  echo "disk_start_pct=$(disk_pct)"
} > "$out/times.txt"
git -C "$tree" status --porcelain --ignored > "$out/tree-status-before.txt" 2>&1

# Child env built from scratch: CI's shard env (bootstrap 105e83ab openclaw-local-ci-run-batch.sh +
# openclaw-local-ci-runner.sh configure_matrix_shard_resources), pnpm exec's npm_* vars, and no seat secrets.
CHILD_ENV=(
  "PATH=$NODE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  "HOME=$R/home" "USER=$(id -un)" "LOGNAME=$(id -un)" "SHELL=/bin/bash"
  "OPENCLAW_HOME=$R/home" "USERPROFILE=$R/home"
  "XDG_CACHE_HOME=$R/xdg/cache" "XDG_CONFIG_HOME=$R/xdg/config" "XDG_DATA_HOME=$R/xdg/data"
  "XDG_STATE_HOME=$R/xdg/state" "XDG_RUNTIME_DIR=$R/tmp/xdg-runtime"
  "OPENCLAW_CONFIG_PATH=$R/config/openclaw.json"
  "TMPDIR=$R/tmp" "TMP=$R/tmp" "TEMP=$R/tmp" "RUNNER_TEMP=$R/tmp"
  "OPENCLAW_TMP_DIR=$R/openclaw-tmp"
  "GITHUB_WORKSPACE=$tree"
  "CI=true" "GITHUB_ACTIONS=true"
  "RUNNER_ENVIRONMENT=self-hosted" "RUNNER_OS=Linux" "RUNNER_ARCH=ARM64"
  "GITHUB_OUTPUT=$R/gh/output" "GITHUB_ENV=$R/gh/env" "GITHUB_STEP_SUMMARY=$R/gh/step-summary"
  "LANG=C.UTF-8" "LC_ALL=C" "TZ=UTC"
  "NODE_OPTIONS=--max-old-space-size=8192"
  "OPENCLAW_VITEST_MAX_WORKERS=1" "OPENCLAW_TEST_PROJECTS_PARALLEL=1"
  "OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=300000" "OPENCLAW_VITEST_NO_OUTPUT_RETRY=1"
  "OPENCLAW_VITEST_RUNTIME=node"
  "OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE=1"
  "OPENCLAW_NODE_TEST_GROUPS_JSON=$GROUP"
  "OPENCLAW_CI_MODE=test-shard" "OPENCLAW_CI_REPO=karmaterminal/openclaw"
  "OPENCLAW_CI_REF=$head" "OPENCLAW_CI_SHA=$head"
  "OPENCLAW_CI_SHARD_KIND=supplemental" "OPENCLAW_CI_SHARD_GROUP=supplemental"
  "OPENCLAW_LOCAL_CI_PREINSTALLED_DEPS=1"
  "npm_command=exec"
  "npm_config_user_agent=pnpm/12.15.0 npm/? node/? linux arm64"
  "npm_execpath=$HOME/.cache/node/corepack/v1/pnpm/12.15.0/pnpm-native"
  "npm_node_execpath=$NODE_BIN/node" "NODE=$NODE_BIN/node"
  "INIT_CWD=$tree" "PNPM_PACKAGE_NAME=openclaw"
  "pnpm_config_verify_deps_before_run=false" "npm_config_verify_deps_before_run=false"
  "COREPACK_ENABLE_AUTO_PIN=0" "COREPACK_ENABLE_DOWNLOAD_PROMPT=1"
  "COREPACK_ROOT=$NODE_BIN/../lib/node_modules/corepack"
)
printf '%s\n' "${CHILD_ENV[@]}" > "$out/child-env.txt"

# CI's runner clears these before the shard (restore_upstream_plugin_discovery).
rm -rf "$tree/dist/extensions" "$tree/dist-runtime/extensions"

"$ISO" "$tree" env -i "${CHILD_ENV[@]}" \
  "$NODE_BIN/node" --import ./scripts/tsx.mjs scripts/ci-run-node-test-shard.mts \
  > "$out/run.log" 2>&1 < /dev/null &
wrap_pid=$!
echo "wrap_pid=$wrap_pid" >> "$out/times.txt"

# Disk watchdog: record usage every 60 s; at >= DISK_STOP_PCT kill the run's pid namespace.
(
  while kill -0 "$wrap_pid" 2>/dev/null; do
    pct=$(disk_pct)
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) used_pct=$pct" >> "$out/disk.log"
    if awk -v p="$pct" -v s="$DISK_STOP_PCT" 'BEGIN { exit !(p >= s) }'; then
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) STOP: / at ${pct}% >= ${DISK_STOP_PCT}%" | tee -a "$out/disk.log" > "$out/STOP-DISK"
      for c in $(pgrep -P "$wrap_pid"); do kill -KILL "$c" 2>/dev/null; done
      break
    fi
    sleep 60
  done
) &
watch_pid=$!

wait "$wrap_pid"
rc=$?
kill "$watch_pid" 2>/dev/null
{
  echo "end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "end_epoch=$(date -u +%s)"
  echo "disk_end_pct=$(disk_pct)"
  echo "rc=$rc"
} >> "$out/times.txt"
git -C "$tree" status --porcelain --ignored > "$out/tree-status-after.txt" 2>&1
echo "$rc" > "$out/rc.txt"
