# §6.8 trace-context conformance report

Scope: prose-conformance only. Verdicts compare `docs/design/continue-work-signal-v2.md` §6.8 against `audit-journal-1e966b8a70.md`; they are not implementation-conformance verdicts.

## Summary verdicts

| Q | Audit status | Prose verdict | One-line final verdict |
| --- | --- | --- | --- |
| Q1 | GAP / UNTESTED | CONFORMANT | Q1 CONFORMANT: §6.8 explicitly names producer-side trace carrier acceptance as the missing tool/token/TaskFlow seam. |
| Q2 | GAP / UNTESTED | CONFORMANT | Q2 CONFORMANT: §6.8 correctly turns the default/direct return gap into a required child-return `traceparent` propagation contract. |
| Q3 | GAP / UNTESTED | CONFORMANT | Q3 CONFORMANT: §6.8 names the targeted single-recipient path and the exact queued-payload plus system-event `traceparent` seam. |
| Q4 | GAP / UNTESTED | CONFORMANT | Q4 CONFORMANT: §6.8 requires identical `traceparent` propagation to every explicit recipient, matching the audit's multi-target gap. |
| Q5 | GAP / UNTESTED | CONFORMANT | Q5 CONFORMANT: §6.8 requires identical `traceparent` propagation for tree/all fan-out recipients and ties it to fan-out span accounting. |
| Q6 | PARTIAL / UNTESTED end-to-end | CONFORMANT | Q6 CONFORMANT: §6.8 reflects the partial state by distinguishing durable queue persistence from restart replay re-application requirements. |
| Q7 | GAP / UNTESTED | CONFORMANT | Q7 CONFORMANT: §6.8 carries forward chain-step, not recipient-count, accounting and the over-budget suppression rule. |

No Q-level prose deltas are required.

## Per-question evidence

### Q1 — Producer-side IN

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 says producer-side tool/token/TaskFlow surfaces "MUST accept and persist a W3C `traceparent`" and calls this "the missing seam" at `docs/design/continue-work-signal-v2.md:1290` byte `00107674`; the table enumerates `continue_delegate`, bracket token, `PendingContinuationDelegate`, TaskFlow state, and producer span helpers at lines 1292-1298 bytes `00108117-00108873`. Audit Q1 is `GAP / UNTESTED` at `audit-journal-1e966b8a70.md:16-30` bytes `00003311-00005806`, with the same schema/parser/type/store/helper seams.

### Q2 — Return-side direct/default path

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 requires default/silent/direct return paths to carry child-return `traceparent` at `docs/design/continue-work-signal-v2.md:1302-1304` bytes `00109334-00109635` and states queue drain/successor span emission consume it as parent. Audit Q2 is `GAP / UNTESTED` at `audit-journal-1e966b8a70.md:32-47` bytes `00006245-00008431`, finding silent system events, heartbeat, direct delivery, gateway params, and fallback sends currently lack a trace carrier.

### Q3 — Return-side targeted single recipient

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 requires `targetSessionKey` returns to put the same `traceparent` on the resolved recipient's queued payload and immediate system event, and calls it the exact §3.3 audit seam, at `docs/design/continue-work-signal-v2.md:1305` byte `00109845`. Audit Q3 is `GAP / UNTESTED` at `audit-journal-1e966b8a70.md:49-61` bytes `00008832-00010096`, finding `enqueueContinuationReturnDeliveries` has no `traceparent` parameter and recommending adding it to both `enqueueSessionDelivery` and `enqueueSystemEvent`.

### Q4 — Return-side multi-recipient explicit `targetSessionKeys`

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 requires every explicit recipient to receive the same `traceparent` on queued payload and system event, "not none," at `docs/design/continue-work-signal-v2.md:1306` byte `00110101`. Audit Q4 is `GAP / UNTESTED` at `audit-journal-1e966b8a70.md:63-74` bytes `00010355-00011371`, finding multi-target delivery loops every target but omits `traceparent` for all recipients and recommending the same helper seam as Q3 plus per-recipient assertions.

