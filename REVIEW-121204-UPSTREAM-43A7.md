# PR #121204 pinned-upstream overlap review

## Verdict

**ABSORB_REQUIRED**

The component remains materially current for Discord stale-ambient backlog
suppression, but upstream independently landed the generic retry-delayed lane
ordering repair and then refactored the same drain owner. A real merge-tree
check produces two content conflicts. The smallest honest next action is a
bounded back-merge that:

1. takes upstream's generic lane-head/candidate implementation and its newer
   drain ownership/refactor shape;
2. drops the component's now-duplicate generic ordering implementation and
   reconciles duplicate ordering tests;
3. carries forward only the pre-claim disposition seam and Discord policy after
   resolving the current P1 `requireMention: false` delivery regression and
   obtaining the requested shared ingress/plugin SDK owner decision.

The component cannot be removed from future composites: pinned upstream has no
equivalent for `resolvePendingDisposition`,
`onPendingDispositionCommitted`, `canExpireDiscordStaleAmbientBacklog`, or the
`stale-ambient-backlog` terminal disposition.

## Named-ref contract

Evidence was credited only after publishing the unchanged safe lane branch and
resolving every applicable ref to a full object ID.

| Ref category     | Named ref                                                        | Full SHA                                   | Identity result                                                                |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| Product/base ref | `openclaw/openclaw@43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`     | `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | Local object equals pinned byte; commit is present in `upstream/main` history. |
| Safe lane ref    | `origin/codeagent/121204-current-upstream-43a7-overlap-20260829` | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` | Local `HEAD`, local tracking ref, and server ref equal before evidence.        |
| CI/workflow ref  | N/A                                                              | N/A                                        | Report-only lane; no workflow or broad acceptance run requested.               |
| Presentation ref | N/A                                                              | N/A                                        | Protected presentation is out of scope.                                        |
| Docs/proof ref   | N/A                                                              | N/A                                        | Existing exact corpus is read-only and was not used as new proof.              |

Additional required component identity:

| Ref                                                | Local object                               | Local tracking                             | Server                                     | Result |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------ |
| `codeagent/121204-current-drift-6ae89b5a-20260827` | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` | Equal  |

The component/pinned-upstream merge base is
`6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578`.

## Mergeability

Command:

```text
git merge-tree --write-tree --messages \
  4435e132ffb5b7d34fa05ad2c9bc275a24f565e9 \
  43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5
```

Result: **not clean**. Git produced virtual tree
`f5e0be0cb4ddd40d6719c4d748c9e60c7767ad9a` and reported content conflicts in:

- `src/channels/message/ingress-drain.ts`
- `extensions/discord/src/monitor/message-handler.queue.test.ts`

The production conflict is semantic, not marker noise. The component calls
`resolveIngressDrainLaneState` after applying pending dispositions and builds
`candidateIds` from disposition survivors. Upstream implements the same
lane-head retry invariant inline, removes every retry-delayed row from
`candidateIds`, and blocks a lane only when its first pending row is delayed.
The merged form must preserve disposition filtering while using upstream's
canonical candidate/lane-head implementation.

The test conflict is bounded fixture drift. The component uses numeric IDs to
make frozen-time queue ordering deterministic; upstream advances fake time
between admissions for the same reason. Both assert the same poison-head,
follower, and independent-lane behavior. Keep one deterministic setup and
upstream's current payload assertions.

## Path and symbol intersections

The component changes 24 paths from the merge base. Pinned upstream changes
8,517 paths. Six paths intersect textually:

| Path                                                           | Upstream change                                                                                                                                               | Classification                                                                                                     | Back-merge treatment                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/channels/message/ingress-drain.ts`                        | #127849 implements lane-head retry blocking; #131731 moves settlement ownership; #131742 extracts claim writes; #131962 repairs shutdown/watchdog retirement. | **upstream equivalent** for the generic FIFO fix; **semantic-material** for composition with pre-claim disposition | Resolve manually. Retain disposition-before-claim ordering, but use upstream's current inline lane-head/candidate flow and extracted owners.     |
| `src/channels/message/ingress-drain-state.ts`                  | #131731 adds `createIngressSettleOwner`; upstream no longer has component helper `resolveIngressDrainLaneState`.                                              | **semantic-material**                                                                                              | Keep upstream settlement owner. Remove the duplicate component lane-state helper after folding disposition survivors into upstream's drain loop. |
| `extensions/discord/src/monitor/message-handler.queue.test.ts` | #127849 changes deterministic poison/follower ordering coverage.                                                                                              | **textual-only** conflict with shared semantic intent                                                              | Reconcile to one deterministic fixture and preserve current assertions.                                                                          |
| `extensions/discord/src/monitor/message-handler.preflight.ts`  | #123793 adds command-ingress sender identity facts and moves raw mention ownership back to preflight helpers.                                                 | **semantic-material** adjacent refactor, clean textual merge                                                       | Preserve upstream sender facts; choose one current raw-mention owner and update component imports/tests accordingly.                             |
| `docs/plugins/sdk-channel-outbound.md`                         | #128093 documents `onDurableAdmission(..., { isNew })`; later outbound work documents `not_sent`.                                                             | **semantic-material** public-contract intersection, clean textual merge                                            | Retain upstream contracts. Re-add pre-claim disposition documentation only if the SDK owner accepts that seam.                                   |
| `config/assertion-safety-baseline.txt`                         | Upstream ratchet movement unrelated to the ingress invariant.                                                                                                 | **textual-only**                                                                                                   | Take current upstream ratchet, then regenerate only if the absorbed code changes the measured count.                                             |

