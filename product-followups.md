# Product follow-ups from Cael shared-state incident

Issue that observed the gap: karmaterminal/openclaw#1261
Exact head that stayed HTTP-green: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Do not implement these here. Each needs its own causal fossil and exact-head corpus.

## F1. Liveness `/health` cannot represent shared-state failure

**Observed:** Cael remained `active`, `NRestarts=0`, HTTP 200 on `/health` while ingress, delivery recovery, tasks, placements, session links, pairing, and plugin/cron state failed about once per second.

**Owner in current `6b09` source:**

- `src/gateway/gateway-http-route-contracts.ts` maps `/health` and `/healthz` to `live`.
- `src/gateway/server-http-probes.ts` returns 200 `{ok:true,status}` for live probes with no SQLite open.
- `docs/gateway/health.md` documents `/health` as process liveness and tells uptime monitors to use it.
- `/readyz` (`src/gateway/server/readiness.ts`) evaluates channel accounts, not state-DB integrity.

**Why a fossil is warranted:** operators and fleet probes treated HTTP 200 as communicative health. That is the worst class of bug in this repo (silent/misleading success) even though the status code matches the written liveness contract. The defect is the _product surface_, not a broken JSON parser.

**Candidate contract (for a later PR, not this lane):**

- Keep `/health` as liveness so orchestrators do not kill a process that is still serving Control UI.
- Make `/readyz` (or a new authenticated admin field) fail when the shared-state DB is quarantined, fails terminal integrity, or cannot serve required owners.
- `openclaw health` / `status --deep` must not print a success-shaped summary when the state latch is set.

Related twins: openclaw/openclaw#114534 (fail-open on corrupt state), #101290 / #124045 / #119583 (CLI health/status touching the live DB).

## F2. Integrity verification is too late and too quiet for fail-closed

**Observed:** the Gateway binds HTTP first, then registers `startOpenClawDatabaseIntegrityVerifier` as a sidecar (`src/gateway/server-startup-finish.ts`). First check is delayed 5 minutes; interval is 24 hours (`src/state/openclaw-database-verify.ts`). A terminal failure latches later opens and writes quarantine; it does not change `/health` and does not stop an already-running HTTP server.

**Candidate contract:**

- Startup should refuse _new_ privileged work when `assertSqliteIntegrity` / the open latch says the shared-state file is terminally damaged.
- Channel start that requires durable ingress should fail closed with a typed reason, not retry forever against a malformed catalog/overflow page.
- Quarantine must be visible in `openclaw status` without a 5-minute wait.

Do not run full `integrity_check` on every request. Bind it to open/startup/doctor and to the existing delayed verifier.

## F3. Lazy cache table can take the shared file down

**Observed:** the only integrity error that named a b-tree is `model_catalog_remote` (tree 146, overflow list 5 vs 286). That table is a single-row remote catalog cache (`src/model-catalog/remote-store.ts`) listed in `LAZY_ADDITIVE_STATE_TABLES`. Reading it on the corrupt copy throws `database disk image is malformed`. Other product `COUNT(*)` values still succeeded.

**Not proven:** that a catalog write introduced the overflow break.

**Follow-up questions for a catalog-owner fossil:**

- Should a ~1 MiB cache blob live in the shared state DB at all, versus a dedicated cache DB?
- If a cache read hits `isSqliteCorruptionError`, can the owner drop/rebuild that one row instead of poisoning every state-backed subsystem?
- Doctor `--fix` today repairs schema/indexes; it does not offer a named “rebuild remote catalog cache” path.

## F4. Detection vs introduction

Root-cause work must keep these separate:

1. **Introduction** of the overflow-list mismatch — unknown. Earlier `openclaw.sqlite.precorrupt-061317` only shows Cael has seen a named pre-corrupt copy before. Concurrent CLI writers (#101290, #119583, #124045) are hypotheses, not proof.
2. **Detection/fail-closed** — proven missing on the liveness surface and delayed on the verifier surface.

A product PR that only adds logging without a readiness/owner fail-closed path will not fix #1261’s operator-visible lie.

## Suggested fossil titles (do not file from this lane unless asked)

1. `Gateway /health stays 200 when shared state DB is terminally unusable`
2. `Shared-state integrity verifier cannot fail readiness or startup`
3. `model_catalog_remote overflow corruption has no owner rebuild path`

Each needs `PR-NNNNNN/PROOFS/<FULL_SHA>/` on `karmaterminal-openclaw-docs` if it becomes a treatment micro-PR.
