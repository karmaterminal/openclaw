# 1246 direct-open stale ingress causal proof

Bound to `karmaterminal/openclaw#1246`. No PR opened. No GitHub issue mutation.

## Frozen identities

| Role                                                         | SHA                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Deployed pre-fix runtime (Elliott)                           | `46f4d2115700d574501bb3c4763abf6b2ba977fe`                                                                    |
| Introducing commit for `canExpireDiscordStaleAmbientBacklog` | `ebd44c4d30a3256fbd314de46ef577fcd0d6c484` (textual archaeology via `git log -S`, not a behavioral first-bad) |
| Fossil commit                                                | `68023dba9d62566de093c958137a33fb8492c77a`                                                                    |
| Intervention                                                 | `7871ecfeacfb9d00fac983439b39448a5f11f791`                                                                    |
| Fork `origin/main` (context only)                            | `6a637469a09b4e20637fb2056ba56bc9e154301e`                                                                    |
| Fork PR #1237 head                                           | `85e5252e17a693e843bcc7bebc76ba09c3911d85`                                                                    |
| Closest GitNexus index                                       | `530b33e4e37264c89ecd5abdd06279dd23d5c867` at `openclaw-85651-upstream-530b33e-gitnexus`                      |

Exact GitNexus index of this worktree/`46f4d211` was **not** available. No unbounded reindex was launched. Code-layer CALLS mix the closest index with exact-source reconstruction of `createDiscordIngressMonitor` → `createChannelIngressMonitor` → `createChannelIngressDrain` → `resolveIngressPendingDispositions`.

## Frozen incident ledger (public-safe only)

- Elliott runtime `46f4d211…`
- sprites lane `channel:1466192485440164011`
- 794 stale pending/claimed rows initially preserved
- oldest source row 2026-08-18 17:01 UTC
- `/new` released the stalled run; drain completed old rows FIFO at roughly one visible stale reply every 30–50 seconds
- rows had `attempts=0`
- new session was 21% context; gateway/host healthy
- deployed predicate only permits stale ambient expiry when `resolveDiscordShouldRequireMention(...) === true`
- Elliott room was direct-open (`requireMention:false`)
- Terra reasoning-only retries amplified admitted rows but did not own the historical Discord payload
- Comments: #1246 `5350760388`, `5351158895`; #1257 `5351160981`

No live prince DB, message bodies, or transcripts were copied.

## Defect nodes (kept separate)

| ID                     | Mechanism                                                      | This lane                                 |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `D-policy-direct-open` | Stale-expiry eligibility incorrectly depends on mention-gating | **Dominator for the fossil.** Intervened. |
| `D-abandonment-budget` | Claim→adoption abandonment / handler-timeout                   | Separate. Not required for fossil GREEN.  |
| `D-sqlite-pressure`    | Large synchronous agent/session DB delays adoption             | Separate. Cross-filed #1257.              |
| `D-model-amplifier`    | Reasoning-only/fallback retry after admission                  | Amplifies; does not introduce payload.    |

## Owner walk

Deployed `canExpireDiscordStaleAmbientBacklog` (`extensions/discord/src/monitor/ingress.ts`) required a proven non-thread guild row **and** `resolveDiscordShouldRequireMention(...) === true`. `resolvePendingDisposition` therefore returned `null` on direct-open ambient rows older than 15 minutes. Core drain then claimed FIFO and `deliver` dispatched, which is the visible-delivery / agent-turn boundary.

Fail-open already existed for addressed mentions, reply-to-bot, missing `referenced_message`, control commands, threads, DMs, and unknown channel kind. Expanding expiry off mention-gating made mismatched nested reply payloads a necessary companion fail-open (canonical hydration refetches when nested id ≠ reference id).

## Fossils

File: `extensions/discord/src/monitor/ingress.direct-open-stale.fossil.test.ts`

Isolated SQLite via `createChannelIngressQueueForTests`, synthetic Discord snowflakes/content, real durable enqueue-before-start order.

