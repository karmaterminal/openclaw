# Lane journal: bounded upstream `43a7cb3c` absorb

## 2026-08-29T23:55Z - Preflight and named refs

Scope is the bounded back-merge for openclaw/openclaw#124337. The protected
presentation branch, external proof corpus, fleet, and deployment remain out of
scope.

| Category         | Named ref                                          | Resolved SHA                               | Identity                                                                  |
| ---------------- | -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Product/base ref | `codeagent/124337-current-drift-6ae89b5a-20260827` | `eee69b3d51c68c76c25c376451c161497e614a2b` | local component HEAD, `origin` tracking ref, and server ref equal         |
| Safe lane ref    | `codeagent/124337-bounded-43a7-absorb-20260829`    | `eee69b3d51c68c76c25c376451c161497e614a2b` | local branch, `origin` tracking ref, and server ref equal before merge    |
| CI/workflow ref  | `savegame/20260821/mode-b-proven-2a853a94`         | `2a853a94dd4ac8c2734091161a89d4f2c4ed17a7` | planned reviewed Mode-B workflow ref; server SHA resolved before evidence |
| Presentation ref | N/A                                                | N/A                                        | explicitly out of scope                                                   |
| Docs/proof ref   | `codeagent/124337-current-drift-6ae89b5a-20260827` | `eee69b3d51c68c76c25c376451c161497e614a2b` | existing exact corpus is read-only; local tracking and server ref equal   |

Pinned upstream is
`43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`; the component/upstream merge
base is `6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578`.

Gate 1 savegame
`savegame/20260829-2350Z/pr-124337-pre-43a7-absorb` is published at
`eee69b3d51c68c76c25c376451c161497e614a2b`.

The complete currency report at
`40b0fbebfec50167315298cfb9ef3f287a0671c9` and current drift-cure runbook at
`a8ee8cd4a88e172d20894a98c26f5b2804700fec` were read before editing.
The report establishes two expected content conflicts and requires upstream's
settle owner, extracted claim writer, deferred heartbeat, delayed lane
ordering, and shutdown/restart facts to survive while the component keeps
genuine abandonment on bounded failure disposition and all cancellation paths
budget-free.

## 2026-08-30T00:05Z - Conflict ownership decisions

The real no-ff merge of pinned upstream produced exactly the two conflicts
predicted by the currency report.

