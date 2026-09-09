# Final cross-pair review: `333809fb` x `3ecbff1a`

Bound item: openclaw/openclaw#129388

## Named refs

| Category | Named ref | Full SHA | Equality |
|---|---|---|---|
| Product/base ref | `karmaterminal/openclaw@333809fb26eeb665f7ab868dfe13b14627d1af90` | `333809fb26eeb665f7ab868dfe13b14627d1af90` | Local product object equals the safe lane ref. |
| Safe branch ref | `origin/codeagent/review-final-pair-333809-3ecbff` | `333809fb26eeb665f7ab868dfe13b14627d1af90` | Local, tracking, and server refs equal. |
| CI/workflow ref | `karmaterminal/openclaw-bootstrap@3ecbff1a2e45b84de09753bbc747d4df8f65d791` | `3ecbff1a2e45b84de09753bbc747d4df8f65d791` | GitHub commit object resolved exactly. No Actions run is authorized. |
| Presentation ref | N/A | N/A | Presentation is outside this workorder. |
| Docs/proof ref | `origin/codeagent/review-final-pair-333809-3ecbff` | `333809fb26eeb665f7ab868dfe13b14627d1af90` | Initial proof anchor equals the published product SHA; final proof SHA is recorded after `output.md` is committed. |

The unchanged safe lane was published before evidence was credited.

## Verdict

**PASS. No blocking findings.**

Product `333809fb26eeb665f7ab868dfe13b14627d1af90` and workflow
`3ecbff1a2e45b84de09753bbc747d4df8f65d791` form the intended final pair.
The workflow delta repairs only the stale accepted-plan declaration and adds
exact-product regression evidence; the product delta repairs only the cron test
harness's stale public shape.

By: Gwydion Nanashi Ferrinas Solidor (@karmafeast, acct 2011-06-30) |
OpenClaw last 12mo: 13 PRs, 5 issues, 1 default-branch commit |
GitHub contribution graph last 12mo: 24,321 commits, 9,977 PRs, 502 issues,
53 reviews. Counts are token-visible/index-backed signals, not exhaustive
activity history.

Product production LOC: +0/-0 | Product tests/test support: +6/-8.
Workflow production tooling LOC: +7/-1 | Workflow tests/fixtures: +9,707/-3 |
Workflow prior proof document: +52/-67.

## Composition-boundary proof

- **Invariant / owner:** Product planner metadata is owned by
  `scripts/lib/ci-node-test-plan.mts` and normalized by
  `tools/openclaw-local-ci-build-matrix.mjs`. Workflow admission is owned by
  `assertAcceptedPlannerContract` in
  `scripts/lib/shard-execution/classify-shard-execution.mjs:1203`. For planner
  digest
  `sha256:957eea6354cfbd37ec65e09806021d52b716294519e81da13ce87c26f2d36c62`,
  that boundary requires exactly 178 matched identities and the five canonical
  runtime pretest builds before emitting any matrix.
- **Product negative control:** Parent
  `32e89116f2177b6cccd80cc427af85e678921176` emits the expected four cron
  contract type errors: the test harness exposes nonexistent top-level
  `complete`, and three tests read that nonexistent property. The successor
  instead returns an object satisfying `GatewayCronReconciliation` while
  exposing `completeMock` only on the test helper
  (`src/gateway/server-runtime-services.test-harness.ts:167`).
- **Product positive control:** A forced compile of
  `test/tsconfig/tsconfig.core.test.gateway-root.json` passes at `333809fb`.
  The focused gateway-server run passes all 42 tests, including scheduler-start
  rejection, watcher rejection, ordered completion, and admitted-root lifetime
  (`src/gateway/server-runtime-services.test.ts:209`,
  `src/gateway/server-runtime-services.test.ts:240`,
  `src/gateway/server-runtime-services.test.ts:264`,
  `src/gateway/server-runtime-services.test.ts:287`).
- **Workflow negative control:** Prior workflow
  `76293741f20054b352417507012b58e49ad4022f` rejects the byte-identical
  333809fb plan with exit 78 before output creation because it expects only
  `agentic-gateway-core-runtime`.
- **Workflow positive control:** The successor accepts that same plan under the
  exact current workflow SHA and emits 178/178 matched identities, zero
  unknown/blocked/unrouted identities, lane coverage 144 hosted / 32
  self-hosted / 2 self-hosted-dist, and 75 jobs.
- **Rollback / restart / persistence:** The immutable accepted-contract table is
  loaded on every preflight. Reverting the workflow successor deterministically
  restores the stale-contract rejection. No runtime or persistent product state
  is touched.
- **Partial failure:** Under the current exact workflow SHA, stale one-build
  metadata and a one-row digest mismatch both exit 78 and create no routing
  output directory.

## Exact planner and routing receipt

Regenerating the matrix directly from the product checkout with the workflow's
canonical matrix builder produced bytes identical to
`test/fixtures/shard-execution/product-333809fb-planner-matrix.json`:

