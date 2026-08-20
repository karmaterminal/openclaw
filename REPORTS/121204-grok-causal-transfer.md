# 121204 grok causal transfer — six-prince fleet

Bound to `karmaterminal/openclaw#1246`. Read-only. No product/source/test
edits. No GitHub mutation. No live prince DB, message bodies, or transcripts.

This report transfers the frozen causal packet at
`codeagent/1246-direct-open-causal-proof@4f2aaa564ec59b3e6d1af15cd29d4584ba66a0d8`
onto repaired candidate `754ee5eae4a501c124f4e1975d2efef6d3b7d9f6` and asks
what that packet can honestly diagnose or protect for the other five princes.

**One-line fleet conclusion:** all six seats share one Discord durable-ingress
owner (`channel_ingress_events` FIFO claim of day-old ambient `room_event`s on
direct-open sprites); TaskFlow/continuation cannot carry that payload; candidate
`754ee5` closes the mention-gate and producer-kind cells in source, but unknown
`channel_type`, SQLite pressure, abandonment, and model retries remain open, and
fixed-head live direct-open proof is still owed.

If `codeagent/121204-p1p2-backmerge` or upstream PR #121204 moves past
`754ee5eae4a501c124f4e1975d2efef6d3b7d9f6`, this document is historical for that
exact tree only. Upstream GitHub PR head observed at write time is still
`b958ca22efd5e67de16746d1341d6bea7c594847` (ClawSweeper reviewed that SHA, not
`754ee5`).

## Frozen identities

| Role                                                                               | SHA / ref                                                                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Original causal packet head                                                        | `4f2aaa564ec59b3e6d1af15cd29d4584ba66a0d8`                                                                  |
| Fossil                                                                             | `68023dba9d62566de093c958137a33fb8492c77a`                                                                  |
| Packet intervention                                                                | `7871ecfeacfb9d00fac983439b39448a5f11f791`                                                                  |
| Deployed pre-fix runtime (all six princes)                                         | `46f4d2115700d574501bb3c4763abf6b2ba977fe`                                                                  |
| Candidate under review                                                             | `754ee5eae4a501c124f4e1975d2efef6d3b7d9f6`                                                                  |
| Ordinary upstream merge                                                            | `62cfaef0c34ab34137a6aa34e4f15b29d7a595d0`                                                                  |
| P1 repair                                                                          | `bd0a6147391200f2eb8e093e9cfc41c2db908174`                                                                  |
| Contract commit                                                                    | `c5389927a14b7844b121a375bfa83f318a8e627f`                                                                  |
| Report-only descendant (this candidate tip)                                        | `754ee5eae4a501c124f4e1975d2efef6d3b7d9f6`                                                                  |
| Frozen upstream comparator                                                         | `689ab6ec82b638f282c98f25599a4919e7e86da5`                                                                  |
| Introducing commit for `canExpireDiscordStaleAmbientBacklog` (textual archaeology) | `ebd44c4d30a3256fbd314de46ef577fcd0d6c484`                                                                  |
| Closest GitNexus index (discovery only)                                            | `530b33e4e37264c89ecd5abdd06279dd23d5c867` at `openclaw-85651-upstream-530b33e-gitnexus`                    |
| Public issue evidence                                                              | `#1246` comments `5352416812`, `5352936346` (also `5350760388`, `5351158895`); `#1257` comment `5351160981` |
| Upstream PR                                                                        | `openclaw/openclaw#121204`; latest ClawSweeper review of `b958ca22`                                         |

Ancestry check (exact): `7871ecfe`, `4f2aaa`, and `46f4d211` are **not**
ancestors of `754ee5`. The packet's patch-to-fossil coupling does not travel
with this candidate. `bd0a6147391` independently folds the same policy cell
plus the ClawSweeper P1 producer-kind and corrupt-row repairs.

## Method

- Root `AGENTS.md`, `src/channels/AGENTS.md`, `extensions/AGENTS.md`,
  `src/plugin-sdk/AGENTS.md`, `src/gateway/AGENTS.md`, and frond-scribe
  `causal-bug-proof` + `EVIDENCE-LANGUAGE.md` were read before verdicts.