| Path                                              | Resolution                                                                                                                                                                                                                                                                  | Ownership reason                                                                                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/channels/message/ingress-drain-lifecycle.ts` | Removed the component's duplicate `createIngressSettleOwner`; retained the upstream owner in `ingress-drain-state.ts`. Kept both `onDeferredHeartbeat` and optional `onCancelled` in the reply binding.                                                                     | Settlement state belongs with upstream's drain-state owner. The reply-lane lifecycle must propagate both upstream liveness and component cancellation identity.                                                                  |
| `src/channels/message/ingress-drain.ts`           | Imported upstream's extracted `createIngressWriter`, imported `createIngressSettleOwner` from drain state, and retained only cancellation-compat detection from the lifecycle module. Kept upstream's current claim/settlement, lane-ordering, heartbeat, and restart flow. | Claim writes belong to `ingress-claim-writes.ts`; settle-once belongs to `ingress-drain-state.ts`. Genuine abandonment remains a failure disposition, while explicit or legacy-fallback cancellation uses a budget-free release. |

The auto-merged Plugin SDK fan-in retains upstream deferred-heartbeat fan-out
and unrelated identifier-authentication coverage. Its mixed modern/legacy
cancel fallback runs legacy `onAbandoned` under the component's scoped
cancel-compat context, without relabeling direct abandonment.

## 2026-08-30T00:20Z - Focused and static proof

The deterministic negative control checked out pinned upstream
`43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`, overlaid only the component's
owner-boundary abandonment regression, and failed at
`ingress-drain.abandonment-retry-budget.test.ts:111`: the expected
payload-retaining `retry-limit-exceeded` row was absent. The same regression
passes on the successor.

Node `v24.20.0`, pinned pnpm `12.0.0`, and an exact-SHA normal dependency clone
were used. Focused successor results:

- shared ingress drain/monitor: 7 files, 84 tests;
- reply lifecycle binding: 1 file, 1 test;
- Plugin SDK fan-in: 1 file, 8 tests;
- Feishu: 1 file, 10 tests;
- Mattermost: 1 file, 42 tests;
- Microsoft Teams: 1 file, 4 tests;
- Discord shared fan-in/debounce sibling: 1 file, 23 tests.

This covers repeated genuine abandonment and follower release, explicit and
mixed legacy cancellation, deferred-heartbeat rearming, delayed lane heads,
stop/restart retry facts, transient/terminal claim writes, settle-once
ownership, and the named shared-drain siblings.

`check-changed` passed the changed-path format, max-lines, assertion, type,
extension type, lint, generated Plugin SDK, boundary, dead-export, database,
cycle, and static guard plan. A lane-local cache proved Knip `6.32.2`, then the
repository's pinned production file/dependency scan returned no findings.
`pnpm build` passed under Node 24 in the exact-SHA normal clone.

Gate 2.5 enumerated 3,477 upstream-touched tests. Only
`src/plugin-sdk/channel-ingress-runtime.test.ts` differs in the candidate, and
its difference is the component's cancellation-compat contract comment; the
test passed in the focused SDK shard.

Gate 2.7 examined all 12 reviewer-visible paths and returned zero
`FROZEN-STALE` rows. Its two `MIXED-CLOBBER` rows are the intended component
overrides in `ingress-drain.ts` and `ingress-drain.test.ts`: genuine
abandonment enters failure disposition and the contradictory unbounded
upstream expectation is replaced with bounded terminalization.

The current bootstrap primitive-core Gate 2 cannot be credited: its global
continuation-feature inventory contains 13 paths absent from both bound trees
and exits setup-class. A component-scoped feature walk proves nine of eleven
paths byte-identical or exact-upstream projections; the two expected conflict
files require semantic resolution and therefore correctly fail the
conflict-free projection algorithm. Their complete functions, owners, callers,
sibling fan-in, and focused tests were reviewed directly.

The installed `karmaterminal/GitNexus` fork is version `1.6.5`, fork SHA
`3c1e686edfc1acaac882927cada121ddd7c47bcc`, wrapper SHA-256
`8309aeb6858023f5cb3ff4ae8416b64c1989e4fe04d82dd822964127ed1355ca`.
No exact index exists for this worktree, so no graph result is credited. The
feature audit uses direct git objects, merge stages, full owner modules, caller
and sibling inspection, focused boundary tests, and bootstrap byte gates.

Residual proof debt is unchanged: this lane does not claim the missing real
transport-boundary proof that abandonment crosses a live channel boundary,
reaches the age/attempt ceiling, dead-letters, and releases the follower. The
existing owner-boundary corpus rows transpose; transport and actual
channel-flow rows require refire on the later presentation successor.

## 2026-08-30T00:30Z - Independent review and broad-CI disposition

Independent Codex autoreview of the candidate against pinned upstream returned
no actionable findings and judged the patch correct with confidence `0.93`.

Mode-B could not produce broad acceptance:

1. Runs `33283095698` and `33283166730` used product
   `e1ddbbc8561b3fcf707e50bf315eaecf949a7fb5` and workflow
   `2a853a94dd4ac8c2734091161a89d4f2c4ed17a7`. Both failed closed in
   preflight before shard planning and exposed zero-byte preflight logs.
2. Run `33283236705` used the same product and current workflow
   `e768ccc2e1e0887be455e6880db0bff91a1dfddd`. It built the 167-shard
   planner matrix, then failed closed before routing any shard.
3. Reproducing that workflow's exact routing command against its uploaded
   planner matrix exits `78`: shard
   `agentic-gateway-core-runtime` / check
   `checks-node-agentic-gateway-core-runtime` is absent from the digest-bound
   routing ruleset. No available reviewed bootstrap branch classifies it.

This is a bootstrap routing-currency blocker, not a green or classified product
run. The lane therefore closes as `focused-only`; it does not claim Mode-B
acceptance. Updating the separate bootstrap routing ruleset would widen beyond
the bounded OpenClaw absorb.

The resolved product behavior is ready for scribe review, with broad CI and
the previously named real transport-boundary proof still outstanding.
