# Jump 12: agent-DB 38 → 39 → 40 and Doctor backup → restore on every live fleet schema shape

Bound to karmaterminal/openclaw-bootstrap#1727. The inputs are schema text only and every row is
synthetic. No seat, no real database, and no prince content was touched.

## Verdict

All sixteen schema shapes held by the fleet's 56 schema-38 agent databases migrate to 40 through
the j12 candidate `5296daff0c` with no source change and no cut blocker. They are the four
main-agent shapes of the first rehearsal plus twelve more. The sixteen shapes fall into six
structural classes, described below. Every shape gets the same method and the same assertions:

- **Build.** It rebuilds byte for byte (116/116 executed objects and 23/23 shadow tables, or
  108/108 and 9/9). The rebuilt file's own dump has the input file's sha256.
- **Migration.** Doctor's preflight and version phase, as systemd activation drives them, take the
  ordinary 38 history: plan `shapeVersion 38`, crossing 39 and 40, no fork-39 bridge. They change
  exactly one catalog entry, the `transcript_events` payload CHECK, to upstream 39's widened form,
  and exactly one row, the `schema_meta` primary version. Every other stored byte stays the same,
  and the product's own scope witness holds.
- **Checks.** Integrity and foreign-key checks are clean.
- **Idempotence.** The activation tail, a second Doctor run, two schema-owner passes and two
  ordinary Gateway opens at 40 change nothing.
- **Restore.** Doctor's scoped backup returns the exact predecessor after the version phase and
  after the full activation sequence. That is 188 catalog entries and 72 tables, or 163 and 58,
  at `user_version 38`. The restored store migrates again.
- **U12.** U12 refuses all sixteen migrated stores on its ordinary open and its Doctor preflight
  (`newer-schema`), and leaves each unchanged.

The legacy entry-local epoch precondition from the first rehearsal holds unchanged on the first
shape of each of the six classes. A scoped rollback loses any such epoch still held in
`session_nodes`, so run the read-only count on each seat before it crosses; zero makes the
rollback exact.

## Named refs

| category           | ref                                          | full SHA                                   | identity                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| product            | j12 candidate (workorder pin)                | `5296daff0cf652df05f4eb2f9edcc4e7dd7587e3` | exact commit, ancestor of the lane head; every case ran on it. `codeagent/absorb-8083-j12` has since moved to `352f56029dc95c60149ab4aaa127226a861d0b3d` (local = tracking = server), whose only change is one line in `scripts/pr-lib/wrapper-components.txt`, no runtime code |
| base for this lane | `codeagent/j12-live-shape-rehearsal`         | `dfa551932af36d837de886229da8a828892d5ecb` | local = tracking = server (`git ls-remote`); ancestor of the lane head                                                                                                                                                                                                          |
| lane (safe branch) | `codeagent/j12-live-shape-rehearsal-all`     | the commit holding this file               | local = tracking = server at each push; `git diff --name-only 5296daff0c..HEAD` lists only `j12-rehearsal/`                                                                                                                                                                     |
| upstream control   | U12                                          | `b8b054c13ae859b9ab14d31c5fec90078141e327` | ancestor of the candidate; run from a detached temporary worktree, removed afterwards                                                                                                                                                                                           |
| CI / workflow      | N/A                                          | N/A                                        | focused-only lane: no Mode-B, no pnpm (workorder)                                                                                                                                                                                                                               |
| presentation       | N/A                                          | N/A                                        | no PR                                                                                                                                                                                                                                                                           |
| docs / proof       | this file and `receipts/` on the lane branch | lane head                                  | inputs below                                                                                                                                                                                                                                                                    |

## Inputs (`/home/figs/.local/state/frond-scribe/j12-live-schema-shapes/`, `sha256sum -c SHA256SUMS`: 16 OK)

The shape hash in `ALL-AGENT-DB-SHAPES.txt` is the first 12 hex digits of
`grep -v '^--' <file> | sha256sum`: the dump without its `--` header lines. All sixteen files map
one to one onto the inventory's sixteen hashes, which cover all 56 lines.