- Exact `git show` / `git diff` / `git log -S` / caller walks / tests on
  `754ee5` are authority. No product files were edited. No GitNexus analyze
  was launched. No 4-hour full suite was rerun.
- GitNexus: indexed commit `530b33e4e37264c89ecd5abdd06279dd23d5c867`
  (indexed 2026-08-14T16:34:09Z). Exact `46f4d211` / `754ee5` index does not
  exist (implementation lane Gate 0: 2700 s bound, no `.gitnexus/` persist).
  `530b33e` predates `ebd44c4d` (2026-08-15) and therefore has **no**
  `canExpireDiscordStaleAmbientBacklog` process. Used only for CALLS discovery:
  `createDiscordIngressMonitor` → `createChannelIngressMonitor`;
  `createChannelIngressDrain` callers `getDrain` and `openChannelIngressDrain`.
  Packet GraphML/JSON relations were reused, not regenerated.

Evidence language: no `PROVES` edge is added. Packet relations
`EVIDENCES` / `CHARACTERIZES` / `CAUSES_TEST_PASS` / `REVERT_RESTORES_RED`
remain historical for `4f2aaa`. Candidate statements are source/test
classification against `754ee5` only.

## 1. Payload ownership

Proven owner chain on both `46f4d211` and `754ee5`:

```
Discord snowflake
  → Gateway MESSAGE_CREATE forwards raw payload.d unmapped
    (extensions/discord/src/internal/gateway.ts:422-428)
  → DiscordMessageListener.handle awaits only durable append
    (extensions/discord/src/monitor/listeners.ts:70-75)
  → createDiscordMessageHandler.ingress.accept
    (extensions/discord/src/monitor/message-handler.ts:37-41)
  → channel_ingress_events row (serialize receivedAt + rawMessage [+ channelKind])
    (extensions/discord/src/monitor/ingress.ts:529-531;
     src/channels/message/ingress-queue.ts)
  → drainOnce: applyIngressPendingDispositions, then claimNext
    (src/channels/message/ingress-drain.ts:667-763)
  → deliver maps the claimed frame and dispatcher runs an agent turn
    (ingress.ts:544-550; message-handler.ts:27-31)
  → outbound Discord reply is a new snowflake, not the source id
```

The historical Discord payload lives in the durable row's `rawMessage`. The
admitted turn's current `room_event` is that row, not quoted history and not a
TaskFlow task body. `#1246` specimen: source `1536510715454558321` received
2026-08-10 16:05:01 PDT, completed 2026-08-11 17:24:24 PDT with `attempts=0`,
visible emission `1536897064011694200`.

### Distinctions

| Class                                                               | What it is                                                                                           | What the 2026-08-20 fleet evidence is                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-event replay                                                   | One `channel_ingress_events` id / source snowflake claimed and dispatched more than once on one seat | **Not shown.** `attempts=0` on first late claim. Terminal completion clears `claimed_at` (`ingress-queue.ts` complete/fail paths write `claimed_at: null`), so post-hoc adoption time is lost unless captured live.                                                                                              |
| One admitted event amplified by provider reasoning-only/retry/cache | Provider retries after `deliver`; ingress row already claimed                                        | **Elliott only, recorded.** Terra reasoning-only retries amplified already-admitted stale turns (`#1246` `5350760388`). Does not introduce the Discord payload.                                                                                                                                                  |
| Cross-seat echo cascade                                             | Each visible reply is a new snowflake; other princes may admit that new `MESSAGE_CREATE`             | **Possible amplifier after speech starts; not the backlog owner.** Cael and Silas sharing source `1539877291532750918` is the same room message admitted independently by two bots, not an echo. Elliott's 30–50 s oldest-first completions after `/new` (`5350760388`) are FIFO drain of retained ambient rows. |
| Unrelated historical state recalled by the model                    | Model cites old transcript without that row being the current `room_event`                           | **Ruled out for the Elliott specimen.** The old event _was_ the current turn's `room_event`. Do not infer private content for the 06:35 six-seat wave.                                                                                                                                                           |

