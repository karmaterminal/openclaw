# Independent Review: #1415 follow-up

**Candidate:** `94e63a93d8747128ee91032531d7e33ff0422e5e`
**Range:** `9994eb4ef642173119a084710ac11533ddfcbe4e..ce383fa05467ba989871d3e8344fa8e837d5f4e8`
**Reviewed head:** `ce383fa05467ba989871d3e8344fa8e837d5f4e8`
**Overall verdict: REQUEST CHANGES**

## Named refs

| ref              | value                                                                                                                                    | local / tracking / server                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| product/base     | `9994eb4ef642173119a084710ac11533ddfcbe4e`..`ce383fa05467ba989871d3e8344fa8e837d5f4e8`; focus `94e63a93d8747128ee91032531d7e33ff0422e5e` | local = tracking = server for `ce383fa0` and both heads verified |
| lane/safe branch | `codeagent/1415-review2` @ `ce383fa05467ba989871d3e8344fa8e837d5f4e8`                                                                    | local = tracking = server                                        |
| CI/workflow      | N/A; focused tests not rerun                                                                                                             | no Mode-B or extra CI run                                        |
| presentation     | N/A                                                                                                                                      | N/A                                                              |
| docs/proof       | `REVIEW.md` and `output.md` at lane root                                                                                                 | untracked lane artifacts; lane branch published unchanged        |

## Blocking findings

1. **The aggregate scope remains broader than 🌊's ruling.**
   - `src/auto-reply/reply/queue/delivery-context.ts:213-241` folds every room event with baseline authority into a senderless source. Only owners are additionally checked by `isAmbientOwnerPeer`; ordinary human/non-owner room prose has no `ambientOwnerAggregate === true` opt-in check.
   - `src/auto-reply/reply/queue/delivery-context.ts:246-260` uses that source as the cross-sender batch key.
   - This is unchanged by `94e63a93` and does widen the 30163 review candidate beyond the least-authority ruling: baseline-authority human or bot room prose is eligible to aggregate without a per-seat opt-in. The follow-up itself says this is pinned and needs a ruling, rather than resolving it.
   - **Rating: blocking** (scope/authority). The ruling must explicitly authorize this ordinary-room-prose fold, or the aggregate eligibility must require the opt-in and the allowlisted peer rules.

## Findings closed

2. **Principal custody at queue capacity: closed.**
   - `src/auto-reply/reply/queue/enqueue.ts:379-386` derives custody only from verified channel account provenance plus `isPrincipalSender`.
   - `src/auto-reply/reply/queue/enqueue.ts:483-486` holds that principal source instead of applying drop-new/drop-old.
   - `src/auto-reply/reply/queue/enqueue.ts:216-223` records the held condition once.
   - `src/sessions/session-controller.mailbox-dispatch.ts:124-129` bounds a collected principal batch to `mailbox.cap`, while `src/auto-reply/reply/queue.room-owner-overflow.test.ts:535-553` pins bounded collection and `src/auto-reply/reply/queue.room-shed-accounting.test.ts:413-423` pins one held record.
   - This does not rely on `senderIsOwner` or command authority alone: the provenance set is channel-scoped and bot owners remain out.

3. **One consistent queue clock: closed.**
   - `src/auto-reply/reply/queue/types.ts:55-59` records `queuedAt` with `performance.now()`, separate from wall-clock `enqueuedAt`.
   - `src/auto-reply/reply/queue/enqueue.ts:60-82` calculates all chatter-age and debounce state from `performance.now()`.
   - `src/auto-reply/reply/queue.room-precedence.test.ts:331-376` steps `Date` forward/back while retaining `performance.now()` and verifies steady elapsed-time flushing.

4. **Canticle and voice-call keep the aggregate closed: closed.**
   - `src/auto-reply/reply/queue/room-aggregate-plugin-gate.test.ts:265-343` names both plugins, their origins, tool inventories and registered-tool cases.
   - `src/auto-reply/reply/queue/room-aggregate-plugin-gate.test.ts:363-383` drains enabled-room bursts and expects every sender to remain separate.
   - The gate implementation's audited bundled set does not include either plugin: no bundle widening is introduced.

5. **Shed accounting across drop-old, drop-new and summarize: closed for the in-process ownership boundary.**
   - `src/auto-reply/reply/queue/capacity-record.ts:1-41` emits one named capacity outcome per decision.
   - `src/auto-reply/reply/queue/ambient-context.ts:63-162` hands one unread shed count and previews to a pending room turn, avoiding a second count for attached context.
   - `src/auto-reply/reply/queue.room-shed-accounting.test.ts:400-423` pins one held record and no duplicate steer record.
   - Remaining redelivery or recovery gaps are recovery behavior, not a count lost under the normal drop policy boundaries; the lane should continue to pin the existing admitted-ingress redelivery contract.

## What is still wrong

- The ruling issue is real, independent of the queue repair: ordinary room aggregate eligibility is not behind the opt-in. This lane must get an explicit ruling or tighten the gate before the follow-up can be accepted.
- The follow-up closes the principal, clock, plugin and counted-shed mechanics, but does not alter this authority fact.

## Validation

- No code changes were made in this lane.
- No focused test rerun was required or requested for this read-only review.
- CI: focused-only; no broad CI or Mode-B run.
- Lane branch `codeagent/1415-review2` was published to `origin` at `ce383fa05467ba989871d3e8344fa8e837d5f4e8`.
