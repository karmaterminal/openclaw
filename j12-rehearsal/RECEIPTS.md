# Jump 12: agent-DB 38 → 39 → 40 and Doctor backup → restore on the fleet's live schema shapes

Bound to karmaterminal/openclaw-bootstrap#1727. The inputs are schema text only and every row is
synthetic. No seat, no real database, and no prince content was touched.

## Verdict

All four live textual shapes of the fleet's schema-38 agent database (cael; ronan and silas;
elliott; emeric and rune) migrate to 40 through the j12 candidate `5296daff0c` with no source change
and no cut blocker. Each shape rebuilds byte for byte: 116/116 executed objects and 23/23
module-created shadow tables, and the rebuilt file's own dump has the input file's sha256. Doctor's
preflight and version phase, as systemd activation drives them, take the ordinary 38 history (plan
`shapeVersion 38`, crossing 39 and 40, no fork-39 bridge). They change exactly one catalog entry,
the `transcript_events` payload CHECK, to upstream 39's widened form, and exactly one row, the
`schema_meta` primary version. Every other stored byte stays the same across 72 tables, including
shadow, vec0 and planner-statistics tables, and the product's own scope witness holds. Integrity and
foreign-key checks are clean. The activation tail, a second Doctor run, two schema-owner passes and
two ordinary Gateway opens at 40 change nothing. Doctor's scoped backup covers `schema_meta`,
`session_recipient_authority` and `transcript_events`; restoring it returns the exact predecessor
(188 catalog entries, 72 tables, `user_version 38`) after the version phase and after the full
activation sequence, and the restored store migrates again. The U12 build refuses the migrated store
on both its ordinary open and its Doctor preflight (`newer-schema`), and leaves it unchanged. One
conditional precondition remains, detailed below: a scoped rollback loses any legacy entry-local
recipient epoch still held in `session_nodes`. Run the read-only count on each seat before it
crosses; zero makes the rollback exact.

## Named refs

| category           | ref                                          | full SHA                                   | identity                                                                                                             |
| ------------------ | -------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| product / base     | `codeagent/absorb-8083-j12` (j12 candidate)  | `5296daff0cf652df05f4eb2f9edcc4e7dd7587e3` | local = tracking = server (`git ls-remote`)                                                                          |
| lane (safe branch) | `codeagent/j12-live-shape-rehearsal`         | the commit holding this file               | branched from the candidate; adds only `j12-rehearsal/` (`git diff --name-only 5296daff0c..HEAD` lists nothing else) |
| upstream control   | U12                                          | `b8b054c13ae859b9ab14d31c5fec90078141e327` | ancestor of the candidate; run from a detached temporary worktree, removed afterwards                                |
| CI / workflow      | N/A                                          | N/A                                        | focused-only lane: no Mode-B, no pnpm (workorder)                                                                    |
| presentation       | N/A                                          | N/A                                        | no PR                                                                                                                |
| docs / proof       | this file and `receipts/` on the lane branch | lane head                                  | inputs below                                                                                                         |

## Inputs (`/home/figs/.local/state/frond-scribe/j12-live-schema-shapes/`, `sha256sum -c SHA256SUMS` OK)

| file                        | sha256                                                             | seats (SEAT-MAP.txt) |
| --------------------------- | ------------------------------------------------------------------ | -------------------- |
| `fleet38-shape-cael.sql`    | `c4c666e928b4f7dfb47ef967245affb6e2c23b1e1b8e5137560609349357325a` | cael                 |
| `fleet38-shape-ronan.sql`   | `de253e24a93ffeb67d5aedb6e40e6ccc66b4f1418a3e50158742b34919c85f41` | ronan, silas         |
| `fleet38-shape-elliott.sql` | `e56cd13c79e5b96de9b0e65a128a9ca5ae7ec2ae120bebbc6358bc6d56f5c5e9` | elliott              |
| `fleet38-shape-emeric.sql`  | `e063b87391b6dc1c471afd59226c1386a8861746a73630a7d82b55c8a7110019` | emeric, rune         |

`schema_meta.keys.txt`: `primary` (38), `historical-transcript-directives-v1` (1),
`media-transcript-archive-verification-v1` (1).

## Environment

- Host ronan (aarch64), Node v26.9.0, `node:sqlite` SQLite 3.53.4, sqlite-vec v0.1.9
  (`sqlite-vec-linux-arm64`).