| file                               | sha256                                                             | inventory hash |
| ---------------------------------- | ------------------------------------------------------------------ | -------------- |
| `fleet38-shape-cael.sql`           | `c4c666e928b4f7dfb47ef967245affb6e2c23b1e1b8e5137560609349357325a` | `f13316752f48` |
| `fleet38-shape-ronan.sql`          | `de253e24a93ffeb67d5aedb6e40e6ccc66b4f1418a3e50158742b34919c85f41` | `84722fa357fc` |
| `fleet38-shape-elliott.sql`        | `e56cd13c79e5b96de9b0e65a128a9ca5ae7ec2ae120bebbc6358bc6d56f5c5e9` | `f924f99eaacc` |
| `fleet38-shape-emeric.sql`         | `e063b87391b6dc1c471afd59226c1386a8861746a73630a7d82b55c8a7110019` | `ba075713d34e` |
| `fleet38-shape-x-037f7c86eedf.sql` | `b0501ebd3788d0de359ff0454ba9e9f310f13dae6277c8f9728790e4dbbef88e` | `037f7c86eedf` |
| `fleet38-shape-x-1c2dd97228c8.sql` | `0c93ad523d7fdebbffbd7567182ab2ebfa60612bcea63e947309b513c5bed3b9` | `1c2dd97228c8` |
| `fleet38-shape-x-2170ae4d642d.sql` | `4fa190f6d4cfb8e5db63b2fd03a8728109f7f7f50a9731b3056934dc6059dcd2` | `2170ae4d642d` |
| `fleet38-shape-x-3076322a956c.sql` | `b6048482176bce58007c99acb5bb82d900fbb62249d2899ac8c7537f8e4fa694` | `3076322a956c` |
| `fleet38-shape-x-37b222965ab5.sql` | `0d410a799a07a12e2687b371e607b105d2fcfe603ba030512a276eac86d4cc7e` | `37b222965ab5` |
| `fleet38-shape-x-420d0a605448.sql` | `fdfb5a5cb3e21fafb73a0bf6c8dcbe0d7316165300e54ceac59b9430af9400d9` | `420d0a605448` |
| `fleet38-shape-x-69f5aaa04421.sql` | `be3dd470851e5673c301ca0629a073d9d234cac211c634adee478794a80d8832` | `69f5aaa04421` |
| `fleet38-shape-x-6e53d6abeac4.sql` | `ff059c318344b9eb1b0944d03ee1903a24333b18cc67e18ffa7ecb1874b86040` | `6e53d6abeac4` |
| `fleet38-shape-x-86d3e6ac5209.sql` | `53e3bf62d315ad3e88f2e819f94cc7633bdaefe9eb1fc7a0c881b39cbb5541f5` | `86d3e6ac5209` |
| `fleet38-shape-x-978ba7aa6715.sql` | `c3aa17e4ccec4977a95a873deefa74ce93f467cf999960363b7ec411d029eaa9` | `978ba7aa6715` |
| `fleet38-shape-x-d3d8365f2501.sql` | `ae2c23df8e33660807dac02dee9840fd94302e6e7b2ed4d2f162860b9b7146d4` | `d3d8365f2501` |
| `fleet38-shape-x-eea500a249ff.sql` | `fe2e891446af99519231bb8c4fb57c04b46182e80c5d5d7eac5d9de1a5248394` | `eea500a249ff` |

`schema_meta.keys.txt`: `primary` (38), `historical-transcript-directives-v1` (1),
`media-transcript-archive-verification-v1` (1). Every header stamps `user_version=38` and primary 38. The four main shapes and `x-69f5aaa04421` carry all three keys. The other eleven lack
`media-transcript-archive-verification-v1`.

## Environment

- Host ronan (aarch64), Node v26.9.0, `node:sqlite` SQLite 3.53.4, sqlite-vec v0.1.9
  (`sqlite-vec-linux-arm64`).
