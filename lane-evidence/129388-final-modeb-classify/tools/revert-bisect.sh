#!/usr/bin/env bash
# revert-bisect.sh LISTFILE TAG: in the scratch probe worktree at the candidate, restore every path in
# LISTFILE (fork-modified files only) to upstream 1129d4c0 bytes, run the visitor-access pair
# (one earlier it.each case, then the failing test) through ctl-t.sh, then restore HEAD and prove
# the probe clean. The list is copied beside the log as controls/revert-<TAG>.list.
set -uo pipefail
list=$1 tag=$2
P=/home/figs/classify-129388/probe-final
here=$(cd "$(dirname "$0")" && pwd)
cand=93a1e356c7aabf0d868560e46790b07449813840 base=1129d4c0716c7dcc6fba86753ec214584ec8ebd1
git -C "$P" checkout -q --detach "$cand" || exit 1
[[ -z "$(git -C "$P" status --porcelain --untracked-files=no)" ]] || { echo "probe dirty" >&2; exit 1; }
cp "$list" "$here/../controls/revert-$tag.list"
xargs -a "$list" git -C "$P" checkout "$base" -- || { git -C "$P" checkout -q HEAD -- .; exit 1; }
echo "reverted $(git -C "$P" diff --cached --name-only | wc -l) files"
"$here/ctl-t.sh" probe test/vitest/vitest.gateway.config.ts src/gateway/server-methods/agent.visitor-access.test.ts "revert-$tag" \
  'Visitor Access: admin$|reopens existing profiles and grants'
git -C "$P" reset -q && git -C "$P" checkout -q HEAD -- .
[[ -z "$(git -C "$P" status --porcelain --untracked-files=no)" ]] && echo "probe restored" || echo "PROBE NOT CLEAN" >&2