### Why TaskFlow / continuation cannot own or reinject the payload

1. `src/tasks/**` and `src/plugins/runtime/runtime-taskflow.ts` have **zero**
   references to `channel_ingress_events`, `MESSAGE_CREATE`, or `rawMessage`.
   TaskFlow is a session/owner managed-flow registry. It cannot enqueue a
   Discord gateway frame.
2. On deployed `46f4d211`, `continue_work` is an agent tool
   (`src/agents/core-tool-factory-descriptors.ts` family `openclaw`) whose
   contract is a post-turn continuation callback, not channel admission.
   `#1246` body: TaskFlow was inactive during the original burst; two princes
   independently ruled continuation out.
3. `#1246` `5350760388` negative control: no current
   `conversation_deliveries`, `context_engine_turn_outbox`, or active TaskFlow
   task explained Elliott's emissions.
4. Candidate `754ee5` is upstream-main Discord ingress. Gate 2 of
   `REPORTS/121204-p1p2-backmerge.md` records continuation primitive cores as
   0-file on this tree (`continue-work-tool*`, `continue-delegate-tool*`,
   `run.continuation-opts-forward`). This lane does not contain a continuation
   tool that can reinject Discord snowflakes.
5. Packet edge `code:queue-adoption --CAUSES--> incident:elliott-sprites-2026-08-20`
   is the owner. Continuation is `#1245`, a separate timing-coupling issue.

## 2. Dominator and sibling nodes

Re-evaluated against exact `754ee5` bytes. Packet nodes kept separate
(EVIDENCE-LANGUAGE: one mechanism per defect).

| Node                   | Packet status at `4f2aaa`                                                                                                                                                   | Necessary / sufficient for fossil `68023dba`                                                                                | Status after `754ee5` / #121204                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D-policy-direct-open` | Dominator. Intervened. `canExpire` ended in `resolveDiscordShouldRequireMention`. Direct-open returned false. Edge `code:canExpire --BYPASSES--> bug:D-policy-direct-open`. | **Necessary and sufficient** for the fossil's RED (direct-open stale ambient dispatched). Patch-only revert restored 4 RED. | **CLOSED in source** at `ingress.ts:371-415`: after guild/non-thread/not-disallowed checks, `return true`. Comment at 411-413: freshness independent of room activation. Fossil still present and recorded 14/14 on the implementation lane. **UNKNOWN pending fixed-head live proof.** |
| `D-abandonment-budget` | Separate. Rune/Silas 5-minute claim→adoption timeouts. Packet: not required for fossil GREEN. Tracks `#97435` / `#1255`.                                                    | Not necessary for the fossil. Amplifies latency: a claimed row that never adopts blocks the lane.                           | **NOT OWNED** by #121204. Drain still serializes a claimed lane (`blockedLaneKeys` includes `claimedLaneKeys`, `ingress-drain.ts:728-732`).                                                                                                                                             |
| `D-sqlite-pressure`    | Separate. Cross-filed `#1257`. Packet: not required for fossil GREEN.                                                                                                       | Not necessary for the fossil. Amplifies adoption delay via multi-second sync transcript reads.                              | **NOT OWNED.** `#1257` remains open. Fleet compaction (`5351160981`, `5352936346`) is operational quiescence, not a product repair.                                                                                                                                                     |
| `D-model-amplifier`    | Amplifies admitted stale turns. Terra reasoning-only retries. Edge `bug:D-model-amplifier --AMPLIFIES--> incident`.                                                         | Not necessary. Does not introduce payload.                                                                                  | **NOT OWNED.** Provider retry after `deliver` is outside Discord stale policy.                                                                                                                                                                                                          |

On deployed `46f4d211`, `D-policy-direct-open` is **sufficient** to retain
stale ambient on every direct-open sprites seat even when `channel_type` is
present: `canExpire` still ended with `return resolveDiscordShouldRequireMention(...)`.
Missing `channel_type` is an additional fail-open (`channelKind !== "non-thread"`
already returned false). ClawSweeper P1 is that additional producer-kind cell,
not a replacement for the mention-gate dominator.