- Dependencies: a hardlinked (`cp -al`) copy of the exact-lock install in
  `WORKTREES/openclaw-absorb-8083-j12`, and for U12 the one in `WORKTREES/openclaw-absorb-8083-j12-up`.
  Both lockfiles have sha256 `a4623b23…`, the same as the candidate's and U12's. No `pnpm` ran in
  any worktree.

## Method (`live-shapes.rehearsal.ts`, run under the repository's vitest runner)

The method and assertions of the first rehearsal are unchanged. What is new:

- **Shape list.** The list comes from the verified `SHA256SUMS`: the four main shapes first, then
  the hash-named ones.
- **Bookkeeping rows.** Each shape's `schema_meta` bookkeeping rows are the keys its own header
  names. The main shapes must carry every key in `schema_meta.keys.txt`.
- **vec0 seed row.** It is written only where memory search created `memory_index_chunks_vec`.
- **Classification case.** A new case classifies the shapes (next section).
- **Edge probe.** It runs on the first shape of each structural class.
- **Classifier self-check.** A new case holds the classifier's own controls.

The steps:

1. **Build.** Parse the dump, verify its sha256 against `SHA256SUMS`, and create a fresh file:
   `auto_vacuum=INCREMENTAL`, `journal_mode=WAL`, sqlite-vec loaded on the build handle only.
   - Execution order: tables, virtual tables, indexes, triggers, views. The 139-object shapes hold
     FTS5 ×4 and vec0 ×1; the 117-object shapes hold FTS5 ×2. Shadow tables are never executed;
     SQLite and sqlite-vec create them.
   - Stamp `user_version=38`. Insert `schema_meta`: `primary` (38, `2026.10.7`, role `agent`, agent
     `main`) plus the header's other keys at version 1, with synthetic values.
   - Receipts: per-object equality, plus a re-serialization of the built file in the input's own
     format compared with the input file's sha256.
2. **Seed** synthetic rows, with foreign keys on and clean:
   - three `session_nodes` and four `session_windows`;
   - `transcript_events` in the three forms the 38 CHECK admits, prepared by the product's payload
     encoder: identity JSON, identity JSON with navigation, and zstd with navigation;
   - their identities and active events;
   - two `session_recipient_authority` rows;
   - one complete cold archive held as one chunk;
   - rows in tables outside the backup scope: memory chunk (FTS5 trigger where present), vec0
     embedding (where present), memory source, standing intent, transcript FTS row, cache entry;
   - `ANALYZE main` (76 or 63 `sqlite_stat1` rows).

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
6. **Classification.** Each shape is built in memory and read back from SQLite:
   - objects;
   - per-table `pragma_table_xinfo` in column order (name, declared type, not-null, default,
     primary key, hidden);
   - each column's parsed definition without its name token, which catches CHECK, COLLATE and
     REFERENCES;
   - table constraints, foreign keys, and strict and rowid flags;
   - index, trigger, view and virtual-table DDL.

   DDL is compared with whitespace runs and plain double-quoted identifiers normalized; string
   literals keep their bytes. A difference is **textual** when the stored SQL differs but all of
   that is equal. Anything else is **structural**.

7. **Edge probe** (first shape of each class): the same flow with one legacy entry-local epoch in
   `session_nodes`.
8. **U12** (`u12-refusal/u12-refusal.probe.ts`, run inside a detached U12 checkout): stage each of
   the sixteen migrated copies, then call U12's `openOpenClawAgentDatabase` and its
   `prepareDoctorDatabasePreflight`.

## Classification against the four main shapes

Six structural classes. The case asserts the grouping, the edge-probe representatives, and that
nothing outside the axes below differs.

