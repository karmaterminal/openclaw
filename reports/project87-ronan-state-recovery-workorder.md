# Mutation-gated recovery workorder (Ronan shared state)

Issue: karmaterminal/openclaw#1263
Runtime that must come back first: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Selected strategy: **B — SQLite `.recover` candidate**, drop `lost_and_found` only, keep catalog.
This file is a procedure. It is not authorization.

## Hard stops

Do nothing in the mutation section until a named operator posts an explicit mutation gate on #1263 naming this workorder and the **cleaned** SHA-256 below.

Until then:

- Gateway stays `failed`/`inactive`. Do not `start`, `restart`, `reset-failed`, or `kickstart`.
- Do not open the live DB with sqlite3 (not even `immutable=1`).
- Do not `VACUUM`, `.recover`, or `integrity_check` against the live path as a writer.
- Do not delete, rename, or replace live DB/WAL/SHM except via the atomic Phase 4 `mv -n` after the gate.
- Do not deploy, change config/providers, or move the continuation composite.

## Frozen hashes

```
corrupt source     98b7a91bb71830f3b415200f88c5fb52b4f96b74393119fe16a947898ecbaef0
                   size 78249984
pre-cleanup rec.   278fa90c0e8e8c9023318935f130450439fcca331413740b072d3f644386818a
                   size 77144064
SELECTED CLEANED   30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d
                   size 74825728; this is the only cutover identity
prior repaired     ff9dd266bd00871c50af17ffd407c9e2eba5b226302994755d65406b16e6ecf3
                   user_version=6; not selected
```

Host paths on Ronan:

```
RECOVERY=$HOME/.openclaw/recovery/project87-ronan-20260816T0028PDT
CAND=$RECOVERY/openclaw.recovered-cleaned.sqlite
INCIDENT_DB=$RECOVERY/openclaw.sqlite
LIVE_DIR=$HOME/.openclaw/state
LIVE=$LIVE_DIR/openclaw.sqlite
STAGE=$LIVE_DIR/openclaw.sqlite.recover-6b09-20260816
LIVE_HOLD=$LIVE_DIR/openclaw.sqlite.incident-held-20260816
RUNTIME=/home/figs/flesh_beast_tmp/openclaw
```

## Phase 0 — already done (read-only)

Executed on worker copies, not on live:

1. Unit confirmed `failed` / `NRestarts=6`. Frozen hash rematched.
2. `PRAGMA quick_check` / full `integrity_check` on a copy: freelist 267 vs 274 only.
3. `.recover` (SQLite 3.53.4 + `sqlite_dbpage`) into a new file; `integrity_check=ok`, `user_version=7`.
4. Dropped salvage; kept catalog; `VACUUM` on the new file only.
5. Node 3.51.3 recheck: ok / 7 / FK empty.
6. Prior repaired independently validated on a copy (`user_version=6`, mixed counts).

Re-check containment immediately before any later phase:

```
systemctl --user show openclaw-gateway -p ActiveState -p SubState -p NRestarts
# expect: failed or inactive; do not reset-failed

sha256sum "$INCIDENT_DB" "$LIVE" "$CAND"
# INCIDENT_DB and LIVE must both be 98b7a91b…ef0
# CAND must be 30940a6e…4cbb28d

stat -c '%s %y' "$LIVE"
# expect: 78249984 and mtime 2026-08-15 23:58:56

git -C "$RUNTIME" rev-parse HEAD
# expect: 6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955
```

If any of those drifted, stop and re-analyze. Do not cut over.

Live WAL/SHM were present in the freeze manifest and were **absent** at analysis closeout. Do not recreate or delete them by hand. If they reappear before Phase 4, stop and report; do not checkpoint.

## Phase 1 — DONE on worker (2026-08-16T07:40Z). No Ronan mutation.

```
sha256  30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d
size    74825728
user_version 7 / schema_version 268
integrity_check ok; quick_check ok; foreign_key_check empty
model_catalog_remote COUNT(*)=1; length(bundle_json)=1169691
lost_and_found absent
owner counts match reports/project87-ronan-state-recovery-counts.csv cleaned column
```

## Phase 2 — copy candidate beside live (still no cutover)

```
install -m 600 "$CAND" "$STAGE"
sha256sum "$STAGE" "$LIVE" "$INCIDENT_DB"
# STAGE == 30940a6e…4cbb28d
# LIVE and INCIDENT_DB == 98b7a91b…ef0
```