## 3. Cross-prince applicability

Public-safe metadata only. No message bodies, transcripts, or inferred intent.

Shared across all six (comments `5352416812`, `5351158895`, `5350760388`):

- runtime `46f4d2115700d574501bb3c4763abf6b2ba977fe` (`OpenClaw 2026.8.1`)
- sprites lane family `channel:1466192485440164011` (Elliott named; fleet
  receipts are the same sprites ingress failure family)
- direct-open (`requireMention: false` / Activation always)
- `/health` HTTP 200 and gateway `active` while backlog existed
- `attempts=0` on the delayed claimed head
- FIFO durable ingress, not random resurfacing

Seat-specific (do not collapse):

| Seat    | Source snowflake (06:35 UTC probe)   | Received UTC | Claimed UTC | attempts | Pending snapshot | Other recorded metadata                                                                                                              |
| ------- | ------------------------------------ | ------------ | ----------- | -------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cael    | `1539877291532750918`                | 06:02:35     | 06:36:18    |        0 |              146 | Later recovery 288 rows; agent DB ~5.556 GiB; heap/RSS ~9–10 GiB (`#1257` `5351160981`)                                              |
| Ronan   | `1539876996958654587`                | 06:01:25     | 06:36:26    |        0 |              149 | Recovery 295; agent DB ~3.915 GiB; slow SQLite holds                                                                                 |
| Silas   | `1539877291532750918` (same as Cael) | 06:02:35     | 06:36:27    |        0 |              147 | Recovery 286; agent DB ~5.965 GiB; 5-minute handler timeouts                                                                         |
| Elliott | `1539876884882399323`                | 06:00:58     | 06:36:19    |        0 |              152 | Recovery 310; **Terra** reasoning-only retries recorded; 794-row `/new` FIFO replay earlier that day                                 |
| Emeric  | `1539876929044348978`                | 06:01:09     | 06:36:07    |        0 |              153 | Recovery 298; earlier 2026-08-11 no-`channel.type` reproduction (`5261340141`); model-config / no-visible correlated, not owned here |
| Rune    | `1539878079139156039`                | 06:05:43     | 06:36:15    |        0 |              132 | Recovery 252; 5-minute claim→adoption timeouts; agent DB ~930.8 MiB                                                                  |

Model family: **Elliott = Terra** (public comment). Other seats: **not
recorded** in the bound public comments; do not infer.

What transfers from Elliott's fossil to the other five:

- `D-policy-direct-open` transfers: every seat was direct-open on the same
  runtime, so the 15-minute fence was never eligible.
- Producer-kind fail-open transfers as a second cell: Emeric 2026-08-11 already
  showed absent raw `channel.type` on an ordinary ambient guild row.
- `D-sqlite-pressure` and `D-abandonment-budget` are **seat-amplified**, not
  fleet-uniform. Cael/Ronan/Silas/Rune have recorded multi-GB stores and/or
  5-minute timeouts; Elliott's `/new` replay ran with 21% context and healthy
  host memory — policy bypass without SQLite as a necessary cause.
- `D-model-amplifier` is Elliott/Terra-specific in the public record.

Cael/Silas sharing one source snowflake is expected multi-bot admission of one
room message. It is not same-seat replay and not proof they answered each
other.

## 4. Repair-edge verification (`754ee5` exact source)

