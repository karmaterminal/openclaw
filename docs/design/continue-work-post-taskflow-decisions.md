# Decision record: continuation custody after the TaskFlow removal

**Status:** decided (prince review 2026-09-29); folds applied. 🌊 Ronan's rulings on Q1–Q8 are in [#1412 comment 5887753300](https://github.com/karmaterminal/openclaw/issues/1412#issuecomment-5887753300).
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
| E. Continuation-owned table in the shared state DB, written through state-worker operations | One synchronous `runOpenClawStateWriteTransaction` inside one worker operation | **Accepted (Q1)**                                                                                                                                                                                                                                                                            |
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

**Decided (Q2):** continuation precomputes `childRunId = continuation:<recordId>:<attemptId>` and records it in the claim before spawning. Spawn passes it as the Gateway `agent` idempotency key, and upstream uses that key as the run ID (`agent-request-preflight.ts@4d8c9bdd`). Recovery then looks the child up in `subagent_runs` by that run ID.

This needs one narrow change in the spawn owner. `spawnSubagentDirect` takes an explicit launch idempotency key as an **internal parameter** for non-collector spawns and uses it verbatim as the run ID. It is not a `sessions_spawn` tool field, and no model or client can author it. Today any in-process caller may pass `swarmLaunchReplayKey`, which the spawn contract documents for collectors. But that key is hashed privately into `swarm_<hash>` (`subagent-spawn-request.ts@4d8c9bdd`), and only collectors persist it or can look it up. The `continuation:` run-ID namespace is reserved for backend callers, following the Gateway's reservation of exec-approval follow-up keys (`agent-request-preflight.ts@4d8c9bdd`). Direct tests cover the namespace and collisions (RFC §9.2.2 item 8). The same change exposes the phase in which a spawn failed (`initialize`, `dispatch` or `register`), because only an `initialize`-phase failure proves the child never ran and can be retried in process (RFC §5.4.4, "In-process spawn failures").

The key closes C's duplicate-spawn window, where a child was admitted but the row was never marked handed off. Upstream's interval between Gateway acceptance and registration stays open. Under Q3 that window no longer produces a duplicate child: an unresolved claim ends in a visible interruption. Q4 asks upstream to close the window.

## Decision 3: migrating stored rows

**Decided:** a core Doctor state migration, `continuation-taskflow-custody-import`.

- It imports every live or obligation-bearing row: queued and running rows, failed rows that still owe a notice, and handed-off post-compaction rows that reset must still see. Cancel-fenced rows come in as `cancelled`, and corrupt rows as `failed` with structural-only diagnostics. Legacy inline attachment bytes are moved into payload files. Terminal rows with no obligation are not imported. They receive a `retired-terminal` receipt, which the end-of-life step (Decision 4) relies on.
- Legacy `running` delegate rows carry no run key, and neither do post-compaction rows left `running` after a claim for release, which C's recovery spawned directly. After import they get the Q3 policy: one `[continuation:delegate-spawn-interrupted]` notice, never a re-spawn.
- Pending post-compaction queue entries that a C-era build enqueued get the same policy, in the owner's import transaction: one notice and no spawn, or settlement as delivered when C's derived child session key has a registry row for the owner. No such entry can be proven never attempted (RFC §5.4.5, "Pre-cutover queue entries").
- Each record keeps `record_id = flow_id`. Payload files are copied into a new root (`attachments/continuation-custody/`) before the commit and deleted from the legacy root after it, so a C-era build's orphan reconcile can never delete new files.
- Each owner session commits in one transaction. That transaction holds the imported records, their receipts, the Q6 scrub of legacy inline bytes, and the Q7 downgrade fence on every imported non-terminal source row. Until an owner is imported, its elections and delegate enqueues are refused with a Doctor hint, so the election owner condition never misses un-imported rows.
- Receipts record structure, counts and hashes, never content. Once a source row's inline bytes are scrubbed, a re-run treats the committed receipt and the new record as authoritative.
- Gateway startup invokes the same transform before continuation recovery.
- The importer is the only reader of `flow_runs`. On the schedule in RFC §5.4.5, the source-retirement step (Decision 4) absorbs it, and the legacy read ends when that step is removed. Retiring the importer does not retire the source rows; Decision 4 does.

## Prince decisions

🌊 Ronan decided Q1–Q8 in the prince review on #1412 ([comment 5887753300](https://github.com/karmaterminal/openclaw/issues/1412#issuecomment-5887753300), 2026-09-29). The verdict was "architecture approved, subject to folding the decisions below into the RFC". The RFC now carries every fold. Each entry gives the ruling, the reason given, and where the RFC applies it.

