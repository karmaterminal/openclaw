# Mutation-gated recovery workorder (Cael shared state)

Issue: karmaterminal/openclaw#1261
Runtime that must come back: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Selected strategy: **B — SQLite `.recover` candidate**, then drop salvage and the empty catalog cache.
This file is a procedure. It is not authorization.

## Hard stops

Do nothing in the mutation section until a named operator posts an explicit mutation gate on #1261 naming this workorder and the **Phase 1 post-cleanup** SHA-256 below.

Until then:

- Gateway stays `inactive`. Do not `start`, `restart`, or `kickstart`.
- Do not open the live DB with sqlite3 unless `mode=ro` / `immutable=1` for metadata.
- Do not `VACUUM`, `integrity_check` against the live path as a writer, `.recover` in place, or delete live WAL/SHM.
- Do not deploy, rollback the composite, or change config/providers.

## Frozen hashes

```
corrupt DB        9a6617baf51cd083dc9c96852fcf4c7803bb6dfd4891865ad8609a3584818831
pre-cleanup rec.  1b2918286dfee6d1780201f6b140c4e72d639ef6a484f9deceb3f0fbace9a94a
PHASE1 CLEANED    4a92bb50ecaf562017950e3605454ce883ecea4515c69ac361e84127e29ed8fc
                  size 37801984; this is the only cutover identity
clean v7 restore  77daa71a96eb84fb0beb438b8adcfb3ab214b06a0f21db2481dd7e3e3d6883d4
                  (cael-manual-recovery-20260815T064304Z)
```

Host paths on Cael:

```
BACKUP_ROOT=$HOME/.openclaw/backups
INCIDENT=$BACKUP_ROOT/cael-state-corrupt-20260816T023456Z
CLEAN=$BACKUP_ROOT/cael-manual-recovery-20260815T064304Z/openclaw.sqlite
LIVE_DIR=$HOME/.openclaw/state
LIVE=$LIVE_DIR/openclaw.sqlite
STAGE=$LIVE_DIR/openclaw.sqlite.recover-6b09-20260816
```

## Phase 0 — already done (read-only)

Executed on a worker copy, not on Cael live:

1. Hash-verify the preserved snapshot.
2. `PRAGMA quick_check` / full `integrity_check`.
3. `.recover` into a new file; recovered `integrity_check=ok`, `user_version=7`.
4. Inventory priors by hash; two clean v7 snapshots exist.
5. Public-safe count/FK comparison (see `recovery-metrics.json`).

Re-check containment only:

```
ssh cael 'systemctl --user show openclaw-gateway -p ActiveState -p SubState -p NRestarts -p InactiveEnterTimestamp'
# expect: inactive / dead / NRestarts=0
sha256sum "$INCIDENT/openclaw.sqlite"
# expect: 9a6617ba…818831
stat -c '%s %y' "$LIVE"
# expect: 47599616 and mtime 2026-08-15 11:47:10
```

If any of those drifted, stop and re-analyze. Do not cut over.

## Phase 1 — DONE on worker (2026-08-16T06:27Z). No Cael mutation.

New dest: `/tmp/cael-state-db-recovery-analysis/work/phase1-20260816T062741Z/openclaw.recovered-cleaned.sqlite`

Rebuilt from the prior immutable `.recover` SQL dump (`1b291828…`), then DROP/DELETE/user_version=7/VACUUM.

```
sha256  4a92bb50ecaf562017950e3605454ce883ecea4515c69ac361e84127e29ed8fc
size    37801984
user_version 7 / schema_version 269
integrity_check ok; quick_check ok; foreign_key_check empty
model_catalog_remote COUNT(*)=0; lost_and_found absent
owner counts match recovery-row-counts.csv recovered column
```

Receipt: `phase1-receipt.json`.

## Phase 2–5 — EXECUTED 2026-08-16T06:54Z under gate `5306199372`

