# PR 124337 pinned-upstream overlap review

## Verdict

**ABSORB_REQUIRED**

The component remains semantically necessary at pinned upstream floor
`43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`. Upstream has refactored the same
settlement neighborhood and added adjacent ingress fixes, but it still routes
genuine `onAbandoned` settlement through a plain retry-accounting release and
still tests that abandonment remains pending beyond the configured failure
threshold. It therefore neither independently solves nor supersedes the
component's bounded-abandonment behavior.

A later back-merge is not clean. It needs a bounded reconciliation of two
production conflicts while preserving upstream's new heartbeat, drain-state,
claim-writer, shutdown, and lane-ordering work.

## Named refs and identity

Identity was resolved before crediting evidence. The safe review lane was
published unchanged before the checks below.

| Category         | Named ref                                                                   | Resolved SHA                                                | Identity                                                                                                 |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Product/base ref | component `codeagent/124337-current-drift-6ae89b5a-20260827`                | `eee69b3d51c68c76c25c376451c161497e614a2b`                  | local remote-tracking ref = `origin` server ref                                                          |
| Product/base ref | pinned floor `openclaw/openclaw@43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`   | `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`                  | local commit object = live GitHub commit API                                                             |
| Safe lane ref    | `codeagent/124337-current-upstream-43a7-overlap-20260829`                   | `eee69b3d51c68c76c25c376451c161497e614a2b` at evidence time | local branch = remote-tracking ref = `origin` server ref; expected to advance only by this report commit |
| CI/workflow ref  | N/A                                                                         | N/A                                                         | Report-only lane; no broad acceptance workflow used                                                      |
| Presentation ref | N/A                                                                         | N/A                                                         | Explicitly out of scope                                                                                  |
| Docs/proof ref   | existing exact corpus on `codeagent/124337-current-drift-6ae89b5a-20260827` | `eee69b3d51c68c76c25c376451c161497e614a2b`                  | read-only; local remote-tracking ref = `origin` server ref                                               |

The component/floor merge base is
`6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578`.

## Mergeability

The real command

```text
git merge-tree --write-tree --messages \
  eee69b3d51c68c76c25c376451c161497e614a2b \
  43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5
```

exited `1`, emitted synthetic tree
`1812157de63f25338eabbf365a7449a920389e58`, and reported content conflicts in:

- `src/channels/message/ingress-drain-lifecycle.ts`
- `src/channels/message/ingress-drain.ts`

This agrees with the live PR state at component head
`eee69b3d51c68c76c25c376451c161497e614a2b`: `mergeable=CONFLICTING` and
`mergeStateStatus=DIRTY`. The conclusion comes from the merge-tree exit and
unmerged stages, not conflict-marker scanning.

## Authored-path and symbol intersections

The component changes 11 paths. The floor changes four of those paths after the
merge base:

