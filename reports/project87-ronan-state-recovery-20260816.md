# Project 87: Ronan shared-state recovery analysis

Bound issue: [karmaterminal/openclaw#1263](https://github.com/karmaterminal/openclaw/issues/1263)
Parent: [karmaterminal/openclaw#1254](https://github.com/karmaterminal/openclaw/issues/1254)
Sibling (distinct defect): [karmaterminal/openclaw#1261](https://github.com/karmaterminal/openclaw/issues/1261) (Cael catalog overflow)
Not this defect: [karmaterminal/openclaw#1257](https://github.com/karmaterminal/openclaw/issues/1257) (multi-GB agent transcript reads)
Exact runtime that must return first: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Analyst: Grok 4.6
Lane: `codeagent/ronan-state-db-recovery-analysis`

This report is public-safe. No message payloads, credentials, prince memory, or private identifiers.

## Verdict

The frozen Ronan shared-state image is physically inconsistent. Offline `PRAGMA integrity_check` / `quick_check` on a hash-verified copy report only:

`Freelist: size is 267 but should be 274`

That is the same closed reason the six automatic Gateway starts fail-closed on. There is no overflow-list error, unused-page list, or foreign-key violation. `user_version=7`. Product-table `COUNT(*)` values all succeed.

SQLite `.recover` (CLI 3.53.4 with `sqlite_dbpage`) into a new file yields `integrity_check=ok` at `user_version=7`. Every product table count matches the incident image. Catalog cache reconstructs with the same `length(bundle_json)=1169691` as the corrupt copy. Salvage table `lost_and_found` has 33 rows over 5 unmapped `rootpgno` values (none is catalog root 248).

**Selected strategy: current `.recover` candidate**, then drop salvage only. Catalog left in place because it is readable on both the corrupt copy and the recover image; it is a rebuildable cache, not the damaged tree.

| Candidate                         | SHA-256                                                            | Size       | `user_version` | Integrity |
| --------------------------------- | ------------------------------------------------------------------ | ---------- | -------------- | --------- |
| **Selected cleaned recover**      | `30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d` | 74,825,728 | 7              | ok        |
| Pre-cleanup recover               | `278fa90c0e8e8c9023318935f130450439fcca331413740b072d3f644386818a` | 77,144,064 | 7              | ok        |
| Prior repaired `20260815T090547Z` | `ff9dd266bd00871c50af17ffd407c9e2eba5b226302994755d65406b16e6ecf3` | 75,497,472 | **6**          | ok        |

No cutover, restart, live SQLite write, WAL/SHM deletion, deploy, or provider change was performed.

## Containment freeze (observed, not mutated)

| Fact                     | Value                                                                             |
| ------------------------ | --------------------------------------------------------------------------------- |
| Ronan unit               | `openclaw-gateway.service` user unit, `failed` / `failed`                         |
| `NRestarts`              | `6`                                                                               |
| Failed-closed since      | `2026-08-16 00:03:23 PDT`                                                         |
| OOM process              | pid `1307987`, `code=dumped, status=6/ABRT` at `00:02:25`                         |
| systemd memory peak      | `59.8G` (plus `43.2M` swap peak); CPU `1h 59min 26s`                              |
| V8 heap at death         | Mark-Compact `32751.1` MiB; `FATAL ERROR: Reached heap limit`                     |
| Heap ceiling             | `NODE_OPTIONS=--max-old-space-size=32768`                                         |
| Last pre-OOM diagnostics | `00:02:09` RSS `28.2 GiB`, heap `27.8 GiB`                                        |
| Live DB (stat only)      | `78,249,984` bytes, mtime `2026-08-15 23:58:56 PDT`, mode `600`                   |
| Frozen copy              | `~/.openclaw/recovery/project87-ronan-20260816T0028PDT/`                          |
| Frozen DB SHA-256        | `98b7a91bb71830f3b415200f88c5fb52b4f96b74393119fe16a947898ecbaef0`                |
| Frozen WAL               | 0 bytes, SHA-256 `e3b0c442…7852b855` (empty)                                      |
| Frozen SHM               | 32,768 bytes, SHA-256 `fd4c9fda…9389eb`                                           |
| Live WAL/SHM now         | **absent** (present in the freeze stat at `00:28`; this lane did not unlink them) |
| Deployed runtime         | `/home/figs/flesh_beast_tmp/openclaw` = `6b09b1db…f89955`                         |

Gateway remained stopped. Analysis targeted copies under `/tmp/project87-ronan-analysis-20260816` only.

## Physical findings (copied artifacts only)

SQLite CLI used for first read: system `3.45.1`. Recover/cleanup: compiled amalgamation `3.53.4` (`SQLITE_ENABLE_DBPAGE_VTAB`). Gateway/Node bundled SQLite `3.51.3` reconfirmed the cleaned candidate.

Corrupt copy:

| Pragma / check                           | Value                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| page_size / page_count / freelist_count  | `4096` / `19104` / `274`                                    |
| `user_version` / SQLite `schema_version` | `7` / `805`                                                 |
| journal_mode on isolated copy            | `delete`                                                    |
| `quick_check`                            | Freelist 267 vs 274                                         |
| `integrity_check`                        | Freelist 267 vs 274 only                                    |
| `foreign_key_check`                      | 0 rows                                                      |
| tables / indexes (non-`sqlite_%`)        | 130 / 134                                                   |
| `schema_meta.primary`                    | role `global`, schema `7`, app `2026.8.1`                   |
| `model_catalog_remote`                   | `COUNT(*)=1`, `length(bundle_json)=1169691`, rootpage `248` |
| Product `COUNT(*)` errors                | none                                                        |

`PRAGMA freelist_count` reports `274` while the integrity checker says the freelist header size is `267`. That is a free-list structure mismatch, not a named b-tree overflow.

System `3.45.1` `.recover` failed with `no such table: sqlite_dbpage` (CLI built without `SQLITE_ENABLE_DBPAGE_VTAB`). Official linux-x64 tools are x86_64; this host is aarch64. Recover used a locally compiled `3.53.4` amalgamation. The recover SQL dump stayed in `/tmp` and was not committed.

`.recover` then cleanup:

| Fact                              | Pre-cleanup                        | Cleaned (selected) |
| --------------------------------- | ---------------------------------- | ------------------ |
| SHA-256                           | `278fa90c…86818a`                  | `30940a6e…4cbb28d` |
| Size                              | 77,144,064                         | 74,825,728         |
| `user_version` / `schema_version` | 7 / 266                            | 7 / 268            |
| Pages × page_size                 | 18,834 × 4096                      | 18,268 × 4096      |
| Freelist                          | 0                                  | 0                  |
| journal                           | delete                             | delete             |
| `integrity_check` / `quick_check` | ok / ok                            | ok / ok            |
| FK                                | 0                                  | 0                  |
| `lost_and_found`                  | 33 rows, 5 `rootpgno`, `nfield=31` | absent             |
| Catalog                           | 1 row, 1,169,691 bytes             | unchanged          |
| Product counts vs corrupt         | exact match                        | exact match        |

Cleanup on the new file only: `DROP TABLE IF EXISTS lost_and_found;` `PRAGMA user_version=7;` `VACUUM;`. Catalog was **not** deleted: it is readable on the corrupt copy, so it is not a demonstrated salvage reconstruction.

Node `3.51.3` read-only recheck of the cleaned file: `quick_check=ok`, `integrity_check=ok`, `user_version=7`, FK empty, salvage absent, owner counts unchanged.

Durable copies (not live):

```
~/.openclaw/recovery/project87-ronan-20260816T0028PDT/openclaw.recovered-cleaned.sqlite
~/.openclaw/recovery/project87-ronan-20260816T0028PDT/openclaw.recovered-preclean.sqlite
```

## Prior repaired candidate (independent copy)

Backup: `~/.openclaw/backups/ronan-sqlite-repair-20260815T090547Z/`

| File                             | SHA-256             | Size        | Notes                                                    |
| -------------------------------- | ------------------- | ----------- | -------------------------------------------------------- |
| `openclaw.sqlite` (prior source) | `25b4ac6f…52ac33c0` | 102,354,944 | `user_version=6`; `quick_check`: Freelist 578 vs 580     |
| `openclaw.repaired.sqlite`       | `ff9dd266…6e6ecf3`  | 75,497,472  | `user_version=6`; `integrity_check=ok`; FK 0; freelist 0 |

The prior source is the same **freelist-header** family as today, one day earlier, at schema v6. The prior repaired file is clean but is **not** a v7 `6b09` image:

- still has retired `commitments`;
- missing later lazy-additive tables present on the incident image (`cron_run_receipts`, `cron_store_epochs`, `device_pairing_join_codes`, `gateway_origin_device_tokens`, `projects`, `secret_store_entries`, `user_preferences`);
- `cron_run_receipts` is absent (incident has 2 rows).

Count deltas, cleaned recover minus prior repaired (not a simple rewind):

| Owner                       | Incident / recover | Prior repaired | Delta |
| --------------------------- | ------------------ | -------------- | ----- |
| `channel_ingress_events`    | 5177               | 5174           | +3    |
| `delivery_queue_entries`    | 106                | 115            | −9    |
| `plugin_state_entries`      | 6043               | 6005           | +38   |
| `task_runs`                 | 1656               | 1657           | −1    |
| `task_delivery_state`       | 76                 | 81             | −5    |
| `worker_session_placements` | 2                  | 0              | +2    |
| `device_pairing_paired`     | 1                  | 1              | 0     |
| `session_state_heads`       | 91                 | 91             | 0     |
| `session_watch_cursors`     | 74                 | 74             | 0     |
| `audit_events`              | 76547              | 77190          | −643  |
| `cron_run_receipts`         | 2                  | (table absent) | n/a   |
| `gateway_boot_lifecycle`    | 2                  | 9              | −7    |

Prior repaired is therefore an older schema plus a mixed count vector, not a clean ancestor of the `23:58` image. Using it would require a v6→v7 commitments retirement on first start and would drop the two `cron_run_receipts` plus current placements.

## Strategy comparison

### A. Prior repaired `ff9dd266…` (rejected)

- **Loss/duplication:** not a rewind. Ingress almost tied; delivery/task-delivery/audit/boot/skill_lifecycle/subagent counts are _ahead_ of the incident image (stale-delivery / extra-audit risk). Missing v7 lazy tables and two cron receipts. Catalog older (`length` 1,162,229 vs 1,169,691).
- **Schema vs `6b09`:** `user_version=6` plus `commitments`. Startup can migrate, but that mixes recovery with schema mutation.
- **Use only if** recover is rejected and a v6 start is explicitly accepted.

### B. Current `.recover` cleaned candidate (selected)

- **Loss/duplication:** product counts match the incident image. Proven extra bytes are 33 unidentified salvage rows, dropped. Catalog blob length matches the corrupt copy; payloads are not byte-proven beyond count/length consistency.
- **Schema vs `6b09`:** `user_version=7`. Extra salvage removed. Journal after VACUUM is `delete`; Gateway open will move it to WAL.
- **Owners to reconstruct:** none required for counts. Catalog refresh is optional.
- **Rollback:** frozen corrupt inode + prior repaired + pre-cleanup recover remain.
- **Mutation prereq:** explicit human-pet gate naming `30940a6e…4cbb28d`. Procedure: `reports/project87-ronan-state-recovery-workorder.md`.

### C. Fresh state reconstruction (last resort)

- Empties every shared-state owner (ingress, delivery, plugin KV, tasks, placements, pairing, session linkage). Highest operational loss. Only if A and B are both rejected.

## Recurrence (no overclaim)

Compare three closed facts:

1. **This incident:** freelist header 267 vs 274 after V8 heap OOM; Gateway fail-closed on `assertSqliteIntegrity` (`src/infra/sqlite-integrity.ts`, called from `src/state/openclaw-state-db.ts` on open).
2. **Prior Ronan repair (`20260815T090547Z`):** freelist header 578 vs 580 on a v6 source. Same class of inconsistency, different numbers, no OOM attached to that file.
3. **Cael #1261:** overflow-list length 5 vs 286 on `model_catalog_remote` tree 146, plus 99 unused pages. Different physical shape. Cael stayed HTTP-green until stopped; Ronan died and then refused restart.

What the bytes and logs support:

- Process death is the configured V8 heap ceiling, not host RAM (issue text: ~79 GiB free after fail). NVIDIA `NV_ERR_NO_MEMORY` lines at `00:02:16` are contemporaneous and not the Gateway abort reason.
- Journal shows repeated `[sqlite/transaction] slow SQLite transaction hold` through `00:02:13`, then heap OOM at `00:02:18`. Last main-file mtime is `23:58:56`. Frozen WAL is empty.
- Empty WAL does **not** prove a clean checkpoint of the freelist header. A freelist mismatch can already be in the main file.
- Startup fail-closed is working as designed: `PRAGMA integrity_check` is not `ok`, so open throws `SqliteIntegrityError`.

What is **not** proven:

- That the OOM write or missing checkpoint _introduced_ the 267/274 break (the prior seat already had a freelist mismatch).
- That slow transactions or transcript rotation corrupted the file.
- That catalog, plugin KV, or ingress payloads are byte-identical to the pre-damage image.
- A product root cause or a fleet-wide SQLite bug.

Keep memory-pressure cause, physical corruption, and fail-closed behavior as separate claims.

## Deliverables

- `reports/project87-ronan-state-recovery-metrics.json`
- `reports/project87-ronan-state-recovery-counts.csv`
- `reports/project87-ronan-state-recovery-workorder.md`
- No PR. No live mutation. No full suite (artifact analysis; prior suites breached live-home isolation).

## Validation commands (copies only)

```
sha256sum ~/.openclaw/recovery/project87-ronan-20260816T0028PDT/openclaw.sqlite
# 98b7a91bb71830f3b415200f88c5fb52b4f96b74393119fe16a947898ecbaef0

# recover required 3.53.4 + sqlite_dbpage on aarch64
sqlite3-3530400 "file:$COPY?immutable=1" .recover | sqlite3-3530400 recovered.sqlite
sqlite3-3530400 recovered.sqlite "PRAGMA integrity_check; PRAGMA user_version;"
# ok / 7

# cleaned
DROP TABLE IF EXISTS lost_and_found; PRAGMA user_version=7; VACUUM;
# 30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d
```

Unit remained `failed` / `NRestarts=6`. Live DB inode was not opened with SQLite.
