#!/usr/bin/env bash
# small-shm.sh SIZE CMD...: run CMD with a fresh tmpfs of SIZE (e.g. 64m, the ARC pod's /dev/shm)
# over /dev/shm, in a private user and mount namespace, back as the calling uid. Nothing on the
# host's /dev/shm changes.
set -euo pipefail
size=$1; shift
uid=$(id -u); gid=$(id -g)
exec unshare --user --map-root-user --mount --propagation private bash -c '
  set -e; uid=$1; gid=$2; size=$3; shift 3
  mount -t tmpfs -o "size=$size,mode=1777" tmpfs /dev/shm
  exec unshare --user --map-user="$uid" --map-group="$gid" -- "$@"
' small-shm "$uid" "$gid" "$size" "$@"