- Dependencies: a hardlinked (`cp -al`) copy of the exact-lock install in
  `WORKTREES/openclaw-absorb-8083-j12`. Its `pnpm-lock.yaml` sha256 is `a4623b23…`, the same for
  the candidate and U12. No `pnpm` ran in either worktree.

## Method (`live-shapes.rehearsal.ts`, run under the repository's vitest runner)

1. **Build.** Parse the dump, verify its sha256 against `SHA256SUMS`, and create a fresh file:
   `auto_vacuum=INCREMENTAL`, `journal_mode=WAL`, sqlite-vec loaded on the build handle only.
   - Execution order: tables, virtual tables (FTS5 ×4, vec0 ×1), indexes, triggers, views. The 23
     shadow tables are never executed; SQLite and sqlite-vec create them.
   - Stamp `user_version=38`. Insert `schema_meta`: `primary` (38, `2026.10.7`, role `agent`, agent
     `main`) plus the two bookkeeping keys at version 1 with synthetic values.
   - Receipts: per-object equality, plus a re-serialization of the built file in the input's own
     format compared with the input file's sha256.
2. **Seed** synthetic rows, with foreign keys on and clean:
   - three `session_nodes` and four `session_windows`;
   - `transcript_events` in the three forms the 38 CHECK admits, prepared by the product's payload
     encoder: identity JSON, identity JSON with navigation, and zstd with navigation;
   - their identities and active events;
   - two `session_recipient_authority` rows;
   - one complete cold archive held as one chunk;
   - rows in tables outside the backup scope: memory chunk (FTS5 trigger), vec0 embedding, memory
     source, standing intent, transcript FTS row, cache entry;
   - `ANALYZE main` (76 `sqlite_stat1` rows).

   The exact content of every row is in `receipts/<shape>.json` under `seeded`.

3. **Migrate** in an isolated OpenClaw state (`withOpenClawTestState`: temp HOME and
   `OPENCLAW_STATE_DIR`), as `src/cli/gateway-cli/systemd-activation.ts` does under one maintenance
   scope:
   - `prepareDoctorDatabasePreflight`;
   - `prepareDoctorDatabaseMigrations` (scoped backup, version phase, backup completion);
   - `discovery.versionMigrations`;
   - `prepareOpenClawStateDatabaseSchema(…, "doctor")`;
   - `migrateLegacyMediaPersistence({ preparedDiscovery })`.

   The version phase alone runs inside the product's undeclared-table witness
   (`assertSqliteMigrationScopePreserved`). Pass-through recorders log the real
   `planAgentFleetSchemaHistory`, `planAgentFork39Bridge` and `withAgentFork39BackupCrossing`
   decisions.

4. **After migration.** Run activation again; it finds nothing pending. Then run
   `ensureOpenClawAgentDatabaseSchema` twice under the maintenance lease, and
   `openOpenClawAgentDatabase` twice, reading the authority and transcript rows through it.
5. **Restore** on a fresh copy, through `restoreDoctorMigrationBackup` (the
   `openclaw database restore-migration-backup` owner), with a catalog and byte-level comparison
   against the predecessor:
   - after the version phase alone, then running Doctor again on the restored store;
   - after the full activation sequence.
6. **Edge probe** (cael shape): the same flow with one legacy entry-local epoch in `session_nodes`.
7. **U12** (`u12-refusal/u12-refusal.probe.ts`, run inside a detached U12 checkout): stage each
   migrated copy, then call U12's `openOpenClawAgentDatabase` and its
   `prepareDoctorDatabasePreflight`.

## Results per shape

All four rows are identical except for input digests and file names. Columns:

- **build**: executed objects byte-equal, then shadow tables byte-equal.
- **dump = input**: the rebuilt file's own dump has the same sha256 as the input file.
- **migration**: changes against the predecessor.
- **restore (version phase)** and **restore (after activation)**: catalog entries and tables compared,
  then the differences found.
- **U12**: its ordinary open and its Doctor preflight.

| shape   | build             | dump = input | migration                                      | restore (version phase) | restore (after activation) | U12                 |
| ------- | ----------------- | ------------ | ---------------------------------------------- | ----------------------- | -------------------------- | ------------------- |
| cael    | 116/116 and 23/23 | yes          | 1 catalog entry, 1 row (`schema_meta` primary) | 188 / 72, no diff       | 188 / 72, no diff          | refused, both paths |
| ronan   | 116/116 and 23/23 | yes          | same                                           | 188 / 72, no diff       | 188 / 72, no diff          | refused, both paths |
| elliott | 116/116 and 23/23 | yes          | same                                           | 188 / 72, no diff       | 188 / 72, no diff          | refused, both paths |
| emeric  | 116/116 and 23/23 | yes          | same                                           | 188 / 72, no diff       | 188 / 72, no diff          | refused, both paths |