| class | shapes                                                                                   | DBs | objects | how it differs from class 1                                                                                 |
| ----- | ---------------------------------------------------------------------------------------- | --- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 1     | `cael`, `ronan`, `emeric`, `x-86d3e6ac5209`                                              | 6   | 139     | reference                                                                                                   |
| 2     | `elliott`                                                                                | 1   | 139     | `conversations` and `session_nodes` layouts (C, N2), five `owner_*` columns                                 |
| 3     | `x-037f7c86eedf`, `x-2170ae4d642d`, `x-3076322a956c`, `x-69f5aaa04421`, `x-6e53d6abeac4` | 41  | 117     | no memory-search objects (M)                                                                                |
| 4     | `x-1c2dd97228c8`, `x-978ba7aa6715`, `x-d3d8365f2501`                                     | 4   | 117     | M, plus the `conversations` layout (C)                                                                      |
| 5     | `x-37b222965ab5`                                                                         | 1   | 117     | M, C, plus `session_nodes` layout N5                                                                        |
| 6     | `x-420d0a605448`, `x-eea500a249ff`                                                       | 3   | 117     | M, C, `session_nodes` layout N6 with the five `owner_*` columns, and the `session_conversations` layout (S) |

The axes (column positions are SQLite `cid`s):

- **M, memory search.** The 117-object shapes lack the 23 objects memory search creates on its
  first initialization:
  - `memory_index_chunks_fts` and `memory_index_paths_fts` (FTS5, five shadow tables each);
  - `memory_index_chunks_vec` (vec0, four shadow tables);
  - the six FTS sync triggers (`*_fts_after_insert|update|delete`).

  These shapes still hold `idx_memory_index_chunks_path`, the historical index that initialization
  drops (`packages/memory-host-sdk/src/host/memory-schema.ts:526`). These stores never ran memory
  search. The agent schema owner does not own these objects.

- **C, `conversations`.** Class 1 has `delivery_target TEXT NOT NULL DEFAULT ''` as the last
  column (cid 13, an `ALTER TABLE … ADD COLUMN` history). The other classes have it inline at cid
  5 as `TEXT NOT NULL`, with no default.
- **N, `session_nodes`.**
  - Classes 1, 3 and 4: 28 columns, with `entry_valid` (cid 23) and `project_id` (cid 24)
    appended.
  - N2 (elliott): 33 columns. `entry_valid` (cid 3) and `project_id` (cid 10) are inline, and the
    five first-use `owner_*` columns (`SESSION_OWNER_COLUMN_DEFINITIONS`) are appended at cids
    25–29.
  - N5: 28 columns, `entry_valid` inline (cid 3), `project_id` appended (cid 24).
  - N6: 33 columns, `entry_valid` (cid 3), `owner_*` (cids 10–14) and `project_id` (cid 15) all
    inline.
- **S, `session_conversations`.** `route_context_json` is inline at cid 3 in class 6 and last
  (cid 5) everywhere else.

Within a class, and between `cael`, `ronan` and `emeric`, the remaining differences are textual:
the quoting of table names (`CREATE TABLE "x"` vs `CREATE TABLE x`) and indentation or line
breaks. `receipts/classification.json` lists every structural and text-only object per shape
against each main shape.

None of these tables is in the version phase's scope. Across all sixteen shapes:

- `transcript_events`, whose CHECK the 39 step widens, has byte-identical stored SQL.
- `session_recipient_authority` has byte-identical stored SQL.
- `schema_meta` has one structure and two stored texts, which differ only in quoting.

The differing tables sit outside the declared backup scope. In every shape the witness and the
byte-level table capture show them unchanged by the migration and exactly restored.

### `x-86d3e6ac5209` (ronan `local-nemotron`, 139 objects)

- **Against the other eleven new shapes.** It holds 22 more objects: the 23 memory-search objects,
  less the retired `idx_memory_index_chunks_path`.
- **Against the main shapes.** Its object set and structure equal `cael`, `ronan` and `emeric`
  (class 1). The differences are textual only, in two objects against `ronan`:
  - `memory_entry_origins`: indentation;
  - `session_participants`: quoted table name.

  Its header lacks `media-transcript-archive-verification-v1`.

- **The extra objects through the migration.** The three virtual tables and fourteen shadow tables
  build byte equal (116/116 and 23/23). The seeded vec0 embedding and FTS rows stay byte equal
  through the migration, the activation tail and both restores. Restores compare 188 catalog
  entries and 72 tables with no difference. The objects behave exactly as in the main shapes.

## Results per shape

All sixteen rows passed every assertion of the first rehearsal; only digests, file names and the
counts shown differ. Columns:

