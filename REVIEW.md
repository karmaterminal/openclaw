# Independent Review: #1415 Coalescing Drain

**Candidate:** `9994eb4ef642173119a084710ac11533ddfcbe4e`
**Base:** `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`
**Overall verdict: REQUEST CHANGES**

## Named refs

| ref | value | local / tracking / server |
| --- | --- | --- |
| product/base | `ab5a30ea79b776f149e24b1fccab9e79b0a5d299` | local/worktree and candidate ancestry verified; N/A tracking/server for base |
| lane/safe branch | `codeagent/1415-review` @ `9994eb4ef642173119a084710ac11533ddfcbe4e` | local = tracking = origin |
| candidate branch | `codeagent/1415-coalesce` @ `9994eb4ef642173119a084710ac11533ddfcbe4e` | local = origin |
| CI/workflow | N/A; focused proof only | no Mode-B run |
| presentation | N/A | N/A |
| docs/proof | `REVIEW.md` and `output.md` at lane root | untracked lane artifacts |

GitNexus exact-commit index was unavailable: the MCP index did not contain this worktree and `gitnexus status` reported no index for the lane. The review therefore used a direct diff and callers walk.

## Blocking findings

1. **Cross-sender aggregation is not opt-in for all ambient room prose.**
   - `src/auto-reply/reply/queue/delivery-context.ts:213-241` returns a room-baseline aggregate source for every eligible `room_event` with no owner facts. The `ambientOwnerAggregate === true` opt-in is checked only inside `isAmbientOwnerPeer` for owner facts; `resolveRoomAggregateSource` has no corresponding opt-in check for ordinary non-owner senders.
   - `src/auto-reply/reply/queue/delivery-context.ts:246-260` then assigns those sources the same cross-sender room-aggregate batch key.
   - This contradicts the workorder/ruling's least-authority rule: only allowlisted bot peers' unaddressed room prose may coalesce, and only when the seat opts in. The existing CAND2 behavior may explain how the lane inherited this broad fold, but it is still present at candidate head and is not a lane safety guarantee.

2. **A principal room line can still be dropped at queue capacity.**
   - `src/auto-reply/reply/queue/enqueue.ts:400-472` removes discardable ambient items only when an item is room chatter and `protectFromQueueOverflow` is false. It then applies the generic queue policy.
   - `src/auto-reply/reply/queue/enqueue.ts:330-359` protects only a verified account explicitly listed in `ownerQueueProtectionAccounts`; `senderIsOwner` or command-owner authority alone does not set that protection.
   - `src/auto-reply/reply/queue/enqueue.ts:538-609` promotes only that explicitly protected class. The principal precedence path at `src/auto-reply/reply/queue/envelope.ts:289-313` does move a principal ahead of chatter, but precedence is not a custody guarantee. If the queue is already at cap and no sufficient ambient survivor makes room, drop-old/drop-new can consume or displace the principal source.
   - This conflicts with "Never lose or reorder a principal ... message" and the lane's own accepted edge at REPORT line 5 ("figs at the cap": the line can still be shed). It cannot be accepted as complete even if the priority case is now rarer.

## Should-fix findings

3. **The new bounded-age tests do not exercise wall-clock/real-timer state at the ownership boundary.**
   - `src/auto-reply/reply/queue.room-precedence.test.ts:317-431` constructs source timestamps directly as `Date.now() - ageMs`, and the final suite failed to start independently due missing `@solidjs/vite-plugin`/`@openclaw/proc-safe` worktree dependencies.
   - The production mailbox mixes `performance.now()` for `queue.lastEnqueuedAt` and `Date.now()` for source `enqueuedAt` in `src/auto-reply/reply/queue/enqueue.ts:51-76`. The lane's fixtures prove the arithmetic under synthetic values, but do not independently prove real timer identity, timer scheduling, retry backoff, and a live active/inactive turn in one owner test.

4. **The plugin gate has no named regressions for `canticle` or `voice-call`.**
   - `src/auto-reply/reply/queue/room-aggregate-plugin-gate.ts:12-92` closes aggregation for owners outside the audited bundled allowlist, and third-party origins are excluded.
   - `src/auto-reply/reply/queue/room-aggregate-plugin-gate.test.ts:68-184` proves generic origins, registry surfaces, unreadable inventory, workspace mismatch, and lazy tool owners, but it does not name or load the two plugins the workorder explicitly requires.
   - This makes the claim that `canticle` and `voice-call` close the gate inferable from static code but unverified as an integration contract.

5. **`dropPolicy: "summarize"` preserves previews, but old/new shedding is not a uniform counted observation.**
   - `src/auto-reply/reply/queue/enqueue.ts:360-398` records/disposes an ambient overflow source; preview handoff occurs only because `preserveAmbientOverflowContext` is selected.
   - `src/auto-reply/reply/queue/ambient-context.ts:28-89` counts inherited shed sources and previews up to the cap, but when another drop policy has no surviving recipient or no summarize context, the only observable effect is diagnostic/disposition state.
   - The review claim "nothing shed silently" is not true for every queue policy. The lane should define and test one end-to-end count/continuity record for old, new, and summarize paths rather than relying on separate internal dispositions.

## Test coverage assessment

- **Quoted reply batch:** The integration fixture and unit helper exercise differing reply targets and verify one ambient turn. The direct source is checked at `test/discord-room-backlog-coalesce.integration.test.ts:291-309`.
- **Principal and mention precedence:** Integration and queue tests cover principal/mention ahead of ambient lines (`test/discord-room-backlog-coalesce.integration.test.ts:315-345`; `src/auto-reply/reply/queue.room-precedence.test.ts:118-214`). They do not cover a full protected queue losing a principal, because no direct case pins the cap boundary.
- **Idle chatter:** Dispatch tests cover an arriving mention/principal while chatter waits (`src/auto-reply/reply/dispatch-from-config.room-chatter.test.ts:108-120`; `src/auto-reply/reply/queue.room-precedence.test.ts:275-314`).
- **Shed previews:** Overflow tests cover preview/count behavior, but not every drop policy and not the principal-cap loss path.
- **Authority:** Existing tests cover many owner, plugin, tool-policy, and ambient-owner exclusions. They do not pin the opt-in rule for ordinary human room prose versus only allowlisted bot peers.
- **Realism:** The Discord integration path uses gateway-frame/context fixtures and the real ingress/drain/queue composition, but replaces the agent runner and Discord transport. It does not prove a live model turn or live Discord delivery.

An independent focused rerun was attempted on `9994eb4ef642173119a084710ac11533ddfcbe4e`, but the lane's shared same-host dependency install was missing:
`@solidjs/vite-plugin` and `@openclaw/proc-safe`. Per lane rules no `pnpm install` was run in the worktree. This is a tooling/receipt gap, not a passing test receipt.
