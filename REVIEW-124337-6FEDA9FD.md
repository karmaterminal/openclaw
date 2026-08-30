# Independent review: openclaw/openclaw#124337 absorb

## Verdict

`CONFIRMED_FOCUSED`

Reviewed item: [openclaw/openclaw#124337](https://github.com/openclaw/openclaw/pull/124337),
opened by Gwydion Nanashi Ferrinas Solidor
([@karmafeast](https://github.com/karmafeast), account created 2011-06-30).
The account has 13 OpenClaw PRs, 5 issues, and 1 default-branch commit in the
last 12 months; GitHub's contribution graph reports 20,684 commits, 9,977 PRs,
488 issues, and 53 reviews over the same interval (token-visible and not
public-only).

The product merge at `f3e2013ac885d9a69a05b64f7b0f48e45cc21765`
is safe to retain as the focused component successor. The delivered head
`6feda9fd71c7cb4701af63ab54264009ce5f6afb` has the same product tree; its
successor commits change only the lane journal.

This is not broad acceptance. All four Mode-B attempts stopped before product
shards ran. Broad acceptance requires an explicitly reviewed routing rule for
the new gateway-core planner identity, a Mode-B refire against the exact
delivered product SHA, and the outstanding real transport-boundary proof.

## Named refs and exact identity

Identity was resolved before evidence was credited. The review branch was
published unchanged before the lane-branch identity gate.

| Category         | Named ref                                                 | Full SHA                                   | Local / tracking / server identity                                      |
| ---------------- | --------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Product/base ref | pinned `openclaw/openclaw` commit                         | `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | local object and live GitHub commit resolve to the same SHA             |
| Safe lane ref    | `codeagent/124337-6feda9fd-independent-review-20260829`   | `6feda9fd71c7cb4701af63ab54264009ce5f6afb` | local branch, `origin` tracking ref, and `origin` server ref equal      |
| CI/workflow ref  | `karmaterminal/openclaw-bootstrap:main`                   | `e768ccc2e1e0887be455e6880db0bff91a1dfddd` | exact detached workflow clone and server `main` equal                   |
| Presentation ref | N/A                                                       | N/A                                        | protected presentation is out of scope                                  |
| Docs/proof ref   | `codeagent/124337-current-upstream-43a7-overlap-20260829` | `40b0fbebfec50167315298cfb9ef3f287a0671c9` | local remote-tracking ref contains the exact currency report; read-only |
| Savegame ref     | `savegame/20260830-0030Z/pr-124337-post-43a7-absorb`      | `6feda9fd71c7cb4701af63ab54264009ce5f6afb` | local remote-tracking ref and `origin` server ref equal                 |

The review started from a clean worktree at the delivered SHA and remained
clean until this report was added. Delivered tree:
`7095698b45352f760e79d17e2d9e2bffcfdd7765`.

## Product and journal map

| Commit                                     | Tree                                       | Parents                                                                                | Classification                                   |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `eee69b3d51c68c76c25c376451c161497e614a2b` | `857b7f8938581a1d23abdc908242e3bef113a128` | `d81272c117ef7a2ac765450d682309a941d58463`, `6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578` | original component                               |
| `0b9ce3e403915ca7f4541f70e8e2e7bf5ca081f4` | `1571d6c49d5160c3c4d5ff83d8ac8afcb9098e5e` | `eee69b3d51c68c76c25c376451c161497e614a2b`                                             | preflight journal only (`tmp-drop-me-claude.md`) |
| `f3e2013ac885d9a69a05b64f7b0f48e45cc21765` | `c1ca146f4e08438524de240e4394d6ac10788b4b` | `0b9ce3e403915ca7f4541f70e8e2e7bf5ca081f4`, `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | real no-ff product merge                         |
| `e1ddbbc8561b3fcf707e50bf315eaecf949a7fb5` | `81e7796d2514d97c52a9118bc269445426844204` | `f3e2013ac885d9a69a05b64f7b0f48e45cc21765`                                             | focused/GATES journal only                       |
| `6feda9fd71c7cb4701af63ab54264009ce5f6afb` | `7095698b45352f760e79d17e2d9e2bffcfdd7765` | `e1ddbbc8561b3fcf707e50bf315eaecf949a7fb5`                                             | Mode-B journal only                              |

The currency report `40b0fbebfec50167315298cfb9ef3f287a0671c9`
is intentionally a side-branch report, not an ancestor of the delivered head.
The merge base between the original component and pinned upstream is
`6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578`. All four lane commits above
reference openclaw/openclaw#124337 and carry the required Copilot trailer.

Excluding `tmp-drop-me-claude.md`, the product tree is byte-identical from the
product merge through the delivered head.

## Conflict and ownership review

`git show --remerge-diff` reconstructs exactly two content conflicts.

| Path                                              | Resolution                                                                                                                                                                                                                     | Ownership verdict                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/channels/message/ingress-drain-lifecycle.ts` | Removed the component copy of `createIngressSettleOwner`; retained upstream `onDeferredHeartbeat`; retained component `onCancelled` forwarding and cancellation context.                                                       | Correct. Settlement ownership remains in `ingress-drain-state.ts`; reply binding composes heartbeat and cancellation without a second settle owner. |
| `src/channels/message/ingress-drain.ts`           | Uses upstream `createIngressWriter` from `ingress-claim-writes.ts` and upstream `createIngressSettleOwner` from `ingress-drain-state.ts`; retains only the component distinction between genuine abandonment and cancellation. | Correct. The shared drain remains the sole retry-disposition owner.                                                                                 |

The Plugin SDK fan-in files auto-merged correctly: upstream deferred-heartbeat
fan-out and identifier-authentication coverage remain, while mixed
modern/legacy cancellation marks only the legacy fallback as cancellation.
Current `upstream/main` at review time,
`80e4dd3d3ae4bb5e18e7718f466241ea4bc6f8f5`, still has the canonical settle
owner and claim writer; its later edits are context only, not authority for
this pinned historical absorb.

Direct symbol search at the product merge finds exactly one
`createIngressSettleOwner` definition, in
`src/channels/message/ingress-drain-state.ts:41`, and exactly one
`createIngressWriter` definition, in
`src/channels/message/ingress-claim-writes.ts:19`. The old lifecycle-module and
in-drain copies were not recreated. There is no dual settlement or write
authority.

## Findings

### Medium: no Mode-B product acceptance exists

All four recorded runs failed before shard execution. The focused product
result is supportable, but no broad acceptance claim is supportable.

- `33283095698` and `33283166730`, workflow
  `2a853a94dd4ac8c2734091161a89d4f2c4ed17a7`, failed while building matrices
  because `scripts/lib/ci-node-test-plan.mjs` was absent.
- `33283236705` and `33283346942`, workflow
  `e768ccc2e1e0887be455e6880db0bff91a1dfddd`, built a 167-row planner matrix
  but failed closed during routing.
- `33283346942` targeted the exact delivered SHA. Its routing ruleset does not
  classify check `checks-node-agentic-gateway-core-runtime`, shard
  `agentic-gateway-core-runtime`; routing exited `78`. Static gates, routed
  eligibility, matrix jobs, and custom commands were skipped.

Smallest safe follow-up: review the planner row's actual capabilities, add one
explicit digest-bound routing classification in `karmaterminal/openclaw-bootstrap`,
regenerate and test the routing ruleset against the retained planner artifact,
then refire Mode-B against
`6feda9fd71c7cb4701af63ab54264009ce5f6afb`. Do not infer `hermetic` versus
`host_local`, and do not redispatch unchanged workflow bytes.

### Low: Gate 2.7 evidence omitted its decisive PR-creation ref

The journal's “two MIXED” result is reproducible, but only when Gate 2.7 uses
the true first PR commit
`401dc7a1f5c3445b4ff85de6ac0574f91da2fde9` as `PRCREATE`. The journal does
not record that input. Substituting the later component head `eee69b3d...`
produces six MIXED rows, so the omitted ref materially affects reproducibility.

With `PRCREATE=401dc7a1...`, the exact workflow script reports 12 files,
0 `FROZEN-STALE`, 8 `GENUINE`, 2 `SAFE-NEW`, and 2 `MIXED-CLOBBER`:

1. `src/channels/message/ingress-drain.ts`: intended component override. Direct
   abandonment enters `applyFailureDisposition`; explicit cancellation and
   only the scoped mixed legacy fallback remain budget-free.
2. `src/channels/message/ingress-drain.test.ts`: intended contract correction.
   The upstream expectation that abandonment stays pending beyond the ceiling
   is replaced by payload-retaining `retry-limit-exceeded` terminalization.

This is a proof-documentation defect, not a product-byte defect. Future journal
rows should record all four Gate 2.7 inputs: script SHA, upstream, candidate,
and true PR-creation commit.

### No product correctness findings

The authored behavior is at the correct shared composition boundary. A
deterministic negative control on pinned upstream fails because the expected
dead letter is absent; the same owner-boundary test passes on the successor.
The implementation preserves:

- repeated genuine abandonment consuming the configured retry budget;
- payload-retaining `retry-limit-exceeded` and follower progress;
- explicit cancellation with zero retry charge;
- mixed modern/legacy fan-in fallback cancellation with zero retry charge;
- deferred heartbeat rearming and watchdog retirement;
- delayed head/tail ordering;
- shutdown, abort, restart, and late terminal retry facts;
- transient and terminal claim-write handling;
- unrelated identifier-authentication and Plugin SDK behavior;
- Feishu, Mattermost, Microsoft Teams, and Discord shared-drain behavior.

The original defect is visible at pinned upstream
`src/channels/message/ingress-drain.ts:394-395`: `onAbandoned` releases with
`lastError: "turn-abandoned"` but bypasses retry disposition. Blame traces the
latest form to `4151625001a8` (Peter Steinberger, 2026-08-26); the component
repair begins at `401dc7a1f5c3` (Emeric, 2026-08-15).

## Focused tests and build

The linked worktree dependency symlink was not credited: its donor clone was at
a different HEAD, its manifest bytes differed, Node was 25, and the inherited
pnpm launcher was a placeholder. The earlier journaled worktree-cwd install
mistake and linked-worktree artifact-root build failure are likewise rejected.

Independent validation used a clean normal clone at exact delivered SHA,
Node `v24.20.0`, pinned pnpm `12.0.0`, a frozen-lockfile install, and repository
serial runners:

| Surface                                                                                         | Result                   |
| ----------------------------------------------------------------------------------------------- | ------------------------ |
| Shared drain, monitor, watchdog, delayed lanes, cancellation, abandonment, claim-write failures | 7 files, 85 tests passed |
| Reply lifecycle binding                                                                         | 1 test passed            |
| Plugin SDK ingress fan-in and identifier authentication                                         | 8 tests passed           |
| Discord shared fan-in/debounce sibling                                                          | 23 tests passed          |
| Feishu durable ingress sibling                                                                  | 10 tests passed          |
| Mattermost durable ingress sibling                                                              | 42 tests passed          |
| Microsoft Teams durable ingress sibling                                                         | 4 tests passed           |
| Total focused successor proof                                                                   | 173 tests passed         |

Negative control: pinned upstream
`43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`, with only
`ingress-drain.abandonment-retry-budget.test.ts` overlaid, fails at
`src/channels/message/ingress-drain.abandonment-retry-budget.test.ts:111`.
The received dead-letter list is empty instead of containing the expected
payload-retaining `retry-limit-exceeded` row. This is the expected defect.

The bounded changed-path gate passed conflict-marker, max-lines, assertion,
format, Plugin SDK exports/surface, deprecated API, plugin-boundary, patch,
Knip/dead-export, typecheck, lint, database-first, runtime-sidecar, import-cycle,
webhook, and pairing guards. A first invocation against unrelated
`origin/main...HEAD` overflowed the warning-only temp-creation reporter and is
not credited; the exact `43a7cb3c...` to `f3e2013...` bounded invocation passed.
The exact delivered SHA also completed `pnpm build` under Node 24 with no
ineffective dynamic import warning.

Product LOC against pinned upstream:

- production: `+48/-10` (net `+38`);
- tests: `+494/-21` (net `+473`);
- journal: `+47/-0`.

The positive production delta is justified by the missing bounded-abandonment
capability and the compatibility boundary that distinguishes legacy fallback
cancellation from genuine abandonment.

## Gate 2, 2.5, and 2.7

### Gate 2

Exact bootstrap workflow bytes report 27 resolved primitive-core invariants:
0 byte `FAIL`, 19 `PASS-UPSTREAM`, 5 direct `PASS`, and 3
`PASS-TOMBSTONE`. Thirteen additional inventory paths resolve in neither bound
tree, so the global continuation-feature inventory exits setup-class `2`.
Those 13 absent paths are not candidate byte failures and Gate 2 must not be
called green.

### Gate 2.5

The exact runbook enumeration over
`6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578..43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`
returns 3,477 upstream-touched tests. Only
`src/plugin-sdk/channel-ingress-runtime.test.ts` differs at the candidate; its
component additions coexist with upstream identifier-authentication coverage,
and the focused Plugin SDK shard passes.

### Gate 2.7

The true-PR-create replay described above reports 0 `FROZEN-STALE`. Both MIXED
rows are intentional, directly reviewed owner-boundary overrides. The journal
needs the missing `PRCREATE=401dc7a1...` input for honest reproduction.

## Proof rows requiring refire

| Proof row                                   | Current state                    | Required action                                                                                                          |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Broad Mode-B acceptance                     | No product shards ran            | Classify the one new planner identity, regenerate/review the routing ruleset, then refire exact delivered SHA            |
| Real transport-boundary abandonment ceiling | Not supplied                     | Exercise a real transport path through repeated abandonment, durable dead-letter, retained payload, and follower release |
| Actual mixed fan-in channel flow            | Owner and channel harnesses only | Prove cancellation and genuine abandonment remain distinguishable through the real channel composition                   |
| Final presentation-successor transposition  | Presentation out of scope        | Re-run or transpose only after the protected presentation successor is selected                                          |

## Simplification assessment

No code change is warranted in this review. The current production shape has
one drain retry owner, one settlement owner, and one claim writer. Moving the
abandonment rule into a channel or duplicating writer/settle logic would be
worse.

The scoped `AsyncLocalStorage` cancellation marker is compatibility debt, but
it protects legacy Plugin SDK lifecycles without misclassifying direct
abandonment. It can be deleted only after the shipped legacy lifecycle contract
is removed through its compatibility window and every caller supplies
`onCancelled`; doing that in this bounded absorb would be broader and riskier
than the retained implementation.

**Best-fix verdict:** best bounded owner-layer fix. Alternatives rejected:
channel-specific retry caps would duplicate shared policy; making all
`onAbandoned` budget-free preserves the poison-head defect; making every
fallback charge budget breaks explicit cancellation compatibility.

**Code read:** `src/channels/message/ingress-drain.ts`,
`src/channels/message/ingress-drain-state.ts`,
`src/channels/message/ingress-claim-writes.ts`,
`src/channels/message/ingress-drain-lifecycle.ts`,
`src/channels/message/ingress-monitor.ts`,
`src/plugin-sdk/channel-ingress-runtime.ts`, their focused owner tests, and the
Discord, Feishu, Mattermost, and Microsoft Teams sibling tests named above.

**Remaining uncertainty:** broad Mode-B, real transport-boundary behavior, and
the protected presentation successor remain intentionally unproven.