### Component-only material symbols

Pinned upstream contains none of these symbols or reason codes:

- `applyIngressPendingDispositions`
- `ResolveChannelIngressPendingDisposition`
- `OnChannelIngressPendingDispositionCommitted`
- `resolvePendingDisposition`
- `onPendingDispositionCommitted`
- `canExpireDiscordStaleAmbientBacklog`
- `stale-ambient-backlog`

Those are the component's remaining capability: a generic, claim-fenced
pre-claim disposition boundary plus Discord-owned stale policy and receipt.
At component lines `extensions/discord/src/monitor/ingress.ts:371-415`,
`canExpireDiscordStaleAmbientBacklog` proves guild/non-thread/channel allowance,
but deliberately returns `true` without honoring resolved
`requireMention: false`. The drain wiring at
`extensions/discord/src/monitor/ingress.ts:561-629` then terminal-fails the row
before dispatch.

### Generic ordering equivalence

The component helper at
`src/channels/message/ingress-drain-state.ts:88-128`:

- admits every retry-eligible row to `eligiblePending`;
- lets only the oldest retained row decide whether its lane is backoff-blocked;
- prevents a delayed tail from hiding an eligible head.

Upstream #127849, commit
`849e35ce36d797703fe9abd2a886fc340be472c4`, implements the same invariant in
`src/channels/message/ingress-drain.ts:586-631` at the pinned floor:

- `candidateIds` starts with the pending snapshot;
- every retry-delayed event is removed from that snapshot;
- `pendingLaneKeys` ensures only a delayed lane head blocks the lane.

This is **upstream equivalent**, not merely overlapping. The component's
generic ordering code should not survive the back-merge as a second policy.

## Semantic and test intersections

| Invariant / test surface                                   | Component                                                                                                       | Pinned upstream                                                                                                              | Classification                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Eligible head must not starve behind a retry-delayed tail  | `ingress-drain-retry-delay.test.ts`, `ingress-drain.freshness.test.ts`, component lane-state helper             | #127849 adds `ingress-drain-lanes.test.ts`, monitor coverage, Discord queue coverage, and the canonical drain implementation | **upstream equivalent**                                  |
| Delayed head must continue to hold FIFO order              | Same component suites                                                                                           | #127849 explicitly covers delayed head, delayed tail, and snapshot race                                                      | **upstream equivalent**                                  |
| Stale provably ambient Discord rows settle before dispatch | Discord ingress policy plus channel-kind, corrupt-row, direct-config, import-boundary, and broad ingress suites | No policy, callback, reason code, or equivalent test                                                                         | **none**                                                 |
| Direct-open rooms preserve documented no-mention delivery  | Component fossil test expects stale direct-open rows to be failed                                               | Pinned upstream has no stale suppression, so existing direct-open dispatch behavior remains intact                           | **semantic-material conflict with established behavior** |
| Receipt observer failure cannot abort later drain work     | Component isolates synchronous throw and rejected observer promise after terminal write                         | No equivalent callback exists upstream                                                                                       | **none**                                                 |
| Settlement/retry lifecycle after stop and refactor         | Component was based before the latest owner splits                                                              | #131731, #131742, and #131962 move settlement/claim-write ownership and repair watchdog retirement                           | **superseding structural owner**; component must adapt   |
| Discord poison-head queue fixture ordering                 | Numeric ID prefixes                                                                                             | #127849 advances fake time between admissions                                                                                | **textual-only**, same invariant                         |

Nearest alternate channel paths checked:

- #128093 / `e6bb5c1a925bca35e0dca7a07b68e594400e3eff`
  repairs Signal duplicate redelivery behind a busy lane by exposing
  `onDurableAdmission(..., { isNew })`. It intersects the public monitor
  contract but does not replace stale Discord disposition.
- #127849 includes shared monitor and Discord sibling coverage, making its
  generic lane ordering implementation the canonical cross-channel owner.
- Open issue #127476 is a separate `scanLimit`-before-blocked-lane starvation
  case. It remains open at the pinned review date and is not solved by either
  side of this merge.

## Newly landed upstream work

