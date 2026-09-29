---
summary: "Storage review for the continuation custody store: the continuation_records first-use table and its state-worker operations"
read_when:
  - Changing continuation custody storage, retention, or recovery
  - Reviewing the continuation_records table or its worker operations
title: "Continuation custody storage review"
---

# Continuation custody storage review

**Status:** submitted for storage review; implementation lane L1 of karmaterminal/openclaw#1408.
**Design of record:** [RFC §5.4](/design/continue-work-signal-v2#54-taskflow-backing-for-same-session-work-and-delegates) at its approved custody revision (`5201b2df47`, karmaterminal/openclaw#1412), with the prince rulings on Q1–Q8 ([#1412 comment 5887753300](https://github.com/karmaterminal/openclaw/issues/1412#issuecomment-5887753300)). Section references below are to that revision.
**Accepted decision this review implements:** Q1 = option E, a continuation-owned table in the shared state database written through state-worker operations.

The [storage review checkpoint](/reference/database-schemas/storage-changes#review-checkpoint-for-material-changes) applies because this change adds a table and its indexes. The schema version does not change: new tables qualify ([versioning](/reference/database-schemas/versioning)). This page covers the items that checkpoint asks for.

## Owning store and lifecycle

- **Owner.** Continuation custody. Its store module (`src/auto-reply/continuation/custody/`) is the only writer and the only reader of `continuation_records`. Nothing else reads the table directly.
- **Access path.** Every operation is one shared-state worker command (`continuationCustody.*`). Each command runs one synchronous `runOpenClawStateWriteTransaction` in the state worker. The worker requests write authority after `BEGIN` and again before `COMMIT`, and the host revalidates the captured state admission at both points. Commands share the worker broker's FIFO, so a list observes every earlier committed custody write.
- **Creation.** The table is a first-use table (`FIRST_USE_STATE_TABLES`), because task text and reasons are privacy-sensitive. The first custody write creates it from the canonical DDL in `openclaw-state-schema.sql`. A read of an absent table returns no records and creates nothing. The table-presence check reads the admitted schema facts carried with the handle.
- **No caller is switched in L1.** Continuation still runs on TaskFlow until the dispatch and recovery lanes move onto this store.

## Problem

Upstream removed Tasks and TaskFlow (openclaw/openclaw#159179) and left `flow_runs` with no reader. Every durable continuation record lives in `flow_runs` at C. Continuation needs its own custody store to keep its protocol: owner-conditioned election, revision CAS, spawn-attempt evidence, a terminal-notice obligation, and attachment custody. RFC §5.4.1–§5.4.3 give the full requirement.

## Alternatives that avoid new persistence

RFC §5.4.3 compares six options. The prince review rejected all five that avoid a new table:

- **A. Session pending inputs.** They hold input for an already admitted turn, have no due time, and are never replayed after a restart.
- **B. Session-store transaction.** It puts queues in a hot session row, forces recovery to scan every agent database, and cannot share a transaction with the queue or the registry.
- **C. Cron one-shot jobs.** They have no revision CAS, cannot deliver the continuation wake to an arbitrary session, and stagger restart catch-up.
- **D. `subagent_runs`.** Same-session elections have no child, and pre-admission delegates have no row. It stays the post-admission owner.
- **F. Re-interpreting `flow_runs`.** It reverses upstream's documented "untouched and unused" contract for a table upstream still ships.

## Schema

```sql
CREATE TABLE continuation_records (
  record_id TEXT NOT NULL PRIMARY KEY CHECK (length(record_id) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('work', 'delegate', 'post_compaction')),
  owner_session_key TEXT NOT NULL CHECK (length(owner_session_key) > 0),
  chain_id TEXT CHECK (chain_id IS NULL OR kind = 'work'),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  phase TEXT,
  failure_reason TEXT,
  cancel_requested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  due_at INTEGER,
  state_json TEXT NOT NULL,
  spawn_attempts_json TEXT NOT NULL DEFAULT '[]',
  handoff_json TEXT,
  rollback_of TEXT,
  attachment_id TEXT,
  terminal_notice_pending TEXT CHECK (terminal_notice_pending IS NULL OR terminal_notice_pending IN
    ('retry-exhausted', 'delegate-spawn-interrupted', 'rollback-election-conflict')),
  CHECK ((status IN ('succeeded', 'failed', 'cancelled')) = (ended_at IS NOT NULL)),
  CHECK (attachment_id IS NULL OR status IN ('queued', 'running'))
) STRICT;
CREATE INDEX idx_continuation_records_owner ON continuation_records(owner_session_key, kind, status);
CREATE INDEX idx_continuation_records_due ON continuation_records(status, kind, due_at);
```

The columns map to C's `flow_runs` columns as RFC §5.4.2 tabulates. Two constraints make invalid states unrepresentable: a terminal status always has `ended_at` and a live status never does, and a terminal record never holds an attachment reference.

### Fields the store interprets are columns

RFC §5.4.2 places `spawnAttempts`, `handoff`, the attachment reference, and `terminalNoticePending` in the per-kind state. This implementation stores them as columns instead, and keeps `state_json` opaque to the store. Each of these fields is something the store itself must read or enforce inside its transaction:

| Column                    | Why the store owns it                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spawn_attempts_json`     | Attempt IDs are allocated inside the claim transaction and are strictly increasing and never reused. The list is append-only evidence kept after terminal writes. |
| `handoff_json`            | A handoff is permanent: it cannot be cleared or replaced, the record stays `succeeded`, and it cannot be deleted.                                                 |
| `attachment_id`           | Terminal writes scrub it in the same commit, and the commit reports the scrubbed reference so the payload file is released after it.                              |
| `terminal_notice_pending` | Retention must never prune a record that still owes a notice.                                                                                                     |
| `rollback_of`             | Replaces C's `prior.revision + 1 / + 2` inference with an explicit marker.                                                                                        |

The continuation codecs must not duplicate these fields in `state_json`. This is a placement refinement of the accepted design, not a change to its semantics. The prince review should confirm it.

## Canonical and derived data

- **Canonical:** every column except `due_at`, plus the private payload files.
- **Derived:** `due_at`, a recovery-scan copy of the effective due time. The authoritative clocks stay in `state_json`.
- **Derived, process-local:** the hot-path projection (see [Concurrency and recovery invariants](#concurrency-and-recovery-invariants)). It is never persisted.
- **Evidence:** `spawn_attempts_json`. Each `childRunId` is written once, by the L0 formatter `formatContinuationChildRunId`, and is read back verbatim, never re-derived.

## Payload files

Delegate attachment bytes stay outside SQLite, in C's payload format with its 8 MiB cap, under a new root: `<stateDir>/attachments/continuation-custody/<attachmentId>/payload.json`. Each payload binds `recordId` and `ownerKey`. A read or release that names another record is refused.

- The payload is written before the record that references it commits (RFC §5.4.4 boundary 0). If the record ID already exists without referencing it, the create releases its own payload.
- A payload is write-once. It is published atomically and never replaces an existing file. A byte-identical existing file is a retry; any other file under the attachment ID, including another record's or owner's payload, makes the create return `payload_conflict` without writing the file or the record.
- A terminal write, an explicit scrub, or a delete clears the reference in the commit. The file is released after the commit.
- A crash between that commit and the release leaves an unreferenced file. The startup reconcile removes payload directories that no live record references and that are older than its cutoff, as at C.
- The legacy root `<stateDir>/attachments/continuation/` belongs to the Doctor import (RFC §5.4.5), not to this store.

## Upgrade, downgrade and rollback

- **Upgrade:** no migration. The table appears at the first continuation custody write.
- **Older same-schema builds** ignore the table. The first-use contract lets preflight treat its absence as exact.
- **Rollback to a TaskFlow build (C):** C never reads `continuation_records`, so rows written by this store are invisible to it. The Q7 fence and the Doctor import (RFC §5.4.5, later lanes) govern work in flight across a rollback. L1 switches no caller, so L1 alone changes no runtime behavior on rollback.
- **Removal:** dropping the feature means leaving the table in place. Do not drop it or lower schema markers.

## Retention and deletion

- Terminal records are pruned after the caller's cutoff: 7 days, carried over from TaskFlow. The retention owner calls prune from startup recovery and a lifecycle interval, which a later lane wires.
- A record with `terminal_notice_pending` set is never pruned.
- Live records are never pruned.
- Delete removes one record at an exact revision. It serves unaccepted removals only (RFC §5.4.8 item 4).
- Payload files follow their record, as described above.

## Concurrency and recovery invariants

**Transaction boundaries.** Each row below is exactly one state write transaction.

| Operation                                       | Reads inside the transaction                                                                                                                                                                                                 | Writes                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `continuationCustody.create`                    | Record ID uniqueness                                                                                                                                                                                                         | One insert at revision 0                                                                                                   |
| `continuationCustody.update`                    | Every named record at its expected revision                                                                                                                                                                                  | All patches, or none. With several updates this is the rollback write: no owner condition, only exact revisions.           |
| `continuationCustody.elect`                     | The owner's live work records (`queued` or `running`, not cancel-fenced), compared exactly to the caller's snapshot by `(recordId, revision, status)`; each superseded prior at its expected revision; new-record uniqueness | Supersede every parked prior as `succeeded`, then insert the new record. Chain identity is not part of the condition (Q5). |
| `continuationCustody.claimSpawnAttempt`         | The delegate at its expected revision: `queued`, not fenced, not handed off                                                                                                                                                  | Status `running` and one appended attempt `{attemptId: max + 1, childRunId, claimedAt}`                                    |
| `continuationCustody.recordSpawnAttemptFailure` | The running record's latest attempt, with no failure recorded yet                                                                                                                                                            | The attempt's `failurePhase`, plus an optional CAS patch such as a requeue                                                 |
| `continuationCustody.delete`                    | The record at its expected revision, not handed off                                                                                                                                                                          | One delete                                                                                                                 |
| `continuationCustody.prune`                     | None                                                                                                                                                                                                                         | Delete terminal, notice-free records that ended before the cutoff                                                          |
| `continuationCustody.list`                      | Filtered records in `(created_at, record_id)` order                                                                                                                                                                          | None, but it runs in the write FIFO                                                                                        |

Every operation validates all of its preconditions before its first write. A refusal therefore commits nothing, and a thrown write rolls back the whole transaction. Every write increments `revision` and returns the post-commit live set of each owner it touched.

**Election atomicity (RFC §5.4.3).** A failure anywhere inside an election leaves the owner's work custody in exactly the pre-state or the post-state. There is never a state with two live obligations for one election, and never a superseded prior without its replacement. The store-level proof injects a fault with a SQLite trigger inside the real database, between the supersede writes and the insert, and between two supersede writes. It also refuses the commit grant through the real state worker. Both proofs fail against a deliberately split variant that commits the supersede writes separately, and pass against the real operation.

**Planner and retry.** As at C, the caller plans an election from a snapshot of the owner's live work, and it rejects the `running_owner`, `capped`, and `invalid_prior` cases itself. The worker rereads and writes synchronously. An owner or revision conflict replans once.

**Hot-path projection (RFC §5.4.6).** Synchronous guards read a process-local projection keyed by state database path. Startup hydration installs the committed live set. Every custody write installs the post-commit live sets its result reports for the owners it touched. A write that throws may or may not have committed, so its owners become `unknown` until their next committed fact. Before hydration, every owner is `unknown`. The projection never polls for freshness.

**List-by-owner runs in the write FIFO.** RFC §5.4.6 says reads use the read-only worker scope. Recovery, hydration and election snapshots must observe every earlier committed custody write, so this implementation serves list-by-owner through the write broker's FIFO. The channel ingress queue uses the same pattern for its claim and recovery preparation. A read-only-worker variant for `/status` and metrics, where bounded staleness is acceptable, can be added when a later lane wires those consumers.

## Performance and storage impact

- One row per election, delegate, or post-compaction staging, pruned 7 days after it ends. A row holds the controller state as JSON, typically well under a kilobyte, plus a few attempt entries.
- Two indexes serve owner lookups `(owner_session_key, kind, status)` and recovery scans `(status, kind, due_at)`.
- Every write is one short transaction in the existing state worker. An election rereads only the owner's live work rows, which C caps at `maxPendingWork` plus parked records.

## Validation and limits

- Store-level proofs: `src/auto-reply/continuation/custody/custody-store.worker.test.ts` (kernel transactions with trigger fault injection) and `custody-store.test.ts` (the same through the real state worker, commit-grant refusal, projection consistency, and payload scrub).
- Not yet proven here, because no caller uses the store: the §9.2.2 behavior regressions for dispatch, recovery, the handoff boundaries, the terminal-notice enqueue-and-clear transaction, and the post-compaction release. Those belong to the lanes that switch callers. The public #1411 negative control stays with L4.
- `childRunId` global uniqueness depends on record IDs never being reused. Record IDs are random UUIDs (or imported `flow_id`s), and create refuses an existing ID. A deleted record's ID could in principle be created again, and its attempt 1 would then repeat an earlier run ID. Recovery's requester check (RFC §5.4.4, "Collisions are not adoption") still applies.
