#!/usr/bin/env bash
# Materialize an immutable CI target plus the LOC comparison ref.
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "usage: $0 <target-repository-url> <target-sha> <workdir> [--with-merge-base-history]" >&2
  exit 64
fi

repository_url="$1"
target_sha="$2"
workdir="$3"
history_mode="${4:-}"

if [ -n "${history_mode}" ] && [ "${history_mode}" != "--with-merge-base-history" ]; then
  echo "unknown checkout mode: ${history_mode}" >&2
  exit 64
fi

# GitHub resets large packs mid-stream over HTTP/2 (curl 92 / "early EOF" / promisor fetch failed): the
# static job's blobless --with-merge-base-history fetch died at clone in Mode-B 42670668166 and again in
# 42761186980 (2026-11-10). Retry, forcing HTTP/1.1 from the second attempt (the deploy-gateway.yml
# pattern), and once a fallback was needed, pin HTTP/1.1 in the work repo so the checkout's lazy blob
# fetches from the promisor use it too.
CHECKOUT_FETCH_ATTEMPTS="${OPENCLAW_CI_CHECKOUT_FETCH_ATTEMPTS:-3}"
CHECKOUT_RETRY_SLEEP_SECONDS="${OPENCLAW_CI_CHECKOUT_RETRY_SLEEP_SECONDS:-10}"

fetch_target() {
  local attempt
  for attempt in $(seq 1 "${CHECKOUT_FETCH_ATTEMPTS}"); do
    if [ "${attempt}" -gt 1 ]; then
      git -C "${workdir}" config http.version HTTP/1.1
    fi
    if git -C "${workdir}" fetch --no-tags "$@" origin \
      "+${target_sha}:refs/remotes/origin/ci-target" \
      "+refs/heads/main:refs/remotes/origin/main"; then
      return 0
    fi
    echo "::warning::target fetch failed (attempt ${attempt}/${CHECKOUT_FETCH_ATTEMPTS}); retrying over HTTP/1.1" >&2
    sleep $((attempt * CHECKOUT_RETRY_SLEEP_SECONDS))
  done
  return 1
}

git -C "${workdir}" init
git -C "${workdir}" remote add origin "${repository_url}"
if [ "${history_mode}" = "--with-merge-base-history" ]; then
  fetch_target --filter=blob:none
else
  fetch_target --depth 1
fi
if ! git -C "${workdir}" checkout --force --detach refs/remotes/origin/ci-target; then
  # A blobless checkout fetches blobs from the promisor; a reset there fails the checkout, not the fetch.
  echo "::warning::checkout failed (promisor fetch?); retrying once over HTTP/1.1" >&2
  git -C "${workdir}" config http.version HTTP/1.1
  sleep "${CHECKOUT_RETRY_SLEEP_SECONDS}"
  git -C "${workdir}" checkout --force --detach refs/remotes/origin/ci-target
fi

if [ "${history_mode}" = "--with-merge-base-history" ]; then
  git -C "${workdir}" merge-base HEAD refs/remotes/origin/main >/dev/null
fi
