# Method

Lane: proof/test only on exact upstream `a4407f638af0d0147e3712eb6202ba7bf5d3d7fc`.
GitNexus indexes available in this environment point at other worktrees, not this SHA. Symbol graph below is reconstructed from source.

## Frozen identities

| Identity                    | Value                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| Product/base SHA            | `a4407f638af0d0147e3712eb6202ba7bf5d3d7fc`                       |
| Deployed incident composite | `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`                       |
| Causal graph                | `cfbb29bfd3e751e718fda44649b690268621f13f`                       |
| Host                        | `ronan` (`10.0.0.246`)                                           |
| Bound issue                 | karmaterminal/openclaw#1257                                      |
| Candidate counterfactual    | openclaw/openclaw#119901 (unmerged; ANALYZE after doctor VACUUM) |

## Search rule

Name/size/mtime only on candidate trees. SHA-256 only on already-offline recovery files. No sqlite open, ANALYZE, VACUUM, integrity pragma, or copy of any path under `~/.openclaw/agents` or `~/.openclaw/state`.

## Acceptable specimen

Must match one incident seat **and** be an immutable offline copy with sidecars:

| Seat   | Exact agent DB bytes | Representative hold             |
| ------ | -------------------: | ------------------------------- |
| Cael   |        5,403,803,648 | 4,864 ms / 5,398 ms fenced read |
| Ronan  |        3,796,570,112 | 2,327 ms / 2,543 ms             |
| Emeric |        6,622,703,616 | 1,222 ms `agent.write`          |

Required files: `openclaw-agent.sqlite` plus `-wal`/`-shm` if they existed at snapshot time. Capture only after Gateway release or a verified filesystem snapshot.

## Owner path (this SHA)

`SessionManager.open` (`src/agents/sessions/session-manager.ts:78-84`) calls `loadTranscriptEventsSync`.

`loadTranscriptEventsSync` (`src/config/sessions/session-accessor.sqlite-read.ts:49-63`) opens the agent DB and runs a **synchronous** deferred transaction labeled `session transcript fenced read`. Inside the callback it resolves `resolveSqliteSessionTranscriptReadFence` then `loadTranscriptEventsFromDatabase`.

`loadTranscriptEventsFromDatabase` (`:174-190`) selects `event_json` for one `session_id` and optional `seq < fence`, then `JSON.parse`s every selected row **before the transaction returns**. Slow-hold logging fires at 1000 ms (`src/infra/sqlite-transaction.ts:20,87-112`).

Fence SQL (`session-transcript-read-fence.ts:65-92`) joins identities, active events, events, and rewrite watermarks to re-validate the admission receipt. Missing/changed identity throws; it does not weaken to a full read.

Selected SQL, not “all rows in the file”:

```sql
SELECT event_json FROM transcript_events
WHERE session_id = ? [AND seq < ?]
ORDER BY seq ASC
```

On a multi-GB store the selected session can still be huge.

## #119901 counterfactual

On this SHA, `compactDoctorSqliteFile` VACUUMs and checkpoints. It does **not** `ANALYZE`. PR #119901 adds `ANALYZE` plus a second checkpoint after VACUUM. That is offline doctor maintenance, not a hot-path change. Applicability requires `sqlite_stat1` before/after plus a timing delta on an incident-shaped copy. Not claimed here.

## C4 owner if query/decode wins

`src/config/sessions/session-accessor.sqlite-read.ts` (`loadTranscriptEventsSync` / `loadTranscriptEventsFromDatabase`). Keep fence resolution and the seq-bounded SELECT inside the deferred transaction. Materialize `event_json` text only; decode after COMMIT. Do not weaken fencing or order. Not implemented in this lane.

## Integrity

Copy `integrity_check` / `quick_check` failure diverts to #1261-style corruption. Never counted as a performance improvement.