- **DBs**: the agent databases from `ALL-AGENT-DB-SHAPES.txt`, as `seat: agents`.
- **build**: executed objects, then shadow tables, byte-equal; the rebuilt dump equals the input
  in every row.
- **migration**: the change against the predecessor. Every row shows 1 catalog entry and 1 row
  (`schema_meta` primary).
- **restore**: catalog entries / tables compared, after the version phase and after activation;
  no difference in every row.
- **U12**: refused on both paths, store unchanged, the same store as the rehearsal's migrated copy.

| shape            | DBs                                                                                                                                                                                                                                              | class | classification                      | build             | restore  | U12     | verdict |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------- | ----------------- | -------- | ------- | ------- |
| `cael`           | cael: main                                                                                                                                                                                                                                       | 1     | textual only vs ronan, emeric       | 116/116 and 23/23 | 188 / 72 | refused | PASS    |
| `ronan`          | ronan: main; silas: main                                                                                                                                                                                                                         | 1     | textual only vs cael, emeric        | 116/116 and 23/23 | 188 / 72 | refused | PASS    |
| `elliott`        | elliott: main                                                                                                                                                                                                                                    | 2     | structural (C, N2)                  | 116/116 and 23/23 | 188 / 72 | refused | PASS    |
| `emeric`         | emeric: main; rune: main                                                                                                                                                                                                                         | 1     | textual only vs cael, ronan         | 116/116 and 23/23 | 188 / 72 | refused | PASS    |
| `x-037f7c86eedf` | elliott: claude, codex, copilot, default, research, router-balanced, router-complex, router-quick; ronan: agent, bot-alpha, claude, claude-code, codex, codex-acp, copilot, default, research, test, work; silas: agent, codex, copilot, default | 3     | structural (M)                      | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-1c2dd97228c8` | cael: agent                                                                                                                                                                                                                                      | 4     | structural (M, C)                   | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-2170ae4d642d` | emeric: codex, research; rune: codex                                                                                                                                                                                                             | 3     | structural (M)                      | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-3076322a956c` | elliott: openclaw; emeric: agent, claude, copilot, default; rune: agent, default; silas: openclaw                                                                                                                                                | 3     | structural (M)                      | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-37b222965ab5` | silas: claude                                                                                                                                                                                                                                    | 5     | structural (M, C, N5)               | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-420d0a605448` | emeric: openclaw                                                                                                                                                                                                                                 | 6     | structural (M, C, N6, S)            | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-69f5aaa04421` | cael: claude, codex, codex-acp, copilot, default, research                                                                                                                                                                                       | 3     | structural (M)                      | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-6e53d6abeac4` | cael: openclaw                                                                                                                                                                                                                                   | 3     | structural (M)                      | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-86d3e6ac5209` | ronan: local-nemotron                                                                                                                                                                                                                            | 1     | textual only vs cael, ronan, emeric | 116/116 and 23/23 | 188 / 72 | refused | PASS    |
| `x-978ba7aa6715` | elliott: agent; rune: openclaw                                                                                                                                                                                                                   | 4     | structural (M, C)                   | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-d3d8365f2501` | rune: copilot                                                                                                                                                                                                                                    | 4     | structural (M, C)                   | 108/108 and 9/9   | 163 / 58 | refused | PASS    |
| `x-eea500a249ff` | ronan: openclaw; rune: claude                                                                                                                                                                                                                    | 6     | structural (M, C, N6, S)            | 108/108 and 9/9   | 163 / 58 | refused | PASS    |

Total: 56 agent databases (cael 9, elliott 11, emeric 8, ronan 14, rune 7, silas 7).

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
- **Evidence** (`receipts/edge-legacy-epoch.json`): the same result on `cael`, `elliott`,
  `x-037f7c86eedf`, `x-1c2dd97228c8`, `x-37b222965ab5` and `x-420d0a605448`, one shape per
  structural class. Those shapes cover all three `session_nodes` column layouts, with and without
  the `owner_*` columns.
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
- **Precondition per seat** before crossing, read-only, on each of the seat's agent databases (56
  in all):

  ```sql
  SELECT count(*) FROM session_nodes WHERE entry_json LIKE '%recipientAuthorityEpoch%';
  ```

  Zero makes the scoped rollback exact for this step. A non-zero count needs a full-image backup
  for that database, or a product change: declare `session_nodes` in the 40 scope, or have Doctor
  warn. Product source is out of this lane's scope; recorded as a follow-up.

## Classifier controls (repair regression)

An independent review of the classifier found three defects; all are repaired in this lane:

- A mixed-case column's CHECK or COLLATE difference read as no difference. The parser keys
  columns lowercased, but the lookup used the pragma's name.
- A differing `definitions` field was not in the catch-all check.
- An identifier holding an escaped quote (`"a""b"`) normalized to `ab`.

It also found that the main shapes' header check had weakened to a subset check.

- **Invariant.** "Textual" means only identifier quoting and whitespace differ; anything else is
  structural. The owner is the rehearsal's own classifier (`captureShapeStructure`,
  `diffStructure`, `normalizeDdl`).
- **Negative control.** The committed case `classifier self-check` was grafted onto the prior head
  `3a64aa803c` and fails there: `expected [] to not deeply equal []`. Case by case, the mixed-case
  CHECK and COLLATE pairs report no structural line, and the escaped-quote view reads as textual.
  A lowercase default difference, the sibling path, was already structural there.
- **Fix.** The same case passes on the lane head. All four pairs are structural, and the
  quoting-and-whitespace pair is textual.
- **Header check.** On a copy of the inputs where `cael`'s header lacks
  `media-transcript-archive-verification-v1` (with `SHA256SUMS` refreshed), the prior head's build
  case passes. The lane head fails it at the header assertion, as the base rehearsal did.
- **Real data.** None of this changes a verdict on the sixteen real shapes: all their columns are
  lowercase, and no dump holds an escaped quote.

## Gaps and accepted limits

- **Schema-only inputs.**
  - The live files' `auto_vacuum`, `page_size`, journal mode, real row volumes and planner
    statistics are unknown. The build assumes the product's creation pragmas (incremental
    auto-vacuum, WAL) and seeds a few rows per table.
  - The live seats' sqlite-vec version is unknown. Every vec0 shadow table's DDL is byte-equal to
    what v0.1.9 creates.
- **The shape hash excludes the header.**
  - Databases that share a shape may differ in their `schema_meta` bookkeeping keys. Each shape was
    rehearsed with its file's header.
  - Both key sets are rehearsed within class 1 (`x-86d3e6ac5209` has two keys, the main shapes
    three) and within class 3 (`x-69f5aaa04421` has three, the rest two).
  - The rehearsed sequence never reads the media verification key: after a version migration, the
    tail's media step defers (`src/infra/state-migrations.media-persistence.ts:265`).
- **Memory search on the 117-object shapes.** Its first initialization after the cut is not
  rehearsed. That initialization creates the FTS5 and vec0 objects and drops the historical path
  index, on memory search's own same-version path at 40.
- **Classifier scope.** These would read as structural, the conservative direction:
  - whitespace added or removed next to punctuation;
  - a double-quoted string literal in a trigger body.

  Table-constraint order is ignored; it only renumbers autoindexes.

- **Doctor custody.**
  - The maintenance scope is the test-support scope Doctor's own migration tests use
    (`withMaintenance`), not `beginDoctorMaintenance`'s service and state-owner custody.
  - `assertRepairable` is not called; the preflight output it checks is asserted clean instead.
- **Interactive `doctor --fix`.** Its `prepareDoctorMigrationBackups` path is not rehearsed: an
  updater's verified snapshots can replace the scoped backup there, and heartbeat retirement adds
  full backups. The same-version media repair that writes the verification key is not rehearsed
  either. The rehearsed sequence is systemd activation's.
- **Shared state database.**
  - Doctor also saved a full image of the shared state database beside it. Only the agent store's
    scoped restore is exercised.
  - The state database here is a fresh current one; a live state-schema crossing, if j12 has one,
    is not covered.
- **One agent per state.** Each case stages one store as agent `main`. A seat migrates all its
  agents' stores in one Doctor run, and that is not rehearsed.
- **Witness connection.** The witness keeps one extra connection open during the version phase.
  The restore cases run without it and agree.
- **Edge probe** runs the version phase only.

## Exact commands

```bash
# Inputs
cd /home/figs/.local/state/frond-scribe/j12-live-schema-shapes && sha256sum -c SHA256SUMS

