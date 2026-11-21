#!/usr/bin/env bash
# mask-profile-d.sh CMD...: run CMD with an empty tmpfs over /etc/profile.d (private mount
# namespace), back as the calling uid. Reproduces the ARC runner image, whose /etc/profile.d
# holds no PATH export (memory modeb-arc-env-reds).
set -euo pipefail
uid=$(id -u); gid=$(id -g)
exec unshare --user --map-root-user --mount --propagation private bash -c '
  set -e; uid=$1; gid=$2; shift 2
  mount -t tmpfs -o mode=0755 tmpfs /etc/profile.d
  exec unshare --user --map-user="$uid" --map-group="$gid" -- "$@"
' mask "$uid" "$gid" "$@"