- Staged beside live; hashes `4a92bb50…` / `9a6617ba…`.
- Atomic `mv -n` live → `openclaw.sqlite.incident-held-20260816`, stage → live.
- Started existing `6b09` only. No deploy/config change.
- `/health` 200 live; `/readyz` 200 ready after settle; copy `integrity_check=ok`, `user_version=7`.
- Discord default connected. Catalog cache rebuilt (`bundle_json` ~1.17 MiB).
- Nonce-correlated Discord speech **not** fired from this lane (`pending-scribe`).
- Receipt: `cutover-receipt.json`.

## Phase 2 — copy candidate to Cael _beside_ live (still no cutover)

```
install -m 600 "$CAND" "cael:$STAGE"
ssh cael "sha256sum '$STAGE' && ls -l '$LIVE' '$STAGE' '$INCIDENT/openclaw.sqlite'"
```

The live filename must remain the incident file until Phase 4.

## Phase 3 — mutation gate (human)

Required text, posted on #1261 by the operator:

- names this file
- names the **post-cleanup** candidate SHA-256
- authorizes cutover on Cael
- confirms Gateway must stay stopped until Phase 5

No gate → no Phase 4.

## Phase 4 — atomic cutover (Cael, Gateway still stopped)

```
ssh cael 'systemctl --user is-active openclaw-gateway'
# must print: inactive

# Preserve the live inode under a new name. Do not delete it.
LIVE_HOLD=$LIVE_DIR/openclaw.sqlite.incident-held-20260816
ssh cael "set -euo pipefail
  test -f '$STAGE'
  test -f '$LIVE'
  test ! -e '$LIVE_HOLD'
  mv -n '$LIVE' '$LIVE_HOLD'
  mv -n '$STAGE' '$LIVE'
  chmod 600 '$LIVE'
  sha256sum '$LIVE' '$LIVE_HOLD' '$INCIDENT/openclaw.sqlite'
"

# Expect:
#   $LIVE        == post-cleanup candidate hash
#   $LIVE_HOLD   == 9a6617ba…818831
#   $INCIDENT DB == 9a6617ba…818831
# WAL/SHM should still be absent. Do not create or delete them by hand.
```

Rollback if hashes do not match:

```
ssh cael "set -euo pipefail
  mv -n '$LIVE' '$LIVE_DIR/openclaw.sqlite.aborted-cutover'
  mv -n '$LIVE_HOLD' '$LIVE'
"
```

## Phase 5 — start and ladder (only after Phase 4 hashes match)

Start the **same** composite. Do not update.

```
ssh cael 'systemctl --user start openclaw-gateway'
ssh cael 'systemctl --user show openclaw-gateway -p ActiveState -p NRestarts -p ExecMainStatus'
# expect: active / 0 / 0

# Liveness is not enough.
curl -sS -D- http://127.0.0.1:<gateway-port>/health
curl -sS -D- http://127.0.0.1:<gateway-port>/readyz
# /health 200 only proves the HTTP server.
# /readyz must be interpreted with channel + state checks below.
```

On a _copy_ of the now-live file (never `VACUUM` live):

```
ssh cael "cp -a '$LIVE' /tmp/cael-post-cutover-copy.sqlite && sqlite3 'file:/tmp/cael-post-cutover-copy.sqlite?immutable=1' 'PRAGMA integrity_check; PRAGMA user_version;'"
```

Owner smoke (no payload dumps):

- `openclaw channels status` — Discord account receiving
- doctor/state path does not report terminal integrity failure
- nonce-tagged Discord probe: one inbound snowflake → one admitted run → one visible outbound snowflake
- catalog refresh succeeds (empty cache is expected once)

If speech fails or integrity is not `ok`, stop the unit (`systemctl --user stop`, not restart) and execute rollback in Phase 4.

## Fallback if recover is rejected

Restore `CLEAN` (`77daa71a…`) with the same stage-beside + hash + gate ritual. Accept the 12.5 h rewind and stale `task_delivery_state` (+17 vs incident). Prefer this over a blind live restart of the corrupt file.

Fresh rebuild is last resort: move `$LIVE` to `$LIVE_HOLD`, let `6b09` create a new `user_version=7` DB, then reconstruct pairing/plugin/cron from external owners.

## Abort / remain stopped

If the gate is refused, leave Cael `inactive` with the incident file in place and the preserved snapshot untouched.