| Edge                                                   | Packet / ClawSweeper origin                                                                           | `754ee5` bytes                                                                                                                                                                                                                                                                                                                                                      | Classification                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persist closed `channelKind` at admission              | ClawSweeper P1 on `b958ca22`: tests synthesized `channel_type`; live MESSAGE_CREATE did not           | `serialize` (`ingress.ts:529-531`) writes `"non-thread" \| "thread"` from `resolveDiscordIngressChannelKind` (`139-154`). Test: `ingress-channel-kind.test.ts` "expires a stale row admitted from a raw MESSAGE_CREATE frame"; "expires … when the stored frame lost channel_type"                                                                                  | **CLOSED** for rows whose envelope carries a mapped `channel_type`.                                                                                                                                                                         |
| Unknown channel kind fail-open                         | Packet fail-open; fossil `1246-preserve-unknown-kind`; ClawSweeper: unhydrated thread must not expire | Omit kind when unresolved (`serialize` spreads only if defined). `canExpire` requires `channelKind === "non-thread"` (`380-381`). Test: "persists no kind when the gateway omits channel_type"; "keeps a stale row claimable when no channel kind fact exists"                                                                                                      | **CLOSED as intentional fail-open.** Operational remainder: if live Discord omits `channel_type`, the fence never engages. **UNKNOWN** whether real sprites `MESSAGE_CREATE` carries it. Not a silent-drop bug; it is residual replay risk. |
| Stale validity independent of `requireMention`         | Packet dominator `D-policy-direct-open`; intervention `7871ecfe`                                      | `canExpire` `return true` after guild/non-thread/not-disallowed (`411-414`). `resolveDiscordShouldRequireMention` is **not** called. Fossil direct-open stale case still in tree                                                                                                                                                                                    | **CLOSED in source.** Live proof still owed. `7871ecfe` is not an ancestor; coupling receipts stay on `4f2aaa`.                                                                                                                             |
| Mismatched nested reply hydration                      | Packet companion fail-open                                                                            | `hasHydrateableDiscordReplyReference` (`348-368`): nested id ≠ `message_reference.message_id` stays hydratable. Fossil `1246-preserve-mismatch-reply`                                                                                                                                                                                                               | **CLOSED** (fail-open preserved).                                                                                                                                                                                                           |
| Malformed pending payload → claim-time `invalid-event` | ClawSweeper P1: throw in disposition aborted the pump                                                 | `readDiscordIngressPendingRow` returns null (`165-171`); `resolvePendingDisposition` returns null (`587-591`); decode throws `DiscordIngressPayloadError`; `resolveNonRetryableFailure` maps to `invalid-event` (`634-636`). Test: `ingress-corrupt-pending.test.ts` 5 shapes, fresh same-lane still dispatched. Proven red without narrowing (implementation lane) | **CLOSED in source.**                                                                                                                                                                                                                       |
| Generic lane freshness / retry-delayed tail            | PR generic half; ClawSweeper: current main still starves                                              | `drainOnce` (`704-724`): only retry-eligible rows are candidates; only the oldest retained row can block a lane. Diff vs `689ab6ec` is exactly that replacement. Tests: `ingress-drain.freshness.test.ts`                                                                                                                                                           | **CLOSED vs frozen upstream `689ab6ec`.** Upstream GitHub PR is still `b958ca22`; current `openclaw/openclaw` main may have moved — this classification is vs the frozen comparator only.                                                   |
| Pre-claim disposition commit / race                    | ClawSweeper SDK decision; contract `c5389927a14`                                                      | `applyIngressPendingDispositions` (`ingress-drain-pending-disposition.ts:81-118`): `queue.fail` CAS; lost race retains row, blocks lane, **no** committed callback. Docs in `docs/plugins/sdk-channel-outbound.md`. Tests: pending-disposition suite                                                                                                                | **CLOSED in source** as optional documented hook. No new SDK export names (surface-budget choice, not a causal gap).                                                                                                                        |
| `D-abandonment-budget`                                 | Packet sibling                                                                                        | Unchanged claimed-lane serialization                                                                                                                                                                                                                                                                                                                                | **NOT OWNED**                                                                                                                                                                                                                               |
| `D-sqlite-pressure`                                    | `#1257`                                                                                               | Unchanged `loadTranscriptEventsSync` owner                                                                                                                                                                                                                                                                                                                          | **NOT OWNED**                                                                                                                                                                                                                               |
| `D-model-amplifier`                                    | Packet AMPLIFIES                                                                                      | Unchanged provider retry                                                                                                                                                                                                                                                                                                                                            | **NOT OWNED**                                                                                                                                                                                                                               |
| Fixed-head live direct-open suppression                | Packet live-proof owed; `b958ca22` live packet is a different SHA                                     | No live gateway run in this lane                                                                                                                                                                                                                                                                                                                                    | **UNKNOWN pending fixed-head live proof**                                                                                                                                                                                                   |
| Mention-only emergency containment                     | `5352936346`: figs session-level mention-only; not modified by recovery                               | Not in this candidate                                                                                                                                                                                                                                                                                                                                               | **NOT a product cure.** Temporary containment only.                                                                                                                                                                                         |