Migration assertions, held for every shape:

- **Doctor preflight:**
  - `incompatible`, `indeterminate` and `agentRefusals` are empty.
  - One pending migration: `{kind: agent, agentId: main, foundVersion: 38, supportedVersion: 40}`.
  - Target source `configured`.
  - Version phase warnings `[]`.
  - The changes list the saved scoped agent backup, the saved full shared-state backup, and
    `Upgraded agent database schema … v38 -> v40`.
- **Plan:**
  - `[{previousVersion: 38, targetVersion: 40, shapeVersion: 38, crosses: [39, 40]}]`.
  - Fork-39 bridge: `[{bridged: false}]`.
  - Backup crossing from 38 (unchanged).
  - The bridge only considers a database at 39, so "not bridged" is structural at 38. It is still
    the real call's recorded answer.
- **Scoped backup** archive tables: `schema_meta, session_recipient_authority, transcript_events`.
  These equal `resolveSchemaMigrationBackupTables(38 → 40)`.
- **Version phase:**
  - Catalog: only `table transcript_events: sql changed`.
  - Tables: only `schema_meta: content changed`. The bookkeeping rows are byte-equal; the primary
    row has `schema_version 40`, `app_version 2026.10.9` and the original `created_at`.
  - `session_recipient_authority` rows are byte-equal.
  - The witness reported no undeclared-table change.
- **`transcript_events` CHECK:**
  - The prior form before, the widened form after. Neither form's text appears inside the other, so
    a table holding both would read as `both`. The navigation-only insert below would fail if the
    prior CHECK survived, so its acceptance rules that out on its own.
  - Inserting a navigation-only payload into scratch copies: the migrated 40 store accepts it; the
    predecessor 38 store fails with `CHECK constraint failed`.
- **Activation tail:**
  - `prepareOpenClawStateDatabaseSchema` and `migrateLegacyMediaPersistence` produced no changes,
    warnings or notices.
  - The tail ran one same-version schema-owner pass on the store (`40 → 40`, no crossings) and
    registered it.
  - The store's catalog and content are unchanged.
- **Final state:**
  - `user_version 40`, `schema_meta` primary 40.
  - `PRAGMA integrity_check` returns `ok` (on a plain handle without sqlite-vec, as on a seat).
  - `PRAGMA foreign_key_check` returns `[]`.
- **Doctor again:** nothing pending. The schema owner ×2 and the Gateway open ×2 change nothing.
- **Restored store:**
  - `user_version 38`, integrity `ok`, foreign keys clean.
  - The restored store migrates again; Doctor reuses the same backup group.

## Finding: legacy entry-local recipient epochs fall outside the 40 step's backup scope

- **Scope and effect.**
  - `SCHEMA_MIGRATION_BACKUP_TABLES.agent[40]` is `["session_recipient_authority"]`, with the
    comment "the authority step only creates its table".
  - But `migrateSessionRecipientAuthorityInTransaction` also rewrites `session_nodes.entry_json`
    whenever an entry still carries the unshipped `recipientAuthorityEpoch` field. It moves a valid
    epoch into the authority table and strips the field.