# Dependencies for the lane worktree (no pnpm): hardlink the same-host exact-lock install.
# Do not pipe the loop into head or similar: SIGPIPE stops it part way.
cd /home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-j12-live-shape-rehearsal-all
SRC=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-absorb-8083-j12
rm node_modules   # the setup hook's symlink to the stale source/openclaw install
(cd "$SRC" && find . -maxdepth 3 -name node_modules -not -path './node_modules/*') > /tmp/nm-list.txt
while read -r p; do [ -d "$(dirname "$p")" ] && [ ! -e "$p" ] && cp -al "$SRC/$p" "$p"; done < /tmp/nm-list.txt

# Rehearsal (72 cases; writes receipts/<shape>.json, classification.json, edge-legacy-epoch.json)
rm -rf /tmp/j12-live-shape-all-work && mkdir -p /tmp/j12-live-shape-all-work
J12_WORK_DIR=/tmp/j12-live-shape-all-work node scripts/run-vitest.mjs run \
  --config j12-rehearsal/vitest.rehearsal.config.ts --maxWorkers=1 \
  j12-rehearsal/live-shapes.rehearsal.ts

# U12 refusal (17 cases), from a detached U12 checkout with the same lockfile
LANE=$PWD
U12=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-j12-live-shape-all-u12
git worktree add --detach "$U12" b8b054c13ae859b9ab14d31c5fec90078141e327
SRC=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-absorb-8083-j12-up
(cd "$SRC" && find . -maxdepth 3 -name node_modules -not -path './node_modules/*') > /tmp/nm-u12.txt
(cd "$U12" && rm -f node_modules &&
  while read -r p; do [ -d "$(dirname "$p")" ] && [ ! -e "$p" ] && cp -al "$SRC/$p" "$p"; done < /tmp/nm-u12.txt)
