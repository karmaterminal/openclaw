#!/usr/bin/env bash
# long-root.sh WT LONGPATH CMD...: run CMD with WT bind-mounted at LONGPATH, in a private user and
# mount namespace, back as the calling uid. LONGPATH must sit under /home/figs/classify-129388-s4nr/lr,
# an empty directory that gets a private tmpfs, so nothing is created on the host. Reproduces the
# Mode-B shard checkout path length (/home/runner/_work/_temp/ci-batch-work-<run>-1-hosted-batch-NNN/
# shard-N-<shard>, 94 characters) without moving the worktree.
set -euo pipefail
wt=$1 lp=$2; shift 2
base=/home/figs/classify-129388-s4nr/lr
[[ "$lp" == "$base"/* ]] || { echo "LONGPATH must be under $base" >&2; exit 2; }
mkdir -p "$base"
uid=$(id -u); gid=$(id -g)
exec unshare --user --map-root-user --mount --propagation private bash -c '
  set -e; uid=$1; gid=$2; base=$3; wt=$4; lp=$5; shift 5
  umask 022
  mount -t tmpfs -o mode=0700 tmpfs "$base"
  mkdir -p "$lp"
  mount --bind "$wt" "$lp"
  exec unshare --user --map-user="$uid" --map-group="$gid" -- "$@"
' long-root "$uid" "$gid" "$base" "$wt" "$lp" "$@"
