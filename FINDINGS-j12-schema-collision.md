# J12 Agent Schema 39 Collision Trace

Read-only trace against:

- Product/continuation F″: `karmaterminal/openclaw` `20a1ffd3d9d207f77565eb61d3dc99c5ab991562`, lane branch `codeagent/absorb-8083-j11-cand`
- Upstream U12: `openclaw/openclaw` `b8b054c13ae859b9ab14d31c5fec90078141e327`
- Previous U11: `4fc73d6995b2d817d6ff6949ab6151134349a77c`
- Upstream cold-navigation commit: `fce0e56fc0a6307b4a397702feefb05c1996ff38`
- Safe lane: `codeagent/j12-schema-trace`, created/published by this lane

## Named references

| Category         | Ref                                                       | Full SHA / equality                                              | Proof                                                                                                                        |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Product/base F″  | `karmaterminal/openclaw` `codeagent/absorb-8083-j11-cand` | `20a1ffd3d9d207f77565eb61d3dc99c5ab991562`                       | Local `HEAD`, local tracking, and origin ref are equal: all `20a1ffd3d9d207f77565eb61d3dc99c5ab991562`.                      |
| Lane/safe branch | `karmaterminal/openclaw` `codeagent/j12-schema-trace`     | Before this artifact: `20a1ffd3d9d207f77565eb61d3dc99c5ab991562` | The unchanged branch was published before the identity gate; local tracking and origin are equal at the F″ SHA.              |
| Upstream U12     | `openclaw/openclaw/main` at workorder SHA                 | `b8b054c13ae859b9ab14d31c5fec90078141e327`                       | Resolved directly from the local object database and inspected with `git show`/`git grep`; not inferred from a branch tip.   |
| Previous U11     | `openclaw/openclaw` workorder SHA                         | `4fc73d6995b2d817d6ff6949ab6151134349a77c`                       | Resolved directly and verified to declare agent schema 38/state schema 36.                                                   |
| CI/workflow      | N/A                                                       | N/A                                                              | Read-only workorder explicitly uses no tests, DB access, CI dispatch, or broad acceptance.                                   |
| Presentation     | N/A                                                       | N/A                                                              | No UI or presentation change.                                                                                                |
| Docs/proof       | F″ and U12 schema history                                 | F″ `20a1ffd...`, U12 `b8b054...`                                 | `docs/reference/database-schemas/agent-schema-history.md` at both SHAs is the proof surface; no generated output is changed. |

GitNexus evidence: the installed fork is
`/home/figs/src/gitnexus/gitnexus`, fork SHA
`3c1e686edfc1acaac882927cada121ddd7c47bcc`, package CLI version `1.6.5`,
package hash `1798c10a...`. The lane worktree was not registered in the
available GitNexus index, so MCP query returned “repository not found.” This
trace therefore uses source and Git object evidence directly. **Traced, not
inferred:** GitNexus availability and the lack of a current worktree index are
observed facts; all migration conclusions below are source-traced at named
SHAs.

## 1. Migration runner: marker and comparison

**This is a named version owner, not a migration ledger.** The runner uses both
`PRAGMA user_version` in SQLite and the `schema_meta.schema_version` primary
row in the SQLite/agent metadata contract.

- U12/F″ read the integer with `readSqliteUserVersion()` at
  `src/infra/sqlite-user-version.ts:28-32` at each SHA.
- U12 persistence checks a user version above the build constant as “newer”
  and refuses it at
  `src/state/openclaw-agent-db-schema-read.ts:31-45`.
- U12/F″ do not treat trails as silently current: F″ refuses ordinary
  persistence below the build version and directs Doctor at
  `src/state/openclaw-agent-db-schema-read.ts:79-87`;
  U12 has the equivalent check at the same lines.
- U12/F″ migration checks user version and application schema, then computes
  a historical migration from `previousVersion` to `targetVersion` at
  `src/state/openclaw-agent-db-schema.ts:287-359`.
- User version equal to code but with a missing/current-version physical
  migration is admitted to `hasPendingCurrentVersionAgentDatabaseMigration()`
  and repaired; equal + clean uses the current runtime catalog.