| Case                                                               | Pre-fix `46f4d211` / revert              | After `7871ecfe`                              |
| ------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- |
| Direct-open stale ambient                                          | **RED**: dispatched `1246-stale-ambient` | GREEN: `stale-ambient-backlog`, zero dispatch |
| Direct-open fresh ambient                                          | GREEN: dispatch once                     | GREEN                                         |
| Mention-gated stale + fresh mention                                | GREEN                                    | GREEN                                         |
| Fail-open mention/reply/missing/mismatch/control/thread/DM/unknown | GREEN                                    | GREEN                                         |
| Deep same-lane 12 stale + fresh tail                               | **RED**: 12 stale dispatches then fresh  | GREEN: 12 settled, fresh once                 |
| Restart recovery                                                   | **RED**: dispatched restart row          | GREEN                                         |
| Retry/re-enqueue after settle                                      | **RED**: never settled, dispatched       | GREEN: enqueue kind `failed`, no reanimate    |

## Intervention / revert / reapply

Minimal owner patch in `canExpireDiscordStaleAmbientBacklog`: after existing guild/non-thread/not-disallowed checks, return `true` instead of `resolveDiscordShouldRequireMention`. Companion: treat mismatched nested reply ids as hydratable. Deleted the obsolete test that encoded the defect (`preserves stale rows from an explicitly ambient guild`).

Production LOC: **+12 / -8 (net +4)**. Tests: fossil +559; obsolete test −43.

The +4 production lines are the mismatched-reply fail-open plus the invariant comment. Absorbing that into a new helper would grow surface; left local.

### Receipts

```text
# RED on deployed/fossil-only tree
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 \
  extensions/discord/src/monitor/ingress.direct-open-stale.fossil.test.ts
# 4 failed | 10 passed; assertion: stale direct-open rows must not dispatch
# received ['1246-stale-ambient'] (and 12-deep backlog FIFO)

# GREEN after intervention 7871ecfe
# Tests 14 passed (14)

# Patch-only revert: git checkout HEAD -- extensions/discord/src/monitor/ingress.ts \
#   extensions/discord/src/monitor/ingress.test.ts
# 4 failed | 10 passed; same dispatch assertion

# Reapply: restore intervention files
# Tests 14 passed (14)
```

Sibling (GREEN): Discord `ingress.test.ts` 10/10; preflight 61/61; core drain/monitor/freshness 52/52; retry/claim 21/21; queue/dead-letters 38/38.

## #1237 disposition

**Source material only; do not treat as superseding #1246.** Head `85e5252e17a` still ends `canExpireDiscordStaleAmbientBacklog` with `channelKind === "non-thread" && requireMention`. Queue/settlement/retry/channel-kind work is useful to reuse later, but the direct-open policy cell remains open there. This lane should be extended into that PR or land separately; it does not replace #1237's SDK/settlement work.

Upstream `openclaw/openclaw#121204`, `#97320`, `#97435` remain open provenance. No shipped upstream repair covers always-active rooms.

## Live proof

**Still owed.** This lane used synthetic durable fossils only. After independent review, live-prove on one recovered direct-open canary for a fixed window, then seat-by-seat. Do not treat fossils as live-channel proof.

## Remaining uncertainty

- Incident-shaped end-to-end/live counterfactual not run here.
- `D-abandonment-budget` and `D-sqlite-pressure` can still stall drain; they are not required to explain Elliott's mention-gate bypass.
- Settlement remains a durable `failed`/`stale-ambient-backlog` row on this SHA (health-pollution is a #1237 concern, not this policy cell).
- No behavioral bisect: introducing commit is textual archaeology.
- Full-suite tally is recorded in `output.md` after `node --import tsx scripts/test-projects.mts`.

## Graph

- `REPORTS/1246-direct-open-causal-proof.graphml`
- `REPORTS/1246-direct-open-causal-proof.gexf`
- `REPORTS/1246-direct-open-causal-proof.json` (NetworkX node-link)
- `REPORTS/1246-direct-open-causal-proof.nodes.csv`
- `REPORTS/1246-direct-open-causal-proof.edges.csv`

Required relations present: `EVIDENCES`, `BYPASSES`, `CAUSES`, `AMPLIFIES`, `ATTEMPTS_FIX`, `CHARACTERIZES`, `CAUSES_TEST_PASS`, `REVERT_RESTORES_RED`. No `PROVES` edge (receipt chain does not include live incident counterfactual).
