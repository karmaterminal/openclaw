#!/usr/bin/env bash
# iso-keep-bus.sh WORKDIR CMD...: frond-scribe's run-isolated-from-live-gateways.sh, minus the hiding
# of the systemd user bus (/run/systemd, /run/user/$uid, /run/dbus stay visible). /tmp/openclaw still
# gets a private tmpfs and user unit definitions stay hidden. Used only for tests whose systemctl
# calls are mocked and whose one real service-manager contact is the read-only busctl
# Manager.Version probe (update-command-retained-restart).
set -euo pipefail
wd=$1; shift
uid=$(id -u); gid=$(id -g)
exec unshare --user --map-root-user --mount --pid --fork --mount-proc --propagation private \
  bash -c '
    set -e
    uid=$1; gid=$2; wd=$3; shift 3
    [ -d "$HOME/.config/systemd" ] && mount -t tmpfs tmpfs "$HOME/.config/systemd"
    [ -d /tmp/openclaw ] && mount -t tmpfs -o mode=0700 tmpfs /tmp/openclaw
    cd "$wd"
    unshare --user --map-user=$uid --map-group=$gid -- "$@"
    exit $?
  ' iso-keep-bus "$uid" "$gid" "$wd" "$@"