- Fixture SHA-256:
  `957bdfcb785a93018eac0faa65c224636e9d97a0c71eddee5af22354ec33db37`
- Planner identity digest:
  `sha256:957eea6354cfbd37ec65e09806021d52b716294519e81da13ce87c26f2d36c62`
- Identity coverage: emitted 178, matched 178, unknown 0, blocked 0
- Lane coverage: hosted 144, self-hosted 32, self-hosted-dist 2, unrouted 0
- Job/receipt coverage: hosted 48, self-hosted 25, self-hosted-dist 2; total 75

| Pretest identity | Canonical mode | Route | Batch shape |
|---|---|---|---|
| `agentic-cli-process` | `runtime` | self-hosted | exclusive singleton, concurrency 1 |
| `agentic-commands-doctor-config-state` | `runtime` | self-hosted | exclusive singleton, concurrency 1 |
| `agentic-control-plane-runtime-config` | `runtime` | self-hosted | exclusive singleton, concurrency 1 |
| `agentic-gateway-core-runtime` | `runtime` | self-hosted | exclusive singleton, concurrency 1 |
| `core-tooling-8` | `runtime` | self-hosted | exclusive singleton, concurrency 1 |

Sibling invariants remain intact:

- pinned Go 1.27.0 setup and capability verification precede docs-i18n work;
- runtime and `private-qa` builds remain isolated and receive the correct build
  environment;
- both Fastlane contract paths remain unique hosted batches with pinned
  `ruby/setup-ruby`;
- static gates remain on their validated self-hosted seat, with early/gated
  variants mutually exclusive;
- failed batch RC survives receipt upload and is re-emitted after cleanup;
- all 75 planned batches require terminal receipts;
- `core-runtime-tui-pty` and `core-support-boundary` remain distinct
  self-hosted-dist jobs.

## Focused validation

Acceptance path: **focused-only**. No Actions, Mode-B dispatch, broad suite,
source mutation, PR, presentation, or deployment was performed.

| Command | Result |
|---|---|
| Exact product matrix regeneration with `tools/openclaw-local-ci-build-matrix.mjs`, followed by `cmp` against the workflow fixture | Pass; byte-identical, fixture SHA-256 and planner digest above |
| `node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 src/gateway/server-runtime-services.test.ts` | 42/42 pass |
| `node scripts/run-tsgo.mjs -b test/tsconfig/tsconfig.core.test.gateway-root.json --builders 1 --force` | Pass |
| Prior-workflow exact-plan replay at `76293741...` | Expected exit 78; stale one-build contract named; no matrices written |
| Successor exact-plan replay at `3ecbff1a...` | Pass; exact product/workflow SHAs, 178/178 identities, 75 jobs |
| Successor stale-metadata and mismatched-digest replays | Expected exit 78 for each; no matrices written |
| `node --test test/scripts/classify-shard-execution.test.mjs test/scripts/shard-execution-routing.test.mjs test/scripts/shard-routing-receipts.test.mjs test/scripts/shard-routing-workflow.test.mjs test/scripts/pretest-build-mode.test.mjs` | 201/201 pass |
| `bash tests/test-openclaw-local-ci-mode-b-routing.sh` | Pass |
| Autoreview of workflow commit `3ecbff1a...` through P2 | Scoped clean; 0 actionable findings across two partitions |

The canonical changed-path typecheck selector could not reach compilation:
both product parent and successor fail the same pre-existing graph-ownership
gate (`agents-root` has 776 roots over the 720 limit, plus duplicate
`src/agents/command` ownership). This is outside the reviewed pair and is not
laundered as green; the exact owning gateway graph was therefore compiled
directly and forced clean.

## Review judgment

**Best-fix verdict:** best. Updating the digest-bound accepted contract at its
composition owner is narrower and safer than teaching the emitter to tolerate
stale declarations or special-casing the five names downstream.

**Alternatives considered:** Reverting the product planner to one build would
drop real runtime prerequisites; accepting arbitrary build sets would break the
reviewed digest contract; downstream route overrides would bypass the
fail-closed owner. All are rejected.

**Code read:** `src/gateway/server-cron-reconciled.ts`,
`src/gateway/server-runtime-services.ts`,
`src/gateway/server-runtime-services.test-harness.ts`,
`src/gateway/server-runtime-services.test.ts`,
`scripts/lib/ci-node-test-plan.mts`,
`scripts/lib/vitest-build-prerequisites.mts`,
`tools/openclaw-local-ci-build-matrix.mjs`,
`scripts/lib/shard-execution/classify-shard-execution.mjs`, the exact planner
fixture, routing/workflow/receipt tests, batch action, and Mode-B workflow
contract.

**Remaining uncertainty:** None within the requested focused local scope.
Hosted execution behavior was intentionally not re-run because the workorder
forbids Actions.