| Ref                                                  | State at pinned floor       | Effect on #121204                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #127849 / `849e35ce36d797703fe9abd2a886fc340be472c4` | Merged 2026-08-28; included | Independently solves the generic delayed-tail/eligible-head ordering half.                                                                                                       |
| #127950 / `2f3cd08d58c11a8fff3e95b4bbbbc6d7393658e7` | Merged; included            | Keeps queued messages alive through long turns; closes another root cause attached to the original delayed-ingress report.                                                       |
| #131731 / `c07b753819ebb140db95fdb090bec99b3fb5cc43` | Merged 2026-08-28; included | Moves settlement ownership into `ingress-drain-state.ts`.                                                                                                                        |
| #131742 / `b45cf37368ebd2dce123a36f4f48bdc5d9018095` | Merged 2026-08-28; included | Extracts claim-write retry/terminal operations from the conflicting drain file.                                                                                                  |
| #131962 / `c678573b23f9fe55bd58df84fb768ba6c4b0a8cf` | Merged 2026-08-28; included | Repairs retry/watchdog facts after shutdown; must remain intact through absorption.                                                                                              |
| #128093 / `e6bb5c1a925bca35e0dca7a07b68e594400e3eff` | Merged 2026-08-29; included | Adds `isNew` admission context and Signal busy-lane redelivery protection; adjacent, not equivalent.                                                                             |
| #97435                                               | Closed 2026-08-28           | The original LINE delayed-ingress report is now addressed in part by upstream generic liveness/ordering work, but its closure does not supply Discord stale-ambient suppression. |
| #127476                                              | Open                        | Distinct large-snapshot/derived-lane starvation remains outside this component and back-merge.                                                                                   |

No commit in the exact merge-base-to-floor range adds Discord stale-ambient
suppression or an equivalent pre-claim terminal-disposition boundary.

## Current review debt

Latest ClawSweeper review:
`https://github.com/openclaw/openclaw/pull/121204#issuecomment-5233780085`,
reviewed against exact component head
`4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`.

| Priority | Debt                                                                                                                                                                 | Currency result                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Preserve configured direct-open Discord messages. `requireMention: false` permits no-mention delivery, but the component terminal-fails those rows after 15 minutes. | Still open and source-confirmed at `extensions/discord/src/monitor/ingress.ts:371-415`; upstream does not make this moot.                        |
| P1       | Compatibility/message-delivery risk for existing always-on rooms.                                                                                                    | Still open; upstream retains the established behavior because it has no stale suppression.                                                       |
| P1       | Shared ingress/plugin SDK owner acceptance for the documented pre-claim callback contract.                                                                           | Still open; upstream's newer `onDurableAdmission` contract increases the need to reconcile the public surface rather than silently composing it. |
| P1       | Exact-head proof packet was unavailable to the reviewer.                                                                                                             | Review-process debt remains recorded; this currency lane does not alter the read-only corpus.                                                    |
| P2       | Apply the source-proven direct-open repair and rerun Discord plus generic ingress suites.                                                                            | Still open; no product edits are authorized in this lane.                                                                                        |

ClawSweeper's optional rank-up moves are likewise unfulfilled: preserve
`requireMention: false` messages and obtain explicit shared ingress/plugin SDK
owner acceptance.

## GitNexus and direct tracing

Installed tool identity:

| Field                  | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Binary wrapper         | `/home/figs/.local/bin/gitnexus`                                   |
| Runtime entry          | `/home/figs/src/gitnexus/gitnexus/dist/cli/index.js`               |
| Version                | `1.6.5`                                                            |
| Fork remote            | `https://github.com/karmaterminal/GitNexus.git`                    |
| Fork SHA               | `3c1e686edfc1acaac882927cada121ddd7c47bcc`                         |
| `package.json` SHA-256 | `1798c10aca8d0c386c5c5b54b5494ebc1a9ebbc3f74b86c7187af18112d5aacd` |
| Dist entry SHA-256     | `00f67e34c0ef3a7ea5f1665247699f47e7e2eab2dc233a504fe95d9aa11d8590` |

`gitnexus status` reports this checkout as **not indexed**, and the installed
fork's repository list has no index for either exact component SHA or exact
pinned-upstream SHA. Therefore no GitNexus process/blast-radius output receives
evidence credit. Per the workorder, no stock `npx`/npm GitNexus was substituted.

Fallback evidence used direct bytes and call sites:

- exact `git diff` path intersection from the merge base to each tip;
- exact `git log -- <path>` history for all intersecting code paths;
- exact component and pinned-upstream function bodies;
- `git grep` for component symbols/reason codes at the pinned floor;
- upstream PR bodies and live issue/PR state;
- the real virtual merge tree and its stage/conflict payload.

## Scope and validation

This is a report-only currency lane. It changes no product, tests, docs main,
presentation, proof corpus, deployment, persistence, or runtime state.
Acceptance is **focused-only**: named-ref equality, direct byte/call-site
tracing, live related-item state, and the real `git merge-tree --write-tree`
receipt above. No local monolithic suite or Mode-B run is claimed.
