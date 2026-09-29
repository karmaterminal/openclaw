# Decision record: continuation custody after the TaskFlow removal

**Status:** proposed. Prince review is pending, and the decisions belong to the princes.
**Bound issue:** karmaterminal/openclaw#1412 (parent #1408)
**Refs:** candidate `7b3815d7f55ee68dd1322c6aec47efa3eabcda11` (continuation on TaskFlow); upstream-after `4d8c9bddda7f992e293005b78f6bc1f8adea81ed` (TaskFlow removed by openclaw/openclaw#159179, `6652f7eac8`)
**Design of record:** [RFC §5.4](/design/continue-work-signal-v2#54-continuation-custody-after-the-taskflow-removal)

## Problem

Upstream deleted the Tasks and TaskFlow runtime and left the `flow_runs` rows with no reader (`docs/reference/database-schemas/layout.md@4d8c9bdd`). At C, every durable continuation record is a `flow_runs` row:

- same-session `continue_work` elections;
- pre-spawn delegates, from both the tool and the token form;
- post-compaction staging.

The continuation also relies on four fork additions inside TaskFlow:

- atomic multi-row writes with an owner condition;
- `chain_id`;
- continuation state helpers;
- an obligation prune guard.

The candidate cannot absorb upstream without re-homing that custody. It must not carry TaskFlow along as a fork substrate.

## Decision 1: the transactional authority for continuation custody

| Option                                                                                      | Transaction boundary                                                           | Verdict                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Session pending inputs                                                                   | One-row per-agent-DB transaction per input                                     | **Rejected.** They are custody for an already admitted turn. They have no due time, are never replayed after a restart (they are marked `interrupted`), and have no multi-row owner condition.                                                                                               |
| B. Session-store transaction (state on the `SessionEntry`)                                  | Per-agent-DB session write                                                     | **Rejected.** It puts queues in a hot session row and forces recovery to scan every agent database. It cannot share a transaction with the queue or the registry.                                                                                                                            |
| C. Cron one-shot jobs                                                                       | Cron worker transaction; cross-row writes only through internal hooks          | **Rejected as the authority.** It has no revision CAS. Session targets cannot carry the trusted wake system event (only `agentTurn` or `command`; `systemEvent` requires the `main` target). Restart catch-up staggers everything after the first 5 jobs. It would also split the authority. |
| D. `subagent_runs` rows                                                                     | Registry write transactions                                                    | **Rejected for elections and pre-spawn.** Adopted as the post-admission truth for delegates.                                                                                                                                                                                                 |
| E. Continuation-owned table in the shared state DB, written through state-worker operations | One synchronous `runOpenClawStateWriteTransaction` inside one worker operation | **Recommended**                                                                                                                                                                                                                                                                              |
| F. Continuation store over the retained `flow_runs`                                         | Same as E                                                                      | **Rejected.** It reverses upstream's documented "untouched and unused" contract, it re-adds the fork-only `chain_id` to an abandoned table (a bare nullable column needs no bump), and it drags in dead generic columns.                                                                     |

**Why E:**

- It keeps one owner and one writer.
- It carries the owner-condition election from C over exactly.
- It shares a database with `delivery_queue_entries` and `subagent_runs`. That lets two operations become single commits: notice enqueue with its clear, and post-compaction release with its queue insert. It also lets the handoff check read inside the same transaction.
- It follows upstream's ownership pattern: each responsibility has one owner holding its rows. The session delivery queue has its own table. Cron (#158222) kept only its own rows in the retained `task_runs` and did not get a new table, so it is not a new-table precedent. Continuation rows change shape, and upstream has no `chain_id`, so a new table is cleaner than re-interpreting `flow_runs`.
- Timer and idle wakes remain projections.

**Cost:**

- A new table. It needs no schema-version bump (new tables qualify), but it does need **storage-review acceptance** under `docs/reference/database-schemas/storage-changes.md@4d8c9bdd`.
- The APIs become asynchronous.
- A lifecycle-owned projection is needed for the synchronous guards on the hot path.

## Decision 2: the pre-spawn to `subagent_runs` handoff key

**Recommended:** continuation precomputes `childRunId = continuation:<recordId>:<attemptId>` and records it before spawning. Spawn passes it as the Gateway `agent` idempotency key, and upstream uses that key as the run ID (`agent-request-preflight.ts@4d8c9bdd`). Recovery then looks the child up in `subagent_runs` by that run ID.

This needs one narrow change in the spawn owner. `spawnSubagentDirect` must support an explicit launch idempotency key for non-collector spawns and use it verbatim as the run ID, or it must export its derivation. Today, any caller may pass `swarmLaunchReplayKey`, which the spawn contract documents for collectors. But the key is hashed privately into `swarm_<hash>` (`subagent-spawn-request.ts@4d8c9bdd`), and only collectors persist it or can look it up.

It closes C's duplicate-spawn window, where a child was admitted but the row was never finished. It leaves one window open: upstream's own interval between Gateway acceptance and registration.

## Decision 3: migrating stored rows

**Recommended:** a core Doctor state migration, `continuation-taskflow-custody-import`.

- It imports every live or obligation-bearing row: queued and running rows, failed rows that still owe a notice, and handed-off post-compaction rows that reset must still see. Cancel-fenced rows come in as `cancelled`, and corrupt rows as `failed` with structural-only diagnostics. Legacy inline attachment bytes are moved into payload files. Terminal rows with no obligation stay behind.
- Each record keeps `record_id = flow_id`. Payload files are copied into a new root (`attachments/continuation-custody/`) before the commit and deleted from the legacy root after it, so a C-era build's orphan reconcile can never delete new files.
- Each owner session commits in one transaction. Until an owner is imported, its elections and delegate enqueues are refused with a Doctor hint, so the election owner condition never misses un-imported rows.
- It writes migration receipts.
- Gateway startup invokes the same transform before continuation recovery.
- The importer is the only reader of `flow_runs`, and it is retired on the schedule in RFC §5.4.5.

## Open questions for the princes

1. **Q1: accept option E?** This includes asking upstream for storage-review acceptance of the new table when the fork presents.
2. **Q2: accept the narrow spawn-owner change** that takes an explicit launch key for non-collector spawns?
3. **Q3: what policy for an unresolved claim at restart** (RFC §5.4.4, boundaries 2 and 3)?
   - Recommended: re-spawn under a fresh attempt. This keeps "queued work survives restart", but can duplicate work in upstream's accept-to-register window.
   - Alternative: at-most-once, with a `[continuation:delegate-spawn-interrupted]` notice. This matches upstream's no-replay doctrine, but loses delegates whose claim never reached the Gateway.
4. **Q4: ask upstream to register native spawns before acknowledging them**, as plugin subagents already do. That would close boundary 3 for everyone.
5. **Q5: add `chainId` to the election owner condition?** At C it is copied into the new row but never checked. The owner condition already covers every live work row for the session. The recommendation is no change.
6. **Q6: scrub legacy inline attachment bytes from imported source rows?** The bytes would otherwise stay forever in a table that is never pruned. The recommendation is yes, in the import transaction, recorded in the receipt, as the only exception to "source rows stay byte-identical".
7. **Q7: add a downgrade fence?** The recommendation is to set `cancel_requested_at` on imported non-terminal source rows. A rollback to a C-era build then does not re-drive work the new build already ran. During the rollback, all in-flight continuation work is parked, because C cannot see the new store. It resumes on roll-forward, and the new-root payload files survive C's reconcile.
8. **Q8: a listing surface?** The `tasks.*` RPC stays gone. A continuation-owned read method would be added only if a UI asks for it. The internal list-by-owner is mandatory either way.

## Unchanged

- `request_compaction()` stays outside durable custody.
- Post-compaction delegate release is part of delegate custody.
- The behavior contracts, configuration surface, and "no opt-out" durability of RFC §5.1 are unchanged.
