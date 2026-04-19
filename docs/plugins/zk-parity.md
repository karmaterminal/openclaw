---
summary: "Kazoo-parity roadmap, path-prefix convention, and the wire-up evidence template"
read_when:
  - You are writing or reviewing a cross-host coordination wire-up (reply dedup, cron singleton, agent-runner session)
  - You need to find the reserved ZK path prefix for a new feature
  - You want to know which kazoo recipes are available in TypeScript today vs planned
title: "Plugin SDK ZK: parity + conventions"
---

# Plugin SDK ZK: parity + conventions

## Path-prefix convention

All recipes and the cluster-scoped TaskFlow mode default-prefix paths
with `/openclaw/<env>/<feature>/...` to prevent collisions across
consumers. `env` is the value of `openclaw config get deploy.env`
(falls back to the literal `"fleet"`).

Reserved feature prefixes:

| Feature                               | Path prefix                                            | Ships in |
| ------------------------------------- | ------------------------------------------------------ | -------- |
| Raw user locks (`openclaw zk lock …`) | `/openclaw/<env>/user/locks`                           | PR 3     |
| Elections (`openclaw zk elect …`)     | `/openclaw/<env>/user/elections`                       | PR 3     |
| Parties (`openclaw zk party …`)       | `/openclaw/<env>/user/parties`                         | PR 3     |
| TaskFlow cluster ownership            | `/openclaw/<env>/taskflow/<flowId>`                    | PR 4     |
| Reply dedup                           | `/openclaw/<env>/reply/<conversation_id>/<message_id>` | PR 5     |
| Cron singletons                       | `/openclaw/<env>/cron/<job-id>/<tick>`                 | v1.3     |
| Agent-runner sessions                 | `/openclaw/<env>/agents/<channel>`                     | v1.3     |

CLI commands accept `--no-prefix` to bypass the convention when
interoperating with existing Python callers (`fleet_lock.py` uses
`/dandelioncult/thornfield/locks/...` directly).

Adding a new consumer? Pick a prefix that doesn't collide, document it
in this table in the PR that lands the consumer, and use
`featurePath(env, "<feature>", ...rest)` from `openclaw/plugin-sdk/zk`
to construct paths instead of hand-concatenating strings.

## Wire-up evidence template

Every cross-host TaskFlow wire-up PR (reply dedup, cron singletons,
agent-runner sessions, plus any future consumer) MUST include an
evidence block in the PR description matching the shape below. Reviewers
reject PRs that ship handwave-evidence.

```markdown
## Wire-up: <feature> (PR #<n>)

### Before

- Log trace (≥2 princes claiming same <scope-key> within 100ms):
  2026-04-19T14:30:12.103Z elliott claim <key>
  2026-04-19T14:30:12.117Z ronan claim <key> ← collision
  2026-04-19T14:30:12.803Z elliott posted reply
  2026-04-19T14:30:12.891Z ronan posted reply ← duplicate (the "danish")
- Incident: <link to channel message or issue demonstrating the collision>

### After

- Log trace (same scope-key, post wire-up):
  2026-04-19T14:45:00.204Z ronan claim <key> → flow abc, elected
  2026-04-19T14:45:00.218Z elliott claim <key> → not_owner (flow abc, owner=ronan)
  2026-04-19T14:45:00.901Z ronan posted reply
- Assertion: exactly one `posted reply` log line per scope-key across all princes, observed over a 24h run.

### Kill test

- SIGKILL the owner gateway; confirm a different prince takes over within 2× sessionTimeoutMs.
- Confirm the flow state reflects the correct new controller in `openclaw tasks flow show <id>`.
```

## Kazoo parity roadmap

| kazoo recipe                               | openclaw equivalent               | Status                                                    |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------- |
| `kazoo.recipe.lock.Lock`                   | `createLock` + `withLock`         | ✓ `src/plugin-sdk/zk/lock.test.ts`                        |
| `kazoo.recipe.election.Election`           | `createElection`                  | ✓ `src/plugin-sdk/zk/election.test.ts`                    |
| `kazoo.recipe.party.Party`                 | `createParty`                     | ✓ `src/plugin-sdk/zk/party.test.ts`                       |
| `kazoo.recipe.lock.ReadLock` + `WriteLock` | `createReadWriteLock`             | ✓ `src/plugin-sdk/zk/rwlock.test.ts`                      |
| `kazoo.recipe.lock.Semaphore`              | `createSemaphore`                 | planned v1.x                                              |
| `kazoo.recipe.counter.Counter`             | `createCounter`                   | planned v1.x                                              |
| `kazoo.recipe.queue.LockingQueue`          | `createLockingQueue`              | planned v1.x                                              |
| `kazoo.recipe.partitioner.SetPartitioner`  | `createSetPartitioner`            | planned v1.x                                              |
| `kazoo.recipe.lease.NonBlockingLease`      | `createLease`                     | planned v1.x                                              |
| `DataWatch` / `ChildrenWatch` callbacks    | `AsyncIterable<…>` on each recipe | ⏳ PR 2 (per-recipe) + planned generic v1.x               |
| Transactions (`multi`)                     | `createTransaction`               | planned v1.x                                              |
| ACLs                                       | `authInfo` on `createZkClient`    | ⏳ PR 1 (opaque pass-through); structured helpers planned |

Deliberate API divergences from kazoo (documented in [/plugins/zk](/plugins/zk)):

- `AbortSignal` replaces `CancelledError` — leadership loss,
  session expiry, and caller-driven cancellation all fire the same
  signal.
- `AsyncIterable<…>` replaces kazoo's persistent watch callbacks.
  Avoids leaking listener-management into callers.
- `withLock(client, path, fn, opts)` replaces `async with lock:`. Same
  try/finally-release semantics; idiomatic TS shape.

## Adding a new recipe

1. Write the recipe under `src/plugin-sdk/zk/<name>.ts`, depending only
   on the `ZkDriver` interface (not the native module directly).
2. Add a `*.test.ts` next to it exercising the recipe against
   `driver-mock.ts`. Coverage must meet the 70% line/branch/function/
   statement threshold the repo enforces for new SDK surfaces.
3. Export contract types from `src/plugin-sdk/zk.ts`; add the factory
   as an async function that dynamic-imports the implementation (keeps
   cold import cheap).
4. Update this file: add the row to "Kazoo parity roadmap" with a ✓
   and a link to the test file.
5. If the recipe needs a reserved path prefix, add it to the path
   convention table above.

## Integration-test coverage

Session-expiry edges are the historical bug farm for every ZK library.
The integration suite (`OPENCLAW_ZK_INTEGRATION=1 pnpm test
src/plugin-sdk/zk`) must cover:

- (a) expiry during lock hold
- (b) expiry during election leadership
- (c) expiry during party membership
- (d) reconnect within session window (no expiry)

Flaky scenarios gate behind `OPENCLAW_ZK_INTEGRATION_STRESS=1` rather
than `skip` — they run in the heavier CI lane once the primary suite
is green.
