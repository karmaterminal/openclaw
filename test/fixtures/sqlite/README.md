# SQLite Release Fixtures

`openclaw-agent-schema-v14.sql` is the exact agent DDL from tag
`v2026.7.2-beta.4`. Its media-migration test retains the original SHA-256
contract. `openclaw-agent-schema-v21.sql` freezes commit
`f69617aa3818d805889692918ee7f51bef666597` as an independent schema-21 migration input.
`openclaw-agent-schema-v19.sql` freezes commit
`fb380bd4879be34aa160675d653560bb79690db9`, the last schema-19 commit before the
schema-20 cold-storage migration, for container image replacement startup tests.
`openclaw-agent-schema-v22.sql` freezes the deployed FTS ownership DDL from
commit `00caa84ce72c0b4edd584cfa225bd262cd10ba49` ([#153834](https://github.com/openclaw/openclaw/pull/153834)).
It contains `(session_id, fts_rowid)` ownership and nullable `fts_row_count`,
not the unpublished compressed schema-22 draft.

Golden source contracts:

- Schema 19: 28,402 bytes; Git blob `c7034eff720b35a8f78f48ce07c3d2a554f5124e`;
  SHA-256 `fe93217454642e911608f81afc53c9fb3bb7c20cc32bc73f8f6eeaaf232b91b8`.
- Schema 21: 34,836 bytes; Git blob `3dda3eb4928efc3fb74ff3a37337417cc7d30e74`;
  SHA-256 `8deb7d7000eab7c43bbee427f2e7a9b603bc549562594088a14eecf7c8cc5926`.
- Schema 22: 35,110 bytes; Git blob `9c6c775549e92a021ea7f5b43d749718ba1189c7`;
  SHA-256 `23f2a1e85494a512bce3f32623aed2beaf4e82bbeeb4362f6cc33d5dd3b8a6ea`.

Historical fixtures read these sources without deriving old tables from current DDL.

`openclaw-agent-schema-v25.sql` is the exact agent DDL from commit
`6a8b0dceaf` (#167932), upstream's canonical-writer schema 25.
`openclaw-agent-schema-v25-fleet-captured.sql` is the DDL captured on 2026-10-13
from a fleet agent database at the fleet's recipient-authority schema 25, written
by deployed build `7d8a1a91c6`: `sqlite_master` statements in creation order, no
rows, with memory-core FTS/vector tables and FTS5 shadow tables omitted. Unlike a
fresh install it carries migration history (appended and reordered columns,
quoted rebuilt tables, unmaterialized additive columns). Together they are the
two real inputs to the schema-25 bridge.

Agent schema 26 also has two histories. `openclaw-agent-schema-v26.sql` is the exact
agent DDL from commit `84a834e233` (#169315), upstream's JSON-predicate schema 26.
`openclaw-agent-schema-v26-fleet.sql` is the exact agent DDL of deployed build
`03de0ce5d3` (the 2026-10-19 fleet cut), the fleet's recipient-authority schema 26 as a
fresh install writes it. `openclaw-agent-schema-v26-fleet-migrated.sql` is the DDL that
build's own schema owner wrote when it migrated `openclaw-agent-schema-v25-fleet-captured.sql`
to schema 26, the path fleet seats took through `doctor --fix`; it keeps that file's
migration history. Together they are the inputs to the schema-26 bridge.

<!-- Frond (karmaterminal): fork-39 bridge. Fork-only; omitted from the upstream presentation. -->

Agent schema 39 also has two histories. `openclaw-agent-schema-v39.sql` is the exact agent DDL
from commit `b8b054c13a` (U12), upstream's cold-navigation schema 39 (Git blob `2e1c9fa973`).
`openclaw-agent-schema-v39-fleet.sql` is the exact agent DDL of fork commit `20a1ffd3d9` (F″),
the fleet's recipient-authority schema 39 as a fresh install writes it (Git blob `0800da7d05`,
unchanged since jump 9, `48a4a4b441`). Together they are the inputs to the fork-39 bridge.

`openclaw-state-v2026.7.1-2.sqlite.gz` is a deterministic fixture for the
shared state database created by OpenClaw tag `v2026.7.1-2` at commit
`0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`.

The tagged runtime, whose package version is `2026.7.1`, created the database
with Node `v26.7.0` and SQLite `3.51.0`. The fixture then received fixed
synthetic rows for durable state, audit sequence preservation, diagnostic
ordering, task foreign keys, cron history import, and one representative
commitment. The commitment exists solely to prove irreversible retirement of
shipped commitment data; it is not archived or exported. Metadata timestamps
are fixed, the WAL is checkpointed, and the database is vacuumed before
deterministic Node `gzipSync(raw, { level: 9, mtime: 0 })` compression.

The sorted `sqlite_schema` rows are byte-identical to a database initialized
from `src/state/openclaw-state-schema.sql` at the commit above. Synthetic data
and metadata normalization do not alter the released schema.

Fixture contract:

- raw SQLite SHA-256:
  `8511bb91f02d104f818c70b08397a678045d04741c931b0ee7ce6650b5519e85`
- gzip SHA-256:
  `c775499d9a46462ae2368090a0c4ec75877784c40694046dd3af63df77b8737c`
- sorted `sqlite_schema` SHA-256:
  `f2fd6488e283470718547fb45886f04cc940b1de798e52fbf34a3a3408ae25e4`
- 73 application tables
- 103 named indexes
- zero `STRICT` tables

## Legacy agent-deletion upgrade fixture

`openclaw-state-v2026.9.9.sql` and `openclaw-agent-v2026.9.9.sql` preserve
synthetic databases produced and closed by the v2026.9.9 writers at
`bcfc88812a35243893585dbeca87ca41b48272ca`. They contain shared schema 19 and
agent schema 24, including an unfinished deletion with no `phase` column.

The shared catalog has 221 objects; the agent catalog has 132. These are the
actual writer-created catalogs, including first-use tables, rather than current
schemas relabeled with old version numbers. The tagged shared and agent DDL
blobs are `856050a460099db81928a15b9e859490451930f9` and
`f487190069e23ceaa32f68f8706883be0527d990`. The existing schema-v24 fixture is a
later additive shape and cannot substitute for this published-version fixture.

The dump restores settled rows before installing triggers. SQLite reconstructs
FTS shadow tables from their original virtual-table DDL and logical FTS rows.
Restoration was verified against the original catalogs and retained writer rows,
with integrity and foreign-key checks passing.

Only producer-specific config diagnostics, config-health observations, and the
config last-touched timestamp were omitted. Journal paths use `__FIXTURE_ROOT__`;
the historical transcript's cwd uses a synthetic path with its byte count
updated. The helper changes the synthetic agent name to reuse the same schema
for two independent databases. No candidate storage owner initializes the fixture.
