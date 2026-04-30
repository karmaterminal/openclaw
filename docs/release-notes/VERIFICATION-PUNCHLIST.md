# Canonical2 verification punchlist

Status: pre-squash checklist for maintainer review.

Canonical implementation tip: `cf7830ffb3702bf7d826d70838893e2e41709f12`.

This file is a checklist only; this release-notes lane did not run tests, installs, CI, or GitHub mutations.

## Open PR decisions

- [ ] Resolve open PR #368 before squash, or explicitly defer it while retaining strict-schema tolerance for legacy `continuation.taskFlowDelegates`; #368 has no merge SHA at this draft point.
- [ ] Resolve open PR #361 before squash, or explicitly defer the RFC-only OTEL follow-up while preserving current OTEL adapter evidence from PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`.
- [ ] Resolve open PR #363 before squash, or explicitly defer multi-recipient descriptor stage-1 until `targetSessionKey` / `targetSessionKeys` fail-open review is settled.

## Squash-scope verification

- [ ] Confirm whether `origin/feature/context-pressure-squashed` moving to `63d5c8c65ea3` is the intended publication of the workorder §9 narrow fold.
- [ ] Confirm the old-base-to-current-feature delta remains the reported narrow shape: 33 files changed, 5267 insertions, 2 deletions.
- [ ] Confirm the addendum path-filter delta remains 30 files changed, 5147 insertions, 2 deletions for `src/auto-reply`, `src/agents`, `src/config/sessions`, `src/config/zod-schema`, and `studies/swim-37`.
- [ ] Compare the narrow fold against the broad full-canonical2 delta captured earlier: 1013 files changed, 65462 insertions, 8970 deletions.
- [ ] Compare the narrow fold against the upstream PR #38780 reference size from the addendum: 144 files changed, 15357 insertions, 408 deletions.
- [ ] Confirm current-feature-to-canonical2 remaining path-filter scope is understood before figs chooses Variant A or Variant B: 255 files changed, 18720 insertions, 2273 deletions.
- [ ] If Variant B is chosen, explicitly scope out #368, #361, #363, broader RFC churn, docs updates, and non-audit-lane canonical2 telemetry work.
- [ ] If Variant A is chosen, validate the broad full-canonical2 candidate rather than only the narrow audit-lane fold.

## Generated baseline integrity

- [ ] Keep `src/config/schema.base.generated.ts` and `src/config/zod-schema.continuation.test.ts` aligned with the one-cycle `taskFlowDelegates` compatibility shim from PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`.
- [ ] Do not edit generated inventories, baselines, snapshots, or expected-failure files only to silence checks.
- [ ] If PR #368 lands, confirm the legacy-key tolerance still survives strict schema validation during upgrades.

## Durability fixes to preserve

- [ ] Preserve ordinary runner durable write-back from PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`.
- [ ] Preserve followup `dispatched === 0` token-chain advancement from PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`.
- [ ] Preserve child-drain chain-state persistence from PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`.
- [ ] Preserve the #431 fix that wraps followup persistence in `updateSessionStore` from PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`.
- [ ] Preserve S1/S2/S3 swim-37 durability coverage from PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789`.

## Lineage hygiene

- [ ] Keep `package.json` at `2026.4.24`; do not introduce `frond.1`, `.27`, or another fork-line version string.
- [ ] Treat `feature/context-pressure-squashed` as the final squash presentation branch, not this release-notes branch.
- [ ] Do not merge or land this release-notes branch.
- [ ] Ensure final candidate lineage descends from the intended canonical implementation tip and not from release-note journal commits.
- [ ] Keep `main` pristine until the approved final upstream PR flow says otherwise.

## Test discipline for final candidate

- [ ] Run the changed-lane checks on the final squash SHA, not just on child PR SHAs.
- [ ] Include the continuation durability Vitest project from `test/vitest/vitest.continuation-durability.config.ts`.
- [ ] Include targeted continuation tests for delegate store, post-compaction substrate, context pressure, request compaction, tool registration, agent runner/followup runner, and subagent announce continuation paths.
- [ ] Do not count this release-notes lane as validation evidence; it intentionally skipped tests and CI.

## Candidate squash topology

- [ ] Commit 1: TaskFlow continuation substrate and config compatibility from PR #423 `c8f85f525466dbadc70791759c4c7db32318978a`.
- [ ] Commit 2: continuation tracing, context-pressure, request-compaction, and OTEL adapter surfaces from PR #366 `2d10c1c2189563439de59cbf03158057cd913fb0` through PR #422 `42f1bb9c14bcc5b462206809302b289cbe696f5b`.
- [ ] Commit 3: durability fixes from PR #427 `d0f31f65cc1250e5300d1c45ac4feeda71100b18`, PR #428 `e73fd0f088813ca125bab60a2cc54c08ac97ff07`, PR #429 `dc572c01062a8da9a337039c87c1eb09288af640`, and PR #432 `cf7830ffb3702bf7d826d70838893e2e41709f12`.
- [ ] Commit 4: swim-37 durability harness and release-highlight docs from PR #430 `15e045fe460f0fa00f14fdf29f95627d7200b789` and PR #421 `29e556eb11de7ee7de9e4dadda8bdb2baf3a5dab`.

## Phantom CI hygiene

- [ ] Poll or cite CI only for the exact final squash SHA.
- [ ] Ignore superseded, canceled, or unrelated `main` runs unless an operator explicitly scopes them in.
- [ ] Do not treat auto-response, labeler, stale, docs-agent, or unrelated workflow noise as release readiness.
- [ ] If any required check fails on the final SHA, fix the candidate and rerun on the new exact SHA.