mkdir -p "$U12/j12-u12-refusal" && cp j12-rehearsal/u12-refusal/* "$U12/j12-u12-refusal/"
(cd "$U12" && J12_WORK_DIR=/tmp/j12-live-shape-all-work J12_U12_RECEIPT="$LANE/j12-rehearsal/receipts/u12-refusal.json" \
  J12_REHEARSAL_RECEIPTS="$LANE/j12-rehearsal/receipts" J12_U12_COMMIT="$(git rev-parse HEAD)" \
  node scripts/run-vitest.mjs run --config j12-u12-refusal/vitest.u12.config.ts --maxWorkers=1 \
  j12-u12-refusal/u12-refusal.probe.ts)
git worktree remove --force "$U12"
```

The U12 probe writes its receipt itself:

- it replaces the checkout path with `<u12-checkout>`;
- it records the U12 commit;
- it links each store to the rehearsal's `migratedCopy.sha256`, and asserts the match.

All sixteen `sameStoreAsRehearsal` are true. The committed receipts come from one rehearsal run
(72/72) and one U12 run (17/17) against its migrated copies.

## Receipts

- `receipts/<shape>.json` (16 files) holds these sections:
  - `input`: file, sha256, inventory hash, agent databases, header keys;
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
- `receipts/classification.json` holds the inventory coverage, the six structural classes with
  their edge-probe shapes, the 23 memory-search objects, the declared-scope identity counts, and
  per shape every structural and text-only difference against each main shape.
- `receipts/edge-legacy-epoch.json` is the conditional finding above, keyed by shape.
- `receipts/u12-refusal.json` holds U12's two refusal messages per shape, its preflight error
  (`newer-schema`, `gateway.maintenance_required`) and the unchanged store digests.
