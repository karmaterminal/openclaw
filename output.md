# Cael shared-state recovery analysis

Bound issue: [karmaterminal/openclaw#1261](https://github.com/karmaterminal/openclaw/issues/1261)
Parent: [karmaterminal/openclaw#1254](https://github.com/karmaterminal/openclaw/issues/1254)
Sibling (not this defect): [karmaterminal/openclaw#1257](https://github.com/karmaterminal/openclaw/issues/1257) (multi-GB agent transcript read latency)
Exact runtime composite: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Analyst: Grok 4.6
Lane: `codeagent/cael-state-db-recovery-analysis`

This report is public-safe. No message payloads, credentials, prince memory, or private identifiers.

## Verdict

The preserved Cael shared-state snapshot is physically inconsistent. Offline `PRAGMA integrity_check` on a hash-verified copy reports one overflow-list mismatch on tree 146 (`model_catalog_remote`) plus 99 unused pages. SQLite `.recover` into a new file yields `integrity_check=ok` at `user_version=7` (the `6b09` / package `openclaw.schemaVersions.state` contract). All product table counts match the corrupt image except an empty reconstructed catalog row and a 204-row non-product `lost_and_found` salvage table.

**Selected strategy executed** under gate comment `5306199372`. Candidate `4a92bb50…e29ed8fc` is now live. Corrupt inode preserved as `openclaw.sqlite.incident-held-20260816` (`9a6617ba…818831`). Gateway started on exact `6b09`; `NRestarts=0`. Copy integrity `ok` / `user_version=7`. Discord connected. Nonce speech proof remains pending for scribe. No fleet-cure claim.

No introducing write is identified. Do not claim a corruption root cause.

## Containment freeze (observed, not mutated)

| Fact                         | Value                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| Cael unit                    | `openclaw-gateway.service` user unit, `inactive/dead`                      |
| `NRestarts`                  | `0`                                                                        |
| Stopped at                   | `2026-08-15 19:34:56 PDT`                                                  |
| Live DB                      | present, size `47599616`, mtime `2026-08-15 11:47:10 PDT`, mode `600`      |
| Live WAL/SHM                 | absent after stop                                                          |
| Preserved snapshot           | `cael-state-corrupt-20260816T023456Z`                                      |
| Snapshot DB SHA-256          | `9a6617baf51cd083dc9c96852fcf4c7803bb6dfd4891865ad8609a3584818831`         |
| Snapshot SHM SHA-256         | `fd4c9fda9cd3f9ae7c962b0ddf37232294d55580e1aa165aa06129b8549389eb`         |
| Snapshot WAL SHA-256         | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty) |
| Local copy hash              | identical to remote snapshot DB hash                                       |
| SQLite CLI                   | `3.53.4`                                                                   |
| `user_version`               | `7`                                                                        |
| SQLite `schema_version`      | `277` (corrupt) / `267` (recovered rebuild)                                |
| Page size / count / freelist | `4096` / `11621` / `198`                                                   |
| `schema_meta.primary`        | role `global`, schema `7`, app `2026.8.1`                                  |

Gateway remained stopped for the entire analysis. No live SQLite write, WAL/SHM deletion, restore, or restart was performed.

## Physical findings (copied artifacts only)

- `PRAGMA integrity_check(1)` and `quick_check` both start with:
  `Tree 146 page 146 cell 0: overflow list length is 5 but should be 286`
- Full `integrity_check`: 101 result lines = 1 overflow mismatch + 99 `Page N: never used` (`11341`–`11439`). The issue text said “thousands of orphan/unused pages.” The offline checker did **not** emit orphan-page wording; unused-page count is **99**.
- Tree 146 root is table `model_catalog_remote` (`src/model-catalog/remote-store.ts`, lazy additive cache, single-row `id=1` plus large `bundle_json`).
- `COUNT(*)` on that table returns `1` on the corrupt copy; any column read fails with `database disk image is malformed`.
- `dbstat` also fails with `database disk image is malformed`.
- Foreign-key check: 0 violations on corrupt, recovered, and both latest clean priors.
- Product table `COUNT(*)` values on the corrupt copy all succeeded and match recovered counts.

`.recover` candidate:

| Fact              | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| SHA-256           | `1b2918286dfee6d1780201f6b140c4e72d639ef6a484f9deceb3f0fbace9a94a` |
| Size              | `38760448`                                                         |
| `user_version`    | `7`                                                                |
| `integrity_check` | `ok`                                                               |
| `quick_check`     | `ok`                                                               |
| Tables / indexes  | 133 / 271 (extra table is `lost_and_found`)                        |
| Catalog row       | present, `bundle_json` length `0`, timestamps `0`                  |
| `lost_and_found`  | 204 rows, 23 unmapped `rootpgno` values, none equal to 146         |

The empty catalog row is cache, not speech state. `lost_and_found` is SQLite salvage, not an OpenClaw owner.

### Phase 1 worker cleanup (2026-08-16T06:27Z)

New destination only. Source hashes re-verified. Rebuilt from the prior immutable `.recover` SQL dump, then:

`DROP TABLE IF EXISTS lost_and_found;` `DELETE FROM model_catalog_remote;` `PRAGMA user_version=7;` `VACUUM;`

| Fact                                                       | Value                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| SHA-256                                                    | `4a92bb50ecaf562017950e3605454ce883ecea4515c69ac361e84127e29ed8fc` |
| Size                                                       | `37801984`                                                         |
| `user_version` / SQLite `schema_version`                   | `7` / `269`                                                        |
| Pages                                                      | `9229` × `4096`, freelist `0`, journal `delete`                    |
| `integrity_check` / `quick_check`                          | `ok` / `ok`                                                        |
| `foreign_key_check`                                        | 0 rows                                                             |
| `model_catalog_remote`                                     | table present, `COUNT(*)=0`                                        |
| `lost_and_found`                                           | absent                                                             |
| Owner counts vs `recovery-row-counts.csv` recovered column | exact match (catalog expected 0 after DELETE)                      |
| Cael                                                       | not contacted                                                      |

Receipt: `phase1-receipt.json`. Phase 2+ (copy/stage/cutover/start) was not run.

## Prior snapshots (metadata/hash only)

Verified-clean **shared-state** candidates (`integrity_check=ok`, `user_version=7`):

| Snapshot                                   | Size     | SHA-256             | Notes                                                                                           |
| ------------------------------------------ | -------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `cael-manual-recovery-20260815T064304Z`    | 46276608 | `77daa71a…3d6883d4` | newest clean v7; same row counts as next row                                                    |
| `cael-ingress-palliative-20260815T043719Z` | 46276608 | `d3e49034…1de9f139` | also clean v7; different bytes, identical counts                                                |
| `cael-ingress-palliative-20260814T184649Z` | 45563904 | `46e49c33…70f73f29` | clean but `user_version=6` plus retired `commitments`; receipt recorded `snapshot_integrity=ok` |

Older / non-restore-primary:

- `cael-state-pre-surgery-20260812T163927-0700` 81 MiB plus empty prior `.recover` trial (`sql error: no such table: sqlite_dbpage`).
- Live-state sidecars (hashed, not opened as live current DB): `precorrupt-061317` (103 MiB, name records an earlier corruption event), deadletter-proof 103 MiB, June/July smaller baks.
- Agent/memory/Codex sqlite under `agent-recovery/` inventoried by hash only; not used here.

Incident window vs newest clean restore: last live DB mtime `2026-08-15 11:47 PDT` minus manual snapshot mtime `2026-08-14 23:15 PDT` ≈ 12.5 h of later row growth on the recovered/corrupt image.

Recovered-minus-manual (counts only): ingress `+139`, `plugin_state_entries` `+134`, `worker_session_placements` `+39`, `cron_run_receipts` `+25`, `audit_events` `+837`, `task_runs` `+8`, `task_delivery_state` `-17`. See `recovery-row-counts.csv`.

## Strategy comparison

### A. Latest verified-clean restore (`…064304Z`)

- **Loss/duplication:** rewind ~12.5 h of ingress/session/plugin/worker/cron/audit rows. `task_delivery_state` would be 17 rows _ahead_ of the incident image (stale delivery risk / possible duplicate sends after restart). Catalog cache intact (~1.17 MiB).
- **Schema vs `6b09`:** `user_version=7`, compatible. `schema_meta` startup-migration fingerprint is older than the incident image.
- **Owners to reconstruct:** Discord ingress after 23:15 PDT 14 Aug; plugin KV deltas; worker placements; cron receipts; any task-delivery rows created after the snapshot.
- **Rollback:** keep corrupt snapshot + recovered candidate untouched.
- **Validation:** integrity, FK, `user_version=7`, owner counts, nonce Discord speech after start.
- **Mutation prereq:** explicit gate; stage beside live; no in-place overwrite.

### B. `.recover` candidate (selected)

- **Loss/duplication:** product table counts match the incident image. Proven payload loss is the remote catalog blob (rebuildable). 204 salvage rows are unidentified fragments and must not be loaded as product state. Other payloads are not byte-proven; they are count-consistent and readable after recover.
- **Schema vs `6b09`:** `user_version=7`. Extra `lost_and_found` is not in the canonical schema. Journal mode after import is `delete`; Gateway open will move it to WAL.
- **Owners to reconstruct:** `model_catalog_remote` only (network catalog refresh). Optionally inspect/drop salvage.
- **Rollback:** preserved corrupt snapshot + both clean v7 priors remain.
- **Validation:** integrity `ok`, drop salvage, empty catalog, owner counts vs this report, then mutation-gated start ladder.
- **Mutation prereq:** same as A, plus post-recover cleanup on the _candidate only_.

### C. Fail-closed fresh rebuild

- **Loss/duplication:** all shared-state owners empty. Pairing, plugin KV, ingress, delivery, tasks, cron receipts, worker placements must be rebuilt from external owners (Discord, config, catalog URL). Lowest silent-corruption risk; highest operational loss.
- **Schema vs `6b09`:** new DB at `user_version=7` is the intended contract.
- **Owners to reconstruct:** every shared-state owner listed in the issue (ingress, delivery, tasks, placements, session links, device pairing, memory cron/plugin state).
- **Rollback:** restore preserved corrupt or clean snapshot files.
- **Use only if** recover+restore are both rejected.

## `/health` stayed 200

This is a contract mismatch, not a failed probe.

1. `GET /health` and `/healthz` are classified `live` in `src/gateway/gateway-http-route-contracts.ts`.
2. `handleGatewayProbeRequest` returns HTTP 200 `{ok:true,status:"live"}` whenever the HTTP server is up (`src/gateway/server-http-probes.ts`). It does not open SQLite.
3. Docs state the same: `/health` means process liveness (`docs/gateway/health.md`).
4. `/readyz` checks channel accounts, not shared-state integrity (`src/gateway/server/readiness.ts`).
5. HTTP listen happens _before_ the integrity verifier sidecar is registered (`src/gateway/server-startup-finish.ts`).
6. The verifier waits 5 minutes, then 24 h (`OPENCLAW_DATABASE_VERIFY_INITIAL_DELAY_MS`). Failure quarantines later opens; it does not flip `/health`.

A small product fossil is warranted: health/readiness should surface a proven unusable shared-state DB. Do not implement it in this lane. See `product-followups.md`.

## Twin search (not root-cause)

No public twin of this exact overflow-list text was found. Related families:

- [openclaw/openclaw#101290](https://github.com/openclaw/openclaw/issues/101290) / [#124045](https://github.com/openclaw/openclaw/issues/124045) / [#119583](https://github.com/openclaw/openclaw/issues/119583): CLI/status/preflight opening the live state DB beside a running Gateway.
- [openclaw/openclaw#94229](https://github.com/openclaw/openclaw/issues/94229): `plugin_state_entries` corruption.
- [openclaw/openclaw#114534](https://github.com/openclaw/openclaw/issues/114534): Telegram spool fail-open when state DB is corrupt.
- [openclaw/openclaw#71689](https://github.com/openclaw/openclaw/issues/71689): task-registry restore on a malformed image.
- Fork #1261 is the only exact Cael shared-state physical incident in `karmaterminal/openclaw`.

These show the product already has shared-state corruption and fail-open neighbors. They do not identify the write that damaged tree 146.

## Causal language

- **Proven:** the copied incident file fails integrity on `model_catalog_remote` overflow; Gateway liveness HTTP cannot observe that; recover produces a v7-clean candidate with an empty catalog cache and salvage rows.
- **Not proven:** which process, pragma, catalog refresh, CLI, or concurrent writer introduced the overflow-list break. Earlier `precorrupt-061317` only proves Cael has seen named corruption events before.
- **Not claimed:** that unused pages are “orphans,” that recover reconstructed catalog bytes, or that every non-catalog payload is byte-identical to the pre-damage image.

## Deliverables

- `recovery-metrics.json`, `recovery-row-counts.csv`
- `recovery-workorder.md` (mutation-gated)
- `product-followups.md`
- No PR

## Validation

Analysis (copied artifacts only):

```
sha256sum snapshot/openclaw.sqlite
# 9a6617baf51cd083dc9c96852fcf4c7803bb6dfd4891865ad8609a3584818831
sqlite3 "file:…/corrupt-immutable.sqlite?immutable=1" "PRAGMA quick_check; PRAGMA integrity_check; PRAGMA user_version;"
sqlite3 "file:…/corrupt-immutable.sqlite?immutable=1" ".recover" | sqlite3 recovered.sqlite
sqlite3 recovered.sqlite "PRAGMA integrity_check; PRAGMA user_version;"
# ok / 7
```

Full sanctioned suite on this docs-only head (`53f7dfb6d0f` plus this closeout):

```
node --import tsx scripts/test-projects.mts
# 538 shards in 4659.82s; wrapper exit 1
# failed shard digest: 16 configs (gateway-server, ui, gateway-core, tui-pty,
# agents-core, unit-fast-isolated, auto-reply-reply, infra, unit-src,
# extension-discord, tooling x2, + 4 omitted)
```

Those reds are pre-existing on exact composite `6b09` (UI catalog icons, TUI PTY, continuation Responses, restart-stale-pids, Discord queue, session-delete rollback, proxy-capture). This lane added only public-safe analysis files and did not own those behaviors. Left classified, not repaired.

Issue comment: https://github.com/karmaterminal/openclaw/issues/1261#issuecomment-5305449089

Cael remained `inactive`, `NRestarts=0` through closeout. No PR.
