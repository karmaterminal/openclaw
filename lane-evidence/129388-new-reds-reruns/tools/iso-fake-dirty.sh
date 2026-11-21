#!/usr/bin/env bash
# iso-fake-dirty.sh DIRTY_KB <workdir> <cmd...>: the frond-scribe live-gateway isolation wrapper
# (run-isolated-from-live-gateways.sh, same mounts) plus ONE change: inside the private mount
# namespace, /proc/meminfo is a bind-mounted snapshot of the host's /proc/meminfo whose Dirty: line
# reads DIRTY_KB. Every other line is the host's at wrapper start. One-variable control for
# scripts/perf/team-shape-sessions.ts waitForTeamShapeWriteBudget(), which reads host-wide Dirty
# (/proc/meminfo is not namespaced, so an ARC pod sees its node's page cache).
set -euo pipefail
dirty=$1; shift
[[ "$dirty" =~ ^[0-9]+$ ]] || { echo "DIRTY_KB must be an integer" >&2; exit 2; }
wd=$1; shift
uid=$(id -u); gid=$(id -g)
fake=$(mktemp /tmp/oc-nrr-meminfo-XXXXXX)
trap 'rm -f "$fake"' EXIT
sed -E "s/^Dirty:([[:space:]]+)[0-9]+ kB$/Dirty:\1${dirty} kB/" /proc/meminfo >"$fake"
grep -qE "^Dirty:[[:space:]]+${dirty} kB$" "$fake" || { echo "could not rewrite Dirty: in $fake" >&2; exit 2; }
unshare --user --map-root-user --mount --pid --fork --mount-proc --propagation private \
  bash -c '
    set -e
    uid=$1; gid=$2; wd=$3; fake=$4; shift 4
    mount -t tmpfs tmpfs /run/systemd
    mount -t tmpfs tmpfs /run/user/$uid
    [ -d /run/dbus ] && mount -t tmpfs tmpfs /run/dbus
    [ -d "$HOME/.config/systemd" ] && mount -t tmpfs tmpfs "$HOME/.config/systemd"
    [ -d /tmp/openclaw ] && mount -t tmpfs -o mode=0700 tmpfs /tmp/openclaw
    mount --bind "$fake" /proc/meminfo
    echo "# iso-fake-dirty: $(grep -E "^Dirty:" /proc/meminfo)" >&2
    cd "$wd"
    unshare --user --map-user=$uid --map-group=$gid -- env -u DBUS_SESSION_BUS_ADDRESS "$@"
    exit $?
  ' iso "$uid" "$gid" "$wd" "$fake" "$@"