- **Evidence** (`receipts/edge-legacy-epoch.json`):
  - The product's own scope witness fires: `Migration changed undeclared tables: session_nodes:
    content changed`.
  - Doctor reports no warning.
  - After the scoped restore, `session_nodes` still lacks the field and the authority table no
    longer holds the moved epoch. The epoch is gone.
- **Live relevance.**
  - No current writer produces the field. The repository's only reference is the migration itself.
  - The fleet's stores already went through the fleet 25/26 authority step, which ran the same
    import.
  - So the expected live count is zero, but schema-only inputs cannot prove it.
- **Precondition per seat** before crossing, read-only and on the seat's own database:

  ```sql
  SELECT count(*) FROM session_nodes WHERE entry_json LIKE '%recipientAuthorityEpoch%';
  ```

  Zero makes the scoped rollback exact for this step. A non-zero count needs a full-image backup
  for that seat, or a product change: declare `session_nodes` in the 40 scope, or have Doctor warn.
  Product source is out of this lane's scope; recorded as a follow-up.

## Gaps and accepted limits

- **Schema-only inputs.**
  - The live files' `auto_vacuum`, `page_size`, journal mode, real row volumes and planner
    statistics are unknown. The build assumes the product's creation pragmas (incremental
    auto-vacuum, WAL) and seeds a few rows per table.
  - The live seats' sqlite-vec version is unknown. All four shapes' vec0 shadow DDL is byte-equal
    to what v0.1.9 creates.
- **Doctor custody.**
  - The maintenance scope is the test-support scope Doctor's own migration tests use
    (`withMaintenance`), not `beginDoctorMaintenance`'s service and state-owner custody.
  - `assertRepairable` is not called; the preflight output it checks is asserted clean instead.
- **Interactive `doctor --fix`.** Its `prepareDoctorMigrationBackups` path is not rehearsed: an
  updater's verified snapshots can replace the scoped backup there, and heartbeat retirement adds
  full backups. The rehearsed sequence is systemd activation's.
- **Shared state database.**
  - Doctor also saved a full image of the shared state database beside it. Only the agent store's
    scoped restore is exercised.
  - The state database here is a fresh current one; a live state-schema crossing, if j12 has one,
    is not covered.
- **Witness connection.** The witness keeps one extra connection open during the version phase.
  The restore cases run without it and agree.
- **Edge probe** runs the version phase only.

## Exact commands

```bash
# Inputs
cd /home/figs/.local/state/frond-scribe/j12-live-schema-shapes && sha256sum -c SHA256SUMS

# Dependencies for the lane worktree (no pnpm): hardlink the same-host exact-lock install
cd /home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-j12-live-shape-rehearsal
SRC=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-absorb-8083-j12
rm node_modules   # the setup hook's symlink to the stale source/openclaw install
(cd "$SRC" && find . -maxdepth 3 -name node_modules -not -path './node_modules/*') |
  while read -r p; do [ -d "$(dirname "$p")" ] && cp -al "$SRC/$p" "$p"; done

# Rehearsal (17 cases; writes receipts/<shape>.json and receipts/edge-legacy-epoch.json)
rm -rf /tmp/j12-live-shape-work && mkdir -p /tmp/j12-live-shape-work
J12_WORK_DIR=/tmp/j12-live-shape-work node scripts/run-vitest.mjs run \
  --config j12-rehearsal/vitest.rehearsal.config.ts --maxWorkers=1 \
  j12-rehearsal/live-shapes.rehearsal.ts

# U12 refusal, from a detached U12 checkout with the same lockfile
U12=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-j12-live-shape-u12
git worktree add --detach "$U12" b8b054c13ae859b9ab14d31c5fec90078141e327
SRC=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-absorb-8083-j12-up
(cd "$U12" && rm -f node_modules && (cd "$SRC" && find . -maxdepth 3 -name node_modules -not -path './node_modules/*') |
  while read -r p; do [ -d "$(dirname "$p")" ] && cp -al "$SRC/$p" "$p"; done)
mkdir -p "$U12/j12-u12-refusal" && cp j12-rehearsal/u12-refusal/* "$U12/j12-u12-refusal/"
(cd "$U12" && J12_WORK_DIR=/tmp/j12-live-shape-work J12_U12_RECEIPT=/tmp/j12-u12-refusal.json \
  node scripts/run-vitest.mjs run --config j12-u12-refusal/vitest.u12.config.ts --maxWorkers=1 \
  j12-u12-refusal/u12-refusal.probe.ts)
git worktree remove --force "$U12"
```

The committed `receipts/u12-refusal.json` is the probe's raw output with three changes:

- the checkout path is replaced by `<u12-checkout>`;
- the U12 commit is added;
- each shape is linked to the rehearsal's `migratedCopy.sha256`. All four `sameStoreAsRehearsal`
  are true.

Both receipts come from the same run.

## Receipts

- `receipts/<shape>.json` holds these sections:
  - `input`;
  - `build`: per-object and shadow equality, regenerated dump digest, sqlite and sqlite-vec
    versions;
  - `seeded`: every table's row count and digest, plus the decoded seeded rows;
  - `migration`: Doctor preflight and changes, plan, bridge, backup crossing, scope, CHECK probe,
    catalog and table diffs, `schema_meta` before and after;
  - `activationTail`;
  - `afterActivation`: rerun, schema owner, ordinary opens, final diff against the pristine store;
  - `backupRestore` (version phase, plus re-migration);
  - `backupRestoreAfterActivation`;
  - `migratedCopy`.
- `receipts/edge-legacy-epoch.json` is the conditional finding above.
- `receipts/u12-refusal.json` holds U12's two refusal messages, its preflight error
  (`newer-schema`, `gateway.maintenance_required`) and the unchanged store digests.