- U12/F″ expose metadata mismatch separately: `schema_meta.schema_version`
  must equal the expected agent version and agent ownership at
  `src/state/openclaw-agent-db-schema-read.ts:116-132`.
- Fresh or empty database creation executes canonical SQL, sets
  `PRAGMA user_version = targetVersion`, and writes the primary metadata row
  at `src/state/openclaw-agent-db-schema.ts:351-355`.
- PostgreSQL uses the same overall integer `schema_meta.schema_version` plus
  engine-specific migration definitions; it has no SQLite `user_version`.

**Equality/trail/exceed outcome (traced):**

1. **equal and complete:** skip historical steps, validate canonical runtime
   schema/catalog and continue.
2. **trailing:** `ensureAgentSchema()` runs only steps whose `crossesVersion()`
   crosses the target interval, then advances both marker owners in the schema
   migration sequence.
3. **exceeding:** refuse a newer database at runtime; use/restore the matching
   newer build or a backup.
4. **equal but structurally pending:** current-version shape validation/bridge
   logic repairs or refuses it rather than assuming equality proves contents.

## 2. F″ v39 continuation

### DDL

F″ declares agent version 39 at
`src/state/openclaw-schema-versions.ts:3-12` and adds:

```sql
CREATE TABLE IF NOT EXISTS session_recipient_authority (
  session_key TEXT NOT NULL PRIMARY KEY,
  epoch TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
```

The SQLite DDL is at F″ `src/state/openclaw-agent-schema.sql:142-148`.
The table deliberately has no `session_nodes` foreign key.
The PostgreSQL equivalent is extracted from generated PostgreSQL agent SQL by
`src/state/openclaw-agent-recipient-authority-schema.ts:36-52`.

### Backfill

At F″ `src/state/openclaw-agent-db-session-migrations.ts:385-437`, the
migration creates the table idempotently, then scans
`session_nodes.entry_json LIKE '%recipientAuthorityEpoch%'`. Valid UUID-v4
values become one row per canonical `session_key`; it is
`INSERT ... ON CONFLICT (session_key) DO NOTHING`. Valid and invalid
`recipientAuthorityEpoch` fields are removed from JSON; malformed epoch values
do not create authority. The migration calls canonical entry-validity
projection settlement when a row changed.

### Witness and history

- F″ calls this migration as schema-step 39 at
  `src/state/openclaw-agent-db-schema.ts:362-420`.
- Backup inventory includes `"session_recipient_authority"` for the authority
  destination version in
  `src/state/schema-migration-backup-tables.ts:43-46`.
- The continuation witness admits authority in versions 24–39 and suppresses
  only an empty authority-table discrepancy for the current crossing at
  `src/state/openclaw-migration-witness.continuation.ts:14-55`.
- F″ history documents agent 39, upstream’s 38 base, backfill/rollback, and
  fleet/shipping ambiguity at
  `docs/reference/database-schemas/agent-schema-history.md:357-390`.

### Doctor

F″ uses the normal agent schema owner under maintenance/Doctor custody, not a
separate always-on cold-navigation repair owner. Legacy canonical-key Doctor
also reconciles or deletes authority rows in
`src/commands/doctor-session-recipient-authority-repair.ts` and
`src/commands/doctor-session-canonical-keys.ts:373,484,540`.

### Rollback/backup

The authority step is included in the migration backup inventory. F″ docs say
rollback requires the pre-upgrade backup and matching build, not decremented
markers. The authority table has idempotent creation, conflict-safe row
adoption, and in-place JSON removal inside the same migration transaction.

## 3. Upstream U12 v39 cold navigation

### DDL

U12 declares agent schema 39 at
`src/state/openclaw-schema-versions.ts:3-11`; the named cold-navigation step is
also 39 at `src/state/openclaw-agent-db-contract.ts:9-10`.
`src/state/openclaw-agent-schema.sql:437-469` permits:

- inline `event_json`;
- compressed `event_zstd` plus bounded UTF-8 metadata and navigation JSON; or
- cold payload reference: `event_json IS NULL`, `event_zstd IS NULL`,
  bounded `event_utf8_bytes`, and non-null `navigation_json`.

