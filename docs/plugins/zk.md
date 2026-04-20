---
summary: "ZooKeeper coordination primitives and CLI for the openclaw fleet"
read_when:
  - You need cross-host locks, leader election, or party membership from a TypeScript plugin
  - You run `openclaw zk …` commands and want to know the contract
  - You wire an openclaw feature into the cross-host TaskFlow ownership layer
title: "Plugin SDK: ZK coordination"
---

# Plugin SDK: ZK coordination

`openclaw/plugin-sdk/zk` exposes ZooKeeper-backed coordination primitives
for plugins and for openclaw internals. It ships four recipe-style APIs
modeled after [kazoo](https://kazoo.readthedocs.io/) — `Lock`,
`LeaderElection`, `Party`, `ReadWriteLock` — plus a flock-style CLI at
`openclaw zk`.

Cross-host TaskFlow ownership (the anti-jumping seam for reply dedup,
cron singletons, and agent-runner session ownership) rides on this same
subpath.

## When to use it

- **Cross-host mutex.** Only one prince runs a given subprocess at a time.
- **Leader election.** Exactly one prince runs an ongoing task; failover
  to another prince on session loss.
- **Party membership.** "Which princes are alive right now" visible to
  every member.
- **Reader/writer coordination.** Many concurrent readers, exclusive
  writers, on a shared resource.

If the work fits in a multi-step TaskFlow, prefer cluster-scoped TaskFlow
ownership over grabbing a raw `Lock` — see
[Task Flow](/automation/taskflow) for the ownership contract.

## Installation

The native binding is an `optionalDependencies` entry, so `npm install`
completes even without the node-gyp toolchain. A non-fleet install that
never calls `createZkClient` pays zero cost.

To enable it on a fleet box:

```bash
openclaw zk setup
```

This detects the OS package manager (apt/pacman/dnf), installs
`build-essential` + `python3`, and runs `npm i zookeeper@^7.2.0` into
the openclaw install directory. If elevation fails (no sudo, read-only
filesystem), the command prints a copyable prereq checklist and retries
once the operator says "done."

## Connection defaults

`createZkClient` reads the hosts string from (highest precedence first):

1. `hosts` argument passed directly.
2. `ZK_HOSTS` env var. Matches kazoo + the Python `fleet_lock.py` muscle
   memory; non-negotiable for cross-script compat.
3. `openclaw config get zk.hosts` (persisted).
4. Default: `zk-client.fleet-coordination.svc.cluster.local:2181`.

In-cluster pods resolve the default via kube-dns. Princes running
outside the pod network must set `ZK_HOSTS` explicitly — typically
`<any-k3s-node-ip>:32181` (NodePort). If the default DNS doesn't resolve
and no override is set, `createZkClient` fails fast with an operator
message pointing here; no implicit tailnet sniffing.

## Session lifecycle

ZK sessions have a timeout (default 10s). When the session expires —
typically because the ensemble lost quorum or a network partition
outlasted the timeout — every ephemeral-backed handle fires its
`AbortSignal`, recipes stop making progress, and callers MUST treat
expiry as "you lost the lock / leadership / membership." There is no
transparent replay: a transparent re-acquire after a gap is more
dangerous than the work it would cover (duplicate side effects).

For one-shot CLI invocations the contract is simpler: connect → op →
close, with a hard 5s connect timeout.

For `openclaw zk lock/elect/... -- <cmd…>` wrappers, the client stays
open for the subprocess's lifetime. On session expiry the wrapper
SIGTERMs the child process by default (configurable via
`--on-session-loss={kill,warn,ignore}`). This is the safety contract
`fleet_lock.py` gets wrong today.

## Quorum degradation

When the ZK ensemble temporarily loses quorum:

- A ZK session owned by a prince in the middle of a lock hold expires
  after `sessionTimeoutMs`.
- The ephemeral znode backing that lock disappears; another prince (or
  the same prince on a re-attempt) can acquire it if quorum returns.
- Reply-dedup and other cluster-scoped TaskFlow consumers transition
  the affected flow to `status: "blocked"` with
  `reason: zk-quorum-lost-at-<ts>` and stop making progress. **No
  replay** — a duplicate reply or duplicate scheduled task is worse
  than none. Use `openclaw tasks flow resume <id>` to explicitly
  re-enter once an operator has confirmed the state.

## Path convention

The recipes default-prefix paths under `/openclaw/<env>/<feature>/...`
to prevent collisions across consumers. See the
[path-prefix + evidence template](/plugins/zk-parity) for the reserved
feature prefixes.

To interop with existing Python callers (`fleet_lock.py` uses
`/dandelioncult/thornfield/locks/...`), pass `--no-prefix` on the CLI
or construct paths yourself via `joinPath` / `validatePath`.

## Current status

PR #1 ships the foundation — client, driver interface, native + mock
drivers, errors, path helpers — and this subpath. Recipes land in PR 2,
the CLI + integration suite in PR 3, cross-host TaskFlow ownership in
PR 4, and the first internal consumer (reply dedup) in PR 5.

See the parent tracking issue at karmaterminal/openclaw#175.