1. **Q1: accept option E. Decided: yes.** A continuation-owned `continuation_records` table, with every write going through one state-worker transaction family, is the only option that keeps the owner-conditioned replacement and commits queue handoffs atomically without restoring a second generic lifecycle ledger. Storage review is part of presentation, not an optional follow-up. RFC §5.4.3.
2. **Q2: accept the spawn-owner change. Decided: yes, narrowly.** The explicit launch idempotency key stays an **internal spawn-owner parameter**. It is never a caller-authored `sessions_spawn` field. Continuation records the key before dispatch, and spawn uses it verbatim as the Gateway run ID. The `continuation:` namespace and collision behavior get direct tests. RFC §5.4.4 ("Handoff key") and §9.2.2 item 8.
3. **Q3: policy for an unresolved claim at restart. Decided: at-most-once.** This departs from the draft's recommendation to re-spawn. Boundaries 2 and 3 cannot be told apart after a restart. A delegate can edit files, publish, or send messages outside the session, so uncertain prior execution does not permit running a second child. Recovery terminalizes the record with one durable `[continuation:delegate-spawn-interrupted]` notice and keeps the attempt and run-ID evidence. The durability promise narrows honestly: **queued work survives restart until claim**. After a claimed spawn that a restart left unresolved, the durable outcome is a visible interruption, not a replay. Legacy `running` rows without a run key get the same policy after import. RFC §5.4.4 (boundaries 2 and 3, "Unresolved claims are at-most-once"), §5.4.5, §5.4.9, §9.2.2, and the durability tables in §3.2 and §3.6.
4. **Q4: ask upstream to register native spawns before acknowledging them. Decided: yes.** That is the correct owner-side fix for boundary 3. Once it lands, the precomputed run ID lets recovery tell a pre-accept failure apart from admitted custody without replaying uncertain effects. The plan and the draft upstream issue are in RFC §5.4.4 ("Upstream closure of boundary 3") and Appendix E. Nothing has been posted upstream. Posting is 🌿's call, with figs.
5. **Q5: add `chainId` to the owner condition. Decided: no.** C's semantics stay. Ownership is session-wide across every live work row. Making chain identity a precondition would permit two live elections after a chain transition. RFC §5.4.3.
6. **Q6: scrub legacy inline bytes. Decided: yes.** The scrub happens in the same transaction as the imported record, its receipt, and the fence. Receipts may record structure, count and hash, never content. Idempotent re-runs treat the committed receipt and the new record as authoritative once the source bytes are gone. RFC §5.4.5 ("Source-row policy").
7. **Q7: add the downgrade fence. Decided: yes.** The import sets `cancel_requested_at` on every imported non-terminal source row in the same owner transaction. The documented rollback behavior, where new-store work parks until the next roll-forward, is the right safety trade. RFC §5.4.5.
8. **Q8: a public listing surface. Decided: no.** `tasks.*` and a UI contract are not restored. The internal list-by-owner worker API and the lifecycle projection are mandatory for recovery, reset, status, metrics and the sweep guards. RFC §5.4.6.

## Decision 4: end of life for imported source rows

The review required this fold. Q6 removes inline attachment bytes, but task text, reasons and routing metadata would otherwise stay in the abandoned `flow_runs` indefinitely. Retiring the importer does not retire that data.

**Chosen: option (a).** At the downgrade-support horizon, Doctor deletes **only receipt-proven continuation rows**. Option (b), a stated retention bound, was not chosen: it would leave the text in place with no expiry and nothing that owns the rows.

- **Horizon.** The release in which the importer retires (RFC §5.4.5). By then every supported upgrade source has shipped the importer, and one extended-stable line has passed since, so no supported rollback target reads continuation rows from `flow_runs`.
- **Proof condition.** A `flow_runs` row is deleted only if it matches the import's detection predicate and a committed `continuation-taskflow-custody-import` receipt names its `flow_id` with a disposition of `imported` or `retired-terminal`. `retired-terminal` covers terminal rows with no obligation. The import examines those but does not import them, and TaskFlow would have pruned them after 7 days at C. A row without such a receipt is never deleted.
- **Who runs it.** A core Doctor state-migration step, `continuation-taskflow-source-retirement`, owned by continuation and executed by the Doctor state-migration owner. Update's fresh Doctor and Gateway startup invoke it, like the import. It absorbs the importer, runs a final import pass for any owner still un-imported, commits per owner session, and writes its own receipt.
- **Residue.** Rows that still have no receipt at the horizon are rows whose owner import keeps failing. They are left untouched and reported as a Doctor warning with their count. They are the only continuation data this design leaves in `flow_runs`, and they live as long as upstream keeps the table.

The details are in RFC §5.4.5 ("End of life for source rows").

## Residual exposures

Q3 and Q7 are folded as ruled. The draft named two edge cases that the rulings did not close. 🌊 Ronan ruled on both on 2026-09-29 (Discord message 1554437272479203381):