The cold-navigation migration widens the SQLite `transcript_events` definition
in place without row rewrite:
`src/state/openclaw-agent-cold-navigation-schema.ts:32-64`. PostgreSQL drops
and recreates the equivalent `transcript_events` payload constraint from the
generated schema at
`src/state/openclaw-agent-cold-navigation-schema.ts:23-30` and
`src/state/openclaw-agent-db-engine.ts:299-317`.

### Doctor backfill

U12’s Doctor owner is
`src/infra/state-migrations.cold-navigation.ts:35-230`. It:

- runs under agent-maintenance authority and bounded discovery;
- scans archives lacking a qualified `transcript_events` row;
- shares a 10-minute work budget across databases;
- saves a verified SQLite/PostgreSQL backup once before changing a database in
  that invocation;
- commits one archive transaction at a time;
- finishes an in-flight archive even past the deadline because checking is
  between archives;
- retains source archives and pending status after failed/interrupted work;
- reports migrated/pending and directs the next Doctor run.

The actual navigation writer is
`src/config/sessions/session-cold-storage-navigation.ts:52-99`. It writes
navigation JSON directly into `transcript_events`, preserving body bytes,
optionally rehydrates incomplete archive indexes for index reconciliation,
then removes only temporary inline JSON. It does not recompress archive
bodies.

### Witness/history/backup

U12 witness schema support includes agent 39 and omits/normalizes the new cold
definition in historical comparisons:
`src/state/openclaw-migration-witness.ts:86-113,527-529`.
Backup inventory records `transcript_events` for agent version 39 at
`src/state/schema-migration-backup-tables.ts:39-43`.
History is explicit at
`docs/reference/database-schemas/agent-schema-history.md:79-124`.

### Older build behavior

U12 explicitly expects user/schema metadata 39; an older build such as U11
declares only agent version 38
(`src/state/openclaw-schema-versions.ts:3-10` at U11). For a DB stamped 39,
the older build’s `assertSupportedAgentSchemaVersion()`/equivalent is the
newer-version guard and refuses before ordinary use. It does not downgrade or
rewrite markers. Older F″-style builds likewise refuse an incompatible newer
schema 39 unless their own continuation bridge treats the exact shape.

## 4. Collision outcomes

### (a) Fresh DB

| Step                                        | Result under build target `upstream39 → continuation40`                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream 39 structural cold-navigation step | **Run once.** Create/widen cold payload references in `transcript_events`; set/verify user and metadata schema markers at 39.                                                                                                         |
| Upstream 39 Doctor cold backfill            | **Run on existing cold archives.** Fresh DB normally has no archives, so it reports zero/backfills none.                                                                                                                              |
| Continuation 40 structural/data step        | **Run once in same target migration composition.** Create `session_recipient_authority`; no valid entry JSON is found in a fresh DB and marker advances to 40.                                                                        |
| Older code openings                         | A build that only expects 39 can open the final 40 DB? No: it is functionally the numerical-exceed case and must refuse, unless its 39 implementation has a compatible higher-marker backstop (it does not in this collision design). |

### (b) Upstream-39 DB

Upstream 39 is structurally cold-navigation complete; continuation authority
does not exist.

| Step                        | Result                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream 39 structural step | **Skip:** cold navigation is already at 39 / `crossesVersion(39)` false from previous `39`.                                                         |
| Upstream 39 Doctor backfill | **Run/resume separately:** still needed because cold navigation separates schema DDL from archive backfill. Already-qualified archives are skipped. |
| Continuation 40             | **Run:** create `session_recipient_authority` idempotently and backfill valid UUID-v4 `entry_json` epochs; advance markers to 40.                   |

No cold-vs-authority double apply occurs in the intended sequential design.
The continuation migration must be content/idempotent, but marker equality for
the cold column shape cannot be used as authority evidence.

### (c) Fork-39 DB (authority applied, U12 cold not applied)

This DB has likely all/upstream historical structure through 38 plus the
`session_recipient_authority` table and marker 39. It does **not** have
U12’s cold payload-reference constraint, but that constraint could be masked
by a separate partial schema, mixed object shape, or malformed marker.