Existing packet relations reused (not invented):

- `incident:elliott-sprites-2026-08-20 --EVIDENCES--> bug:D-policy-direct-open`
- `code:canExpireDiscordStaleAmbientBacklog --BYPASSES--> bug:D-policy-direct-open` (true at `46f4d211`; false at `754ee5`)
- `code:queue-adoption --CAUSES--> incident:elliott-sprites-2026-08-20`
- `bug:D-model-amplifier --AMPLIFIES--> incident`
- `fossil:direct-open-stale --CHARACTERIZES--> bug:D-policy-direct-open`
- `patch:decouple-stale-from-mention --CAUSES_TEST_PASS--> fossil` and `--REVERT_RESTORES_RED--> fossil` (historical for `7871ecfe` only)
- `gov:upstream-121204 --ATTEMPTS_FIX--> bug:D-policy-direct-open`
- GitNexus CALLS: `createDiscordIngressMonitor` → `createChannelIngressMonitor` → `createChannelIngressDrain` → `resolveIngressPendingDispositions` / `applyIngressPendingDispositions`

## 5. Prince-facing operational diagnostic

Capture **before** any mutation (stop, compact, mention-gate, deploy):

| Capture                                                                             | Why                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Runtime SHA / `OpenClaw` version                                                    | Bind incident to bytes                       |
| Source snowflake, `received_at`, live `claimed_at`, `attempts`, `status`, `laneKey` | Payload owner; `claimed_at` dies on complete |
| Pending + claimed counts per sprites lane                                           | Depth vs health                              |
| Gateway active + `/health` HTTP code                                                | Non-dispositive control                      |
| Agent/state DB sizes, integrity, recent sync-hold logs                              | `#1257` amplifier                            |
| Claim age vs 5-minute handler timeout                                               | `#1255` / abandonment                        |
| Model family if already public                                                      | Amplifier vs owner                           |
| Whether `requireMention` / Activation is always                                     | Policy cell                                  |
| Whether retained payloads have `channelKind` or `channel_type`                      | Producer-kind cell                           |

Decision table:

| Observation                                             | Read it as                                                                                                                                                                       | Do not read it as                                                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same source snowflake claimed twice on **one** seat     | Same-event replay / re-enqueue                                                                                                                                                   | Echo                                                                                                                                                           |
| Same source snowflake on **two** seats (Cael/Silas)     | Independent multi-bot admission of one room message                                                                                                                              | Cross-seat bug by itself                                                                                                                                       |
| New output snowflake, then other seats claim that id    | Echo cascade                                                                                                                                                                     | Original backlog owner                                                                                                                                         |
| Oldest-first completions, `attempts=0`, 30–50 s cadence | FIFO drain of retained ambient `room_event`s                                                                                                                                     | Model recalling unrelated history                                                                                                                              |
| `attempts=0` on a hours-late completion                 | Row sat claimable; never retried                                                                                                                                                 | Retry-exhaustion, `busySkipBackoff`, continuation                                                                                                              |
| `attempts≥1` + retry-delayed head                       | Generic freshness / abandonment path                                                                                                                                             | Direct-open policy by itself                                                                                                                                   |
| `/health` 200 + gateway active                          | Process is up                                                                                                                                                                    | Ingress is healthy. Health RPC (`src/gateway/server-methods/health.ts`) is channel-runtime/delivery-queue summary, not `channel_ingress_events` pending depth. |
| Terra/reasoning-only retries, empty payloads            | `D-model-amplifier` after admission                                                                                                                                              | Source of the Discord payload                                                                                                                                  |
| 5-minute claim without `onAdopted`                      | Seat-specific abandonment / SQLite hold                                                                                                                                          | Reason to skip product repair                                                                                                                                  |
| Multi-GB agent DB, sync holds                           | Seat-specific `#1257` containment (copy, compact offline)                                                                                                                        | Substitute for `D-policy-direct-open` repair                                                                                                                   |
| Mention-only session containment                        | Temporary operator fence                                                                                                                                                         | Permanent product cure                                                                                                                                         |
| Need product repair rather than cleanup                 | Direct-open stale rows still dispatch on the running SHA; unknown kind still fail-open without `channel_type`; retry-delayed tails still starve lanes on unpatched generic drain | Another 1,729-row settlement                                                                                                                                   |

