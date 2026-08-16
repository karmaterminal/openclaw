# Ward 1262 C2 selector — no incident-bound specimen

- **Issue:** https://github.com/karmaterminal/openclaw/issues/1262
- **Parent:** https://github.com/karmaterminal/openclaw/issues/1256
- **M2:** openclaw/openclaw#124454 @ `d74c71c0a3e585f5411c6ea1fac236ee30445299` (base `acbbff19bad`)
- **Causal report:** `cfbb29bfd3e751e718fda44649b690268621f13f`
- **Branch:** `codeagent/ward-1262-c2-selector`
- **Verdict:** no-reproduction — missing incident-bound immutable agent store
- **Closed M2 reason:** none observed
- **Model:** Grok 4.6

## What changed

No product code. Report artifacts only:

- `specimen-ledger.json` — hashes/metadata of existing backups; live paths excluded from copy
- `selector-receipt.json` — one public-safe outcome
- `successor-issue-draft.md` — snapshot-collection successor, not a C2 repair

## Procedure

1. Read #1262, #1256, M2 source/tests, M2 proof handoff, causal ledger/observations.
2. Inventoried Cael / Ronan / Emeric backup roots by `stat`/`find`/`sha256sum` only. Did not open SQLite. Did not copy live DBs.
3. No specimen bound to the 2026-08-15 traces. Stopped (issue procedure step 7 / workorder step 3).
4. Control: exact M2 owner fossil on a known-valid synthetic turn — 21/21 passed; valid frozen context remains valid.
5. Affected copied-store replay: 0 runs. Determinism: not applicable.

## Binding failures (exact missing artifact)

Need: one immutable `openclaw-agent.sqlite` (+ WAL if present) whose size/time can be related to:

| Seat | Trace | Fail local | Frozen agent bytes | Frozen WAL |
| --- | --- | --- | ---: | ---: |
| Cael | `818314b20865025cc092d3042672f63b` | 09:27:21.779 | 5,403,803,648 | 5,084,112 |
| Ronan | `39bb0342c1c8abf08d305343b75028a6` | 09:55:12.726 | 3,796,570,112 | 5,265,392 |
| Emeric | `9af101e0eeb3b3058bc3810e5b8851ad` | 09:38:03.172 | 6,622,703,616 | 5,187,112 |

Found instead:

- Live DBs still gateway-owned and larger than frozen sizes (Cael 5,404,979,200; Ronan 3,903,057,920; Emeric 6,695,112,704 at 2026-08-16T07:00Z). Forbidden.
- Closest agent copies: Cael 2026-08-12 4,472,635,392 (`ce0f49564769…`); Emeric 2026-08-06 6,206,427,136 (`543ecc9a17ea…`); Ronan has **no** agent-store backup.
- 2026-08-15 “backups” are shared-state `openclaw.sqlite` only.
- No ZFS/btrfs/snapper snapshot of the agent path. Emeric `/.snapshots` exists and is empty.

## Coordination

- **#124176:** same warning family, yield-specific. Traces had `sessionsYieldMarkers=0`. Do not absorb. Keep coordinating, do not duplicate.
- **#119901 / #1257:** SQLite plan work. Not this selector.

## Validation

```text
OPENCLAW_HEAVY_CHECK_LOCK_SCOPE=worktree node scripts/run-vitest.mjs \
  extensions/codex/src/app-server/settled-turn-context.test.ts
# 21/21 passed in 23.36s on d74c71c0a3e
```

Full sanctioned suite on `d74c71c0a3e` (report files only; no product delta):

```text
OPENCLAW_HEAVY_CHECK_LOCK_SCOPE=worktree node --import tsx scripts/test-projects.mts
# 539/539 shards invoked in 1822.80s; wrapper exit 1
# Unique FAIL test files: 20. Owner settled-turn-context*: 0.
# configured-mcp 120s timeouts: same class as M2 exact-base hang.
# Other reds match M2 out-of-lane families (UI Playwright, TUI PTY,
# IPv6 portal, HOME isolation, respawn, git-backup, exec PATH) plus a
# few extra non-owner files. Not repaired here.
# Wrapper digest claimed 357 failed shards; that overcounts — only 20
# unique FAIL files appear in the log.
```

## Uncertainties

- Whether an off-mesh backup exists that this inventory did not see.
- Even after a bound DB copy exists, attempt-local `mirroredMessages` / `settledMessages` / `turnId` may still be required; they are not known to be persisted as a closed capture record.
- Inner M2 reason on the 2026-08-15 traces remains unknown. M2 itself is not a cure.

## Commands

```text
ssh {cael,ronan,emeric} 'stat/find/sha256sum on backup paths only'
OPENCLAW_HEAVY_CHECK_LOCK_SCOPE=worktree node scripts/run-vitest.mjs \
  extensions/codex/src/app-server/settled-turn-context.test.ts
```