1. **Pre-cutover post-compaction queue entries: removed, not kept.** The draft delivered these entries once more after the cutover, because C's drain recorded no spawn attempt. 🌊's byte-walk found no stronger discriminator: C's `postCompactionDelegate` delivery bypassed the generic attempt marker, and C persisted failure metadata only after an error returned. A crash inside the spawn therefore leaves an entry indistinguishable from one never attempted, and a deliver-once promise contradicts Q3. The revision now terminalizes every covered entry in the owner's import transaction: one `[continuation:delegate-spawn-interrupted]` notice, the entry's identity kept as evidence, and no spawn. The post-cutover drain never spawns an entry without a `childRunId`. No subset is provably never claimed, so no entry keeps deliver-once. [RFC §5.4.5, "Pre-cutover queue entries"](/design/continue-work-signal-v2#pre-cutover-queue-entries) defines the covered entries and cites the legacy bytes.
2. **Terminal obligation rows on rollback: accepted by 🌊** as a bounded exposure. Q7 fences non-terminal rows. A `failed` work row that still owes a retry-exhausted notice is terminal and unfenced. If the new build delivered that notice before a rollback, a C-era build can deliver it once more. The cost is a duplicate notice, never duplicate work.

Two derived extensions also need prince confirmation, because they go beyond the literal rulings:

- **Spawn-phase exposure (widens Q2).** The spawn-owner change also reports the phase in which a spawn failed. Only a failure before dispatch proves the child never ran, and only such a failure may be retried in process (RFC §5.4.4, "In-process spawn failures").
- **Q3 applied beyond restarts.** In-process spawn errors after dispatch, and post-compaction queue attempts, follow the same at-most-once rule as a claim left unresolved by a restart.

## Unchanged

- `request_compaction()` stays outside durable custody.
- Post-compaction delegate release is part of delegate custody.
- The configuration surface and the "no opt-out" durability of RFC §5.1 are unchanged. Custody is still unconditional. Q3 narrows only what durability promises for a delegate once it is claimed (RFC §5.4.9).

## Q3 timing for legacy claims (decided 2026-09-29)

🌊 Ronan (Discord 1554498436848553985): legacy claimed delegates and claimed-for-release post-compaction rows are **decided inside the owner import transaction**, not imported as `running` for later recovery.

- **Evidence order:** queue handoff, then owner-matching `subagent_runs`, then the Q3 failure with one source-ID-keyed notice.
- **Scope:** work rows and `awaitingNextCompaction` rows are not flattened.
- **Transaction:** release, notice, obligation clear, receipt, scrub and fence all commit in one owner transaction.
- **L4:** no legacy-only branch.
- **Source retirement:** stays implemented, tested and unregistered until its horizon (Q7).

## Startup window: custody readiness (decided 2026-09-29, L4 review)

🌊 Ronan and 🩸 Cael found in their L4 review (Discord 1554599452537262142, 1554600143481737227) that custody boot ran after channels attached, behind a timer and registry activation. Three things followed:

- a turn could write custody for an owner whose legacy rows were not yet imported;
- committed work could read as zero from the unhydrated projection;
- production startup never ran the import at all.

🌊 chose **(a), keep the RFC promise** (Discord 1554600472835264644, narrowed in 1554600753694507090):

- **Phase A (custody readiness):** one read of the live set and the owners awaiting import, then the approved L3 transform only (never broader Doctor repairs), then a fresh re-read, then install the gate and the projection. It is keyed per custody database, and a throw installs nothing.
- **Fence:** every custody command except the raw boot reads awaits phase A: mutations, list reads (reset, the cleanup guard; 🌊 successor review) and correctness counts. The first to run triggers it, and startup recovery runs it before recovering. The importer writes beneath that fence, so it cannot deadlock.
- **Database lifetime** (🩸, 🌫):
  - Readiness, projection and gate are invalidated together when the state database closes. Closes are matched by key or canonical path.
  - A phase A from the closed lifetime cannot publish into a replacement, and its import cannot write into one either. The import is lifetime-bound at every write boundary; the importer's own snapshot check separately refuses changed rows.
- **Phase B (recovery):** never re-hydrates.
- **Failed import is unknown, not empty** (🩸 successor review): reset for an owner still awaiting import fails with the retryable import-pending error, and the cleanup guard reports that owner as live. Neither may succeed over legacy rows that a later import would resurrect. The records and the import state come from one database lifetime (`readContinuationOwnerInventory`); a close between them discards the answer (🩸 second successor review).
- **Decisions:** empty-turn finalization, chain-hop allocation and the compaction release check use an exact count. They never read `unknown` as zero, and chain depth never uses a guessed value.
- **Q3 wording** (🌫, accepted by 🌊 in 1554602065093857381): "`running` implies a recorded attempt" holds for pending delegates only. A post-compaction record's first `running` state is a release claim. Its child run ID becomes durable with the queue insert and handoff (RFC §5.4.4).