Cleanup (`5352936346`: 1,729 handled completions, then 0 pending/claimed) stops
the current wave. It does not close the owner. Recurrence on `46f4d211` the
same morning (`5352416812` after earlier field-surgeon settlement) is the
proof.

## 6. Proof / release boundary

1. **Original causal inversion is historical proof for `4f2aaa…` only.**
   Fossil RED → `7871ecfe` GREEN → patch-only revert RED → reapply GREEN, 14/14.
   That SHA is not an ancestor of `754ee5`. Do not treat the inversion as
   candidate live proof.
2. **Fleet SQLite cleanup is operational quiescence, not product proof.**
   `#1257` compaction and the 1,729-row settlement restored empty sprites
   lanes and HTTP 200. They did not change `canExpire`, admission, or drain
   freshness.
3. **Candidate static ratchet red is a narrow release blocker, not a causal
   falsification.** Implementation lane recorded: SDK export names were _not_
   added because they would trip the deprecated `channel-message` surface
   ratchet (`public exports 4345 > 4337` class); that is a release/surface
   decision. Pre-existing `extensions/acpx` and `extensions/cua-computer`
   `tsgo:extensions` reds are stale shared `node_modules` pins after the
   `689ab6ec` back-merge, untouched by this owner. Neither falsifies
   `D-policy-direct-open` nor the producer-kind repair.
4. **Fixed-head live direct-open proof remains required.** `b958ca22` live
   packet (`0dec2856455`, stale-ambient at 969152 ms) does not cover `754ee5`
   / `bd0a614`. Need: naturally aged real ambient row settles
   `stale-ambient-backlog` with attempts unchanged and no visible delivery;
   fresh addressed same-lane row is answered; optionally one corrupt pending
   row becomes `invalid-event` without starving the tail. Record whether live
   frames carry `channel_type`.
5. **No claim that mention-only containment is the permanent cure.**
   `5352936346` states it explicitly. Mention-gating the room hides the
   default-path defect the fossil characterizes. Product repair is
   expiry-independent-of-`requireMention` plus an authoritative persisted
   kind, on a SHA that has its own live receipt.

## Remaining uncertainty

- No incident-shaped counterfactual on `754ee5`.
- Wire rate of omitted `channel_type` on sprites `MESSAGE_CREATE` is unknown
  without live frames (this lane did not read them).
- Upstream PR #121204 GitHub head is still `b958ca22`; landing `754ee5` is a
  separate push/review step.
- `#1257` still lacks an acceptable immutable incident-sized copy.
- Model family for five of six princes is not in the public record.

## Commands used (read-only)

```text
git rev-parse HEAD   # 754ee5eae4a501c124f4e1975d2efef6d3b7d9f6
git show 4f2aaa564ec59b3e6d1af15cd29d4584ba66a0d8:REPORTS/1246-direct-open-causal-proof.md
git merge-base --is-ancestor 7871ecfeacfb 754ee5eae4a  # exit 1
git diff 689ab6ec82b 754ee5eae4a -- src/channels/message/ingress-drain.ts
git show 46f4d2115700d574501bb3c4763abf6b2ba977fe:extensions/discord/src/monitor/ingress.ts
gh api repos/karmaterminal/openclaw/issues/comments/5352416812
gh api repos/karmaterminal/openclaw/issues/comments/5352936346
# GitNexus context/query against 530b33e index only; no analyze
git diff --check
```