| Step                                 | Result                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream 39 structural cold step     | **Must run:** the target build sees numeric equality 39 but sees cold-navigation not present, so equality alone is insufficient. Bridge rejects/refuses mixed or unknown catalog shapes rather than guessing.                                                                                         |
| Upstream 39 Doctor backfill          | **Run once under Doctor after successful structural step,** one archive at a time, resumable. It must not mark continuation 40 first.                                                                                                                                                                 |
| Continuation 40 structural/data step | **Skip/reconcile, not create blindly twice:** authority table creation is already idempotent. The valid `entry_json` backfill may be rerun safely because it uses insert conflict-no-op plus field removal. Mark continuation 40 only after cold backfill/repair completes or is genuinely resumable. |

If an unsafe build simply “forgets” that continuation 39 is not upstream 39,
then it will likely skip upstream 39 because `previousVersion === 39`, while
continuation is also told marker 39 equals step 40? Depending on implementation:

- Numeric runner `target39` treats authority DB as current and never
  cold-navigation rewrites **transcript_events**.
- A runner that opens with upstream 39’s structural catalog validator may
  detect mismatch `navigation_json`/payload check absent and refuse,
  depending on validator strictness.
- A naive continuation 40 run might add authority idempotently and advance
  the marker to 40 without cold navigation, falsely certifying a database as
  U12+continuation complete.

The high-risk outcome is false-current 40: cold backfill and/or cold DDL
remain missing but markers claim both cold 39 and continuation 40. Bridge code
must prevent it by physical catalog/content detection before numeric-only
skip.

## 5. Concrete fork-only bridge

### Minimal detection

Implement a fork-only shape classifier used before target migration planning
when the observed agent version equals the ambiguous 39:

1. `user_version === 39`;
2. primary `schema_meta.schema_version === 39`;
3. `session_recipient_authority` exists and has the canonical strict DDL
   shape; and
4. U12 cold-navigation markers/shape are absent.

The practical cold absence check is physical, not package version:

- `transcript_events.navigation_json`, `navigation_type`, `navigation_custom_type`,
  `navigation_display`, `message_role`, `navigation_last_type`,
  `navigation_valid` and the DDL payload predicate are not all canonical
  upstream-39 shape; or
- any cold-navigation witness/catalog fingerprint differs from upstream 39.

Do **not** classify by authority-table presence alone: a partial or malformed
authority table is an unsafe shape and should refuse. Exact table columns and
primary key/strictness should be validated. If authority is absent but cold is
present, classify upstream39 and run only continuation40. If both are absent
and marker39, refuse as unknown/untrusted.

Postgres detection is equivalent catalog/constraint detection:

- authority table/catalog presence;
- absence of U12 `transcript_events` payload constraint/navigation columns;
- exact `schema_meta` marker and upstream migration versions.

### Order

For fork-39:

1. Stop active writers and establish maintenance/registry/backup custody.
2. Detect fork-39 shape and refuse mixed/partial catalogs.
3. Run upstream39 SQLite/PG structural cold-navigation step and verify its
   exact resulting catalog. Only this step widens the table/constraint.
4. Run U12 cold Doctor archive navigation backfill under its existing 10-minute
   resumable owner; keep pending archives recoverable; do not insert a second
   archive store or ledger.
5. Run F″ continuation authority migration 40 (idempotent DDL/backfill); this
   step must retain existing authority rows and remove only valid/malformed
   entry fields exactly as F″ does.
6. Advance `user_version` and `schema_meta.schema_version` from 39 to 40 only
   as the final migration transaction step after required structural steps
   succeed. Doctor backfill pending does not validate as authoritative marker
   completion until cold navigation has explicitly caught up or accepted
   resumable pending semantics.

For fresh DB: run U12 39 first and continuation 40 second.
For upstream39: skip U12 structural 39, resume backfill, then run 40.

### Atomicity and backup

- SQLite structural DDL and authority migration should retain the existing
  owner transaction; marker and structural catalogs commit together.
- U12 archive backfill remains archive-independent/resumable and commits each
  archive transaction separately, matching U12. Schema marker must not
  replace archive completion facts.