The live filename must remain the incident file until Phase 4.

## Phase 3 — mutation gate (human)

Required text, posted on #1263 by the operator:

- names this file
- names the **cleaned** candidate SHA-256 `30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d`
- authorizes cutover on Ronan
- confirms Gateway must stay stopped until Phase 5
- confirms restart stays on exact `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`

No gate → no Phase 4.

## Phase 4 — atomic cutover (Gateway still stopped)

```
systemctl --user is-active openclaw-gateway
# must print: inactive   (if it prints failed, do not reset-failed; treat as stopped)

set -euo pipefail
test -f "$STAGE"
test -f "$LIVE"
test ! -e "$LIVE_HOLD"
sha256sum "$STAGE" | grep -q '^30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d '
sha256sum "$LIVE" | grep -q '^98b7a91bb71830f3b415200f88c5fb52b4f96b74393119fe16a947898ecbaef0 '
mv -n "$LIVE" "$LIVE_HOLD"
mv -n "$STAGE" "$LIVE"
chmod 600 "$LIVE"
sha256sum "$LIVE" "$LIVE_HOLD" "$INCIDENT_DB"
```

Expect:

- `$LIVE` == `30940a6e…4cbb28d`
- `$LIVE_HOLD` == `98b7a91b…ef0`
- `$INCIDENT_DB` == `98b7a91b…ef0`

Rollback if hashes do not match:

```
set -euo pipefail
mv -n "$LIVE" "$LIVE_DIR/openclaw.sqlite.aborted-cutover"
mv -n "$LIVE_HOLD" "$LIVE"
```

## Phase 5 — start exact `6b09` and speech ladder

Start the **same** composite. Do not update, deploy, or reset-failed as a substitute for start.

```
systemctl --user start openclaw-gateway
systemctl --user show openclaw-gateway -p ActiveState -p NRestarts -p ExecMainStatus
# expect: active / 0 / 0

curl -sS -D- http://127.0.0.1:18789/health
curl -sS -D- http://127.0.0.1:18789/readyz
# /health 200 only proves the HTTP server.
```

On a **copy** of the now-live file (never `VACUUM` live):

```
cp -a "$LIVE" /tmp/ronan-post-cutover-copy.sqlite
sqlite3 "file:/tmp/ronan-post-cutover-copy.sqlite?immutable=1" \
  "PRAGMA integrity_check; PRAGMA user_version; PRAGMA foreign_key_check;"
# expect: ok / 7 / empty
```

### Integrity / state-owner / catalog / nonce speech ladder

Fail closed (stop the unit, do not restart) if any rung fails:

1. Copy `integrity_check=ok`, `user_version=7`, FK empty, `lost_and_found` absent.
2. Public-safe owner smoke vs this analysis (exact equality not required after start, but collapse/zeroing is a stop):
   - ingress `channel_ingress_events` near 5177
   - `delivery_queue_entries` near 106
   - `plugin_state_entries` near 6043
   - `task_runs` near 1656
   - `worker_session_placements` present
   - `device_pairing_paired` = 1
   - session heads/cursors remain nonzero
3. Catalog: `model_catalog_remote` may stay at 1 row / ~1.17 MiB or refresh; empty is acceptable only as a later cache rebuild, not as a surprise wipe of other owners.
4. Discord/default channel: enabled, configured, running, connected.
5. Exact runtime still `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`.
6. **Nonce speech:** one inbound Discord snowflake → one admitted run → one finalized turn → one submitted outbound → one visible reply carrying the nonce. No speech = not recovered.

If speech fails or integrity is not `ok`, `systemctl --user stop openclaw-gateway` (not restart) and execute the Phase 4 rollback.

## Fallback if recover is rejected

Restore prior repaired `ff9dd266…` with the same stage-beside + hash + gate ritual **only after** an explicit new gate that accepts `user_version=6`, commitments retirement on start, and the mixed count vector (delivery +9, audit +643, placements 0, no `cron_run_receipts`). Prefer staying stopped over a blind live restart of the corrupt file.

Fresh rebuild is last resort: move `$LIVE` to `$LIVE_HOLD`, let `6b09` create a new `user_version=7` DB, then reconstruct pairing/plugin/cron from external owners.

## Abort / remain stopped

If the gate is refused, leave Ronan `failed`/`inactive` with the incident file in place and the preserved snapshot untouched. Do not `reset-failed`.