### Q5 — Return-side `fanoutMode: "tree" | "all"`

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 requires tree/all fan-out recipients to receive identical `traceparent` and ties the producer-side `continuation.queue.fanout` span to chain-step cost at `docs/design/continue-work-signal-v2.md:1307` byte `00110312`; §6.8 also states cross-session/fan-out return-path queries must remain one subtree at line 1309 byte `00110604`. Audit Q5 is `GAP / UNTESTED` at `audit-journal-1e966b8a70.md:76-88` bytes `00011531-00012455`, finding tree/all recipient resolution calls the same traceparent-blind helper and recommending passing child-return `traceparent` after resolving recipients.

### Q6 — Recovery replay after gateway restart

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 states the durable session-delivery queue persists per-entry `traceparent`, then requires restart replay sinks to re-apply it for queued `systemEvent`, routed/unrouted queued agent-turn replay, and post-compaction delegate replay at `docs/design/continue-work-signal-v2.md:1311` byte `00110990`. Audit Q6 is `PARTIAL / UNTESTED end-to-end` at `audit-journal-1e966b8a70.md:90-108` bytes `00012614-00014995`: storage and recovery substrate preserve the field, but real replay sinks and post-compaction replay drop/ignore it.

### Q7 — Chain-budget-capped span emission / anti-flood

VERDICT: **CONFORMANT**

EVIDENCE: §6.8 says anti-flood accounting is by chain step, not recipient count; fan-out to N recipients consumes one step; and once `chainStepBudgetRemaining <= 0`, the producer does not thread `traceparent` past the cap at `docs/design/continue-work-signal-v2.md:1313-1317` bytes `00111590-00112308`. The immediately preceding §6.7 contract says queue-lifecycle spans are sampled at `0.0` once the budget is exhausted and one parent `continuation.queue.fanout` span covers N recipients at `docs/design/continue-work-signal-v2.md:1252-1270`. Audit Q7 is `GAP / UNTESTED` at `audit-journal-1e966b8a70.md:110-123` bytes `00015375-00018025`, finding current fan-out code lacks chain-budget arguments/suppression and recommending a single fan-out expansion seam that consumes one chain step per completion.

## Seam map verification

VERDICT: **PASS — §6.8 enumerates all 7 audit seam groups.**

| Audit seam group | Audit byte anchor | §6.8 seam map anchor | Result |
| --- | --- | --- | --- |
| Producer input contract | `audit-journal-1e966b8a70.md:127` byte `00018571` | `docs/design/continue-work-signal-v2.md:1325` byte `00113275` | Present |
| Producer span creation | `audit-journal-1e966b8a70.md:128` byte `00018862` | `docs/design/continue-work-signal-v2.md:1326` byte `00113416` | Present |
| Child run / spawn metadata | `audit-journal-1e966b8a70.md:129` byte `00019094` | `docs/design/continue-work-signal-v2.md:1327` byte `00113557` | Present |
| Default return | `audit-journal-1e966b8a70.md:130` byte `00019252` | `docs/design/continue-work-signal-v2.md:1328` byte `00113698` | Present |
| Targeted/multi/fanout return | `audit-journal-1e966b8a70.md:131` byte `00019434` | `docs/design/continue-work-signal-v2.md:1329` byte `00113839` | Present |
| Queue drain/replay | `audit-journal-1e966b8a70.md:132` byte `00019636` | `docs/design/continue-work-signal-v2.md:1330` byte `00113980` | Present |
| Anti-flood cap | `audit-journal-1e966b8a70.md:133` byte `00019848` | `docs/design/continue-work-signal-v2.md:1331` byte `00114121` | Present |

Note: the §6.8 seam-map row for Queue drain/replay includes `post-compaction-delegate-dispatch.ts`; that surface is supported by audit Q6's seam recommendation at `audit-journal-1e966b8a70.md:108` byte `00014995`, even though the numbered "Identified seams" row lists only `session-system-events.ts` and `server-restart-sentinel.ts`.