- Create backup inventory entries for both `transcript_events` and
  `session_recipient_authority`; reuse existing backup owner semantics.
- Witness must include both source shape and destination shape and not
  normalize away authority or cold tables accidentally.
- Failed structural cold migration or marker mismatch rolls back and leaves
  both markers/shape unchanged as possible. Do not lower a marker or repair by
  deleting the cold navigation table/authority table.

### Doctor interplay

- Doctor exact discovery should classify fork39 before creating target
  migration evidence/backup.
- The cold-navigation Doctor pass remains resumable and repeats even if the
  agent marker is current.
- The continuation canonical-key Doctor repair remains content-driven and
  must not create authority epochs outside valid UUID-v4 rules.
- Update/Doctor must stop active writers and run under maintenance custody.
- A cold-backfill warning/pending archive should remain retryable; it should
  not be falsely interpreted as continuation migration failure or silently
  redact pending state.

### Postgres agent port

Use the existing PostgreSQL engine migration step list. Add the fork detector
to the catalog/admission owner, not an application-side transaction heuristic.
The cold step drops/readds the exact transcript constraint; the authority step
creates its table; `schema_meta.schema_version` advances only with committed
catalog/migration completion. Keep `database.engine=postgres` and
generated PostgreSQL catalogs in the migration engine rather than adding
SQLite-only branches to the port.

### Ownership location

The bridge belongs in a fork-owned file, for example:
`src/state/openclaw-agent-db-fork-schema39-bridge.ts`, plus a narrow export
from the migration owner/schema helper. It should be part of J12’s fork-only
migration composition, not U12 continuation code and not upstream PR
content. The bridge should use/upstream-pin the cold-navigation migration
implementation at U12 and F″-pin continuation migration for the collision
window, until upstream continuation lands.

## 6. Upstream PR shape

Continuation should land only as **agent 40 on top of upstream 39** in the
PR, never as fork-only collision logic.

Required changes:

- `src/state/openclaw-schema-versions.ts`: add v39 comment for cold
  navigation and v40 for continuation; set
  `OPENCLAW_AGENT_SCHEMA_VERSION = 40`.
- `src/state/openclaw-agent-db-contract.ts`: define/retain
  `AGENT_COLD_NAVIGATION_SCHEMA_VERSION = 39`; define continuation authority
  version as `40`.
- Migration runner:
  `src/state/openclaw-agent-db-schema.ts` crosses 40 only for continuation;
  U12’s 39 structural step remains unchanged and runs first for fresh/trailing
  DBs. Current 39 upstream DB is directed only to authority40.
- `src/state/openclaw-agent-db-session-migrations.ts`: keep the continuation
  DDL/backfill implementation, named at step 40.
- SQLite canonical schema and generated PostgreSQL agent schema: add
  `session_recipient_authority`; preserve cold-navigation DDL/constraint.
- `schema-migration-backup-tables.ts`: map 39 to `transcript_events` as
  upstream already does, and add 40 to authority-table backup inventory.
- Witness:
  accept version 40; compare authority-table history; continue to tolerate
  empty authority crossing only where the upgrade witness contract says it is
  empty.
- History docs: add agent 40 row and section; retain U12 agent 39 semantics
  unchanged.
- Generated catalogs/baselines: regenerate SQLite/PostgreSQL catalogs,
  schema SHA/baseline, package schema metadata, migration inventory, snapshots,
  and any schema-conformance fixtures.
- Upstream PR explicitly excludes the fork-only detection/bridge for fork-39
  shape and exact F″ migration capture/history from this list. That stays in
  a fork-owned bridge.

## Claim status

- **Traced:** migration marker/comparison, F″ and U12 constants/DDL/migrations,
  backup/witness/history, Doctor owner integration, PostgreSQL migration
  shape, and U11 agent38 state36 baseline.
- **Inferred:** exact real-world outcome of a build that merges code but is
  missing a shape classifier. The physical logic is grounded in source, but
  the future merge implementation has not been inspected or run.
- **Not performed:** source edits, tests, DB access, CI dispatch, live
  Gateway/Postgres proof. Read-only workorder by instruction.