| Path / symbol                                                                                                                     | Floor change                                                                                                                                | Classification                                 | Consequence                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/channels/message/ingress-drain-lifecycle.ts` — `ChannelIngressDispatchLifecycle`, `bindIngressLifecycleToReplyOptions`       | #127950 adds `onDeferredHeartbeat` and forwards it into reply ownership                                                                     | **semantic-material**                          | Merge both contracts: retain heartbeat and component `onCancelled` forwarding. The file conflicts because both extend the same lifecycle shape.                              |
| `src/channels/message/ingress-drain.ts` — settlement writer, `applyFailureDisposition`, unadopted settlement, lifecycle callbacks | #131731 moves the settle owner; #131742 splits claim writes; #127849 fixes delayed lane heads; #131962 preserves retry facts after shutdown | **semantic-material**                          | The upstream refactors and adjacent fixes must be retained, while genuine abandonment must still enter `applyFailureDisposition`. This is the principal content conflict.    |
| `src/plugin-sdk/channel-ingress-runtime.ts` — `fanInChannelIngressLifecycles`                                                     | #127950 fans out deferred heartbeats; #123793 adds an unrelated SDK export elsewhere in the file history                                    | **semantic-material**                          | Retain heartbeat fan-out and the component's mixed modern/legacy cancel distinction. Upstream still invokes legacy `onAbandoned` without a cancellation marker.              |
| `src/plugin-sdk/channel-ingress-runtime.test.ts`                                                                                  | #123793 adds identifier-authentication coverage                                                                                             | **textual-only**                               | The merge-tree auto-merges it. Keep both the unrelated identifier tests and component fan-in cancellation tests.                                                             |
| `src/channels/message/ingress-drain-state.ts` — `createIngressSettleOwner`                                                        | #131731 independently moves the same settle-owner implementation here                                                                       | **upstream equivalent** for this refactor only | Prefer upstream's owner location and remove the component copy from `ingress-drain-lifecycle.ts` during absorption. This equivalence does not cover abandonment disposition. |
| `src/channels/message/ingress-claim-writes.ts` — `createIngressWriter`                                                            | #131742 extracts complete/release/fail write retries from the conflicted drain                                                              | **semantic-material** architectural overlap    | Use the extracted upstream writer rather than restoring the component's in-file writer.                                                                                      |

The component-only extension tests in Feishu, Mattermost, and Microsoft Teams
have no byte overlap with the pinned floor. Their contract remains relevant
because they cover sibling channel paths through the shared drain.

## Semantic and test intersection

The owning boundary is the shared durable ingress drain:

1. Reply-lane and debounce callers invoke the bound lifecycle from
   `src/channels/message/ingress-drain-lifecycle.ts`.
2. Fan-in callers in Discord, Feishu, iMessage, Mattermost, Microsoft Teams,
   Signal, and WhatsApp compose those callbacks through
   `fanInChannelIngressLifecycles`.
3. `createChannelIngressDrain` owns the durable claim's complete, release, or
   dead-letter disposition.

At the floor, `onAbandoned` calls `releaseUnadopted` with
`lastError: "turn-abandoned"` in
`src/channels/message/ingress-drain.ts:394`. That release records another
attempt but does not call `applyFailureDisposition`. The floor locks this in
with `keeps retry-accounted abandonment pending beyond the failure threshold`
in `src/channels/message/ingress-drain.test.ts:683`.

The component instead settles genuine abandonment through
`applyFailureDisposition` in `src/channels/message/ingress-drain.ts:400-417`.
Its corresponding test requires a payload-retaining
`retry-limit-exceeded` dead letter and follower-lane progress in
`src/channels/message/ingress-drain.test.ts:683` and
`src/channels/message/ingress-drain.abandonment-retry-budget.test.ts:69`.
These are directly contradictory semantics, so the floor is not equivalent.

Cancellation is also not equivalent. The floor's mixed fan-in fallback invokes
a legacy lifecycle's `onAbandoned` directly in
`src/plugin-sdk/channel-ingress-runtime.ts:167-173`, which reaches the
retry-accounting drain path. The component marks only that fallback as
cancellation and forwards explicit `onCancelled` through the reply binding.
Its queue-boundary test proves zero retry charge for mixed capable/legacy
fan-in while genuine abandonment still terminalizes in
`src/channels/message/ingress-drain.cancellation.test.ts:105`.

Adjacent floor tests must be carried through the back-merge:

- #127950 expands `src/channels/message/ingress-drain.watchdog.test.ts` for
  deferred-heartbeat rearming.
- #127849 expands `src/channels/message/ingress-drain-lanes.test.ts` for delayed
  lane heads.
- #131962 adds shutdown/restart coverage to the watchdog suite.
- #123793 adds unrelated identifier-authentication SDK coverage.

These narrow the safe resolution but do not exercise repeated explicit
abandonment or mixed fan-in retry facts.

## Upstream fixes and related work

Direct floor ancestry and fresh GitHub/gitcrawl searches found no merged
upstream equivalent:

| Ref     | State at review                                    | Relationship                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #131731 | merged in floor                                    | Equivalent only to the component's settle-owner extraction; no abandonment policy change.                                                                                                                                                                             |
| #131742 | merged in floor                                    | Refactors claim writes out of the drain; must be absorbed, but does not change abandonment disposition.                                                                                                                                                               |
| #127950 | merged in floor                                    | Adds deferred heartbeat to keep queued messages alive through long turns; adjacent lifecycle work, not an abandonment-ceiling fix.                                                                                                                                    |
| #127849 | merged in floor                                    | Corrects delayed FIFO lane-head ordering; adjacent lane behavior, not an abandonment-ceiling fix.                                                                                                                                                                     |
| #131962 | merged in floor                                    | Preserves retry facts across drain shutdown and restart; adjacent recovery behavior, not an abandonment-ceiling fix.                                                                                                                                                  |
| #120419 | open at `cd0e3eee599c0c33b8ef12f29b191793e0fe9aec` | Routes watchdog stalls through retry policy. It concerns timeout-owned settlement, not explicit `onAbandoned`, and therefore does not supersede the component. Its current patch also overlaps the drain/state owner and will need separate reconciliation if merged. |
| #127229 | open                                               | Reports Telegram watchdog/tombstone ordering after a retrying stall. It is adjacent recovery evidence, not the repeated-abandonment defect.                                                                                                                           |
| #124522 | closed, unmerged                                   | Proposed preserving Feishu dispatch failure causes through `onFailed`; it does not solve genuine abandonment or mixed legacy cancellation.                                                                                                                            |
| #115891 | merged before this drift window                    | Preserves ingress-retried messages when queued runs are dropped. It is part of the inherited architecture, not a new equivalent.                                                                                                                                      |

Repository history containing the component's exact
`turn-abandoned`/bounded-abandonment commits exists only on fork component and
composite branches. Those commits are not ancestors of the pinned upstream
floor.

## GitNexus receipt

The installed tool is the `karmaterminal/GitNexus` fork:

- wrapper: `/home/figs/.local/bin/gitnexus`
- reported version: `1.6.5`
- fork checkout: `karmaterminal/GitNexus@3c1e686edfc1acaac882927cada121ddd7c47bcc`
- wrapper SHA-256:
  `8309aeb6858023f5cb3ff4ae8416b64c1989e4fe04d82dd822964127ed1355ca`

`gitnexus status` reports this review worktree is not indexed, and the registry
contains no exact index for either the component SHA or pinned floor SHA.
Therefore no stale graph result is credited. No stock npm/npx GitNexus was
substituted. The blast-radius conclusions above use direct byte history,
function bodies, lifecycle call sites, merge-tree stages, and adjacent tests.

## Current review debt

The live PR remains open at the exact component SHA. Its 257 recorded checks
are terminal with no failed or pending check in the current rollup, but that is
not the acceptance blocker. The latest durable ClawSweeper review remains a P1
`needs real behavior proof` verdict with four unresolved items:

1. **P1:** after-fix transport-boundary proof that abandonment reaches the
   age/attempt ceiling, dead-letters, and unblocks the follower.
2. **P2:** actual channel-flow proof that mixed plugin-SDK fan-in cancellation
   and genuine abandonment remain distinguishable.
3. Resolve the compatibility and message-delivery merge risks represented by
   those two behavior changes.
4. Contributor-supplied real behavior proof remains the stated next step; the
   latest optional rank-up move asks for real setup output, logs, or recording.

The live labels still include `P1`, `merge-risk: compatibility`,
`merge-risk: message-delivery`, and `status: needs proof`. The durable review
text rates proof 1/6 and patch quality 5/6; the live rating label is currently
the older silver-shellfish label, so the review text is the authoritative debt
description rather than that stale-looking label.

## Smallest honest next action

Perform a **bounded back-merge** onto the pinned floor (or its chosen successor):

1. Keep upstream `createIngressSettleOwner` in
   `src/channels/message/ingress-drain-state.ts` and
   `createIngressWriter` in `src/channels/message/ingress-claim-writes.ts`;
   do not recreate either owner in the drain/lifecycle module.
2. Compose `onDeferredHeartbeat` with the component's `onCancelled` forwarding
   in the lifecycle binding and fan-in aggregate.
3. Preserve the component invariant that genuine abandonment enters
   `applyFailureDisposition`, while explicit and legacy-fallback cancellation
   remains budget-free.
4. Re-run the component abandonment/cancellation owner-boundary tests together
   with upstream watchdog, lane-ordering, shutdown/restart, and Plugin SDK
   tests.
5. Obtain the still-missing transport-boundary proof before presenting the
   resulting component as merge-ready.

The component must not be removed from future composites until that successor
passes the component's negative/positive corpus and real-behavior proof
demonstrates semantic equivalence.
