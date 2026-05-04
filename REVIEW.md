# Phase 3 REDUX critical review — recompose squash branch

## Verdict

**REQUEST_CHANGES.**

Do not advance this HEAD to Phase 5 yet. The requested anchor fixes for Findings 1, 2, and 3 are present, but the REDUX HEAD still has one continuation-runtime correctness blocker plus multiple upstream-leakable review/process artifacts that would be embarrassing on an upstream `openclaw/openclaw` PR.

Reviewed target:

- Head: `3cac0d327e5f7300ff99215cc2a34254cf4c565a`
- Base: upstream `v2026.5.2` tag `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`
- Diff shape at this HEAD: `318 files changed, 34602 insertions(+), 876 deletions(-)`
- Follow-up issue for this REQUEST_CHANGES verdict: https://github.com/karmaterminal/openclaw/issues/594

Note: the original workorder's older `351 changed files` count is stale for this REDUX head.

## Scope concerns

### 1. `fanoutMode: "all"` can include the just-completed child session in its own return audience

`fanoutMode: "all"` uses every key returned by `listKnownSessionKeysOnHost(cfg)` without excluding the child session that is currently completing:

- `src/agents/subagent-announce.ts:125-142` reads every key from every agent session store target and returns the sorted set.
- `src/agents/subagent-announce.ts:1228-1237` passes that raw all-host list into the targeting resolver for `fanoutMode: "all"`.
- `src/auto-reply/continuation/targeting.ts:43-45` returns normalized `allSessionKeys` unchanged when non-empty.
- `src/agents/subagent-announce.ts:1240-1256` enqueues the return deliveries before setting `shouldDeleteChildSession = params.cleanup === "delete"`.
- Existing coverage locks in the permissive behavior by expecting `fanoutMode=all` to return to every supplied key, including the dispatcher/default session, with no exclusion model: `src/auto-reply/continuation/cross-session-targeting.test.ts:170-178`.

Recommendation: exclude `params.childSessionKey` before resolving/enqueuing all-host fan-out returns, and add regression coverage that `fanoutMode: "all"` never queues a completion envelope to the child session that produced that envelope. If the intended contract is broader, document it explicitly and handle the delete-cleanup case so a completion is not persisted for a session that is immediately removed.

### 2. `studies` and local rebase/dist scratch surfaces are still wired into repo metadata

The cohort notes said `studies/swim-37` was stripped, and the directory itself is absent. However, this HEAD still adds the generic `studies` directory to duplicate-check targets at `scripts/check-duplicates.mjs:9-20`. That is not load-bearing for the continuation feature unless upstream is intentionally gaining a tracked `studies/` surface.

The diff also adds local/fork scratch ignores: `.gitnexus`, `dist.bak-3.28/`, `_BRIEF.md`, `_PURGE_BRIEF.md`, `_outcome.md`, and `_purge_outcome.md` at `.gitignore:202-211`. These are protective locally, but they are not continuation-feature code and read as rebase/dist-topology working debris in an upstream PR.

Recommendation: remove the `studies` duplicate-check target unless the upstream PR also introduces and documents an upstream-owned `studies/` directory. Move local rebase/dist scratch ignores to personal excludes (`.git/info/exclude`) or strip them from the upstream-bound squash.

## Upstream-leakable

### 1. Public RFC still exposes internal validation labels and process shape

`docs/design/continue-work-signal-v2.md` carries raw internal labels (`Swim 7`, `Swim 9`, `Swim 10`, `Swim 41`) and "canary" terminology as public RFC evidence:

- `docs/design/continue-work-signal-v2.md:1437-1450` defines historical `Swim` names as proper nouns for live multi-agent canary sessions.
- `docs/design/continue-work-signal-v2.md:1506-1524` names `Swim 9`, `Swim 10`, and `Swim 41` as the current/historical validation frame.
- `docs/design/continue-work-signal-v2.md:1742-1764` preserves detailed `Swim 9`, `Swim 10`, and `Swim 41` scorecard sections.

The RFC also says it intentionally does not link internal trackers while still exporting the internal tracker names. That is exactly the kind of cohort/process leak the workorder asked this lane to catch.

Recommendation: replace `Swim N` names with generic public labels such as "Validation Cycle A/B/C" or remove the historical scorecard appendix. Keep the behavioral evidence, but strip internal process names, role formations, and private validation-cycle state.

### 2. Internal validation labels remain in source/test comments

These added comments still carry fork-internal process labels or non-upstream phrasing:

- `src/agents/subagent-announce.ts:763-768` references `(Swim 8, 8-T6 finding)` in production code.
- `src/agents/subagent-announce.continuation-drain.test.ts:4-10` references `SWIM 33 F7 finding`.
- `src/auto-reply/continuation/delegate-dispatch.test.ts:396-402` says `figs's call landed on the honest branch`.
- `src/infra/session-cost-usage.discoverAllSessions.test.ts:8-15` references `openclaw-bootstrap#475`.

Recommendation: replace with public issue numbers where available, or describe the invariant generically. For example: "discovered in integration coverage" is enough; "Swim", "figs", "honest branch", and `openclaw-bootstrap` should not appear in upstream-bound code comments.

## Things that would not fly on an upstream PR

### 1. Duplicate docs sentence

`docs/gateway/config-channels.md:784-786` repeats the same hot-reload sentence twice. This is a straightforward copy/paste issue and should be removed before Phase 5.

### 2. Review artifacts are still visible in repo metadata

The `.gitignore` additions at `.gitignore:202-211` are not harmful at runtime, but they advertise local rebase/dist scratch workflow in the upstream diff. Combined with the remaining `Swim`/`figs` comments, this makes the strip pass incomplete.

### 3. Workflow change reviewed but not flagged

The `generated-doc-baselines` condition now runs on non-`workflow_dispatch` events at `.github/workflows/workflow-sanity.yml:84-86`. I am not flagging this as a blocker after the config/protocol lane checked it as an upstream-worthy baseline-drift guard. It is still worth mentioning in the PR body because workflow behavior changes draw reviewer attention.

## Surprises

- The requested Finding 1/2/3 anchor bytes are present, but `fanoutMode: "all"` still has an unhandled self-target/delete-cleanup edge for the completing child session.
- The REDUX strip pass removed the previously named high-risk surfaces (`src/rebase/tracer.ts`, `studies/swim-37`, `localMemoryEmbedding`, and Discord/openshell scope creep), but left smaller process leaks in comments, docs, `.gitignore`, and duplicate-check config.
- Root `TOOLS.md` is absent at this HEAD, and no `TOOLS.md`/`EVIDENCE-LAYERS.md` file is changed. The original workorder's "TOOLS.md canon banked" anchor is therefore not directly verifiable from the upstream-bound tree. If that canon is intentionally out-of-tree after strip pass, Phase 4 should not cite root `TOOLS.md` as shipped evidence.

## Anchor verifications

| Anchor                                             | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-runner.ts` Path A targeted return threading | **Green**                            | `src/auto-reply/reply/agent-runner.ts:2682-2709` accepts `targetSessionKey`, `targetSessionKeys`, `fanoutMode`, and passes them to `spawnSubagentDirect` as `continuationTargetSessionKey`, `continuationTargetSessionKeys`, and `continuationFanoutMode`.                                                                                          |
| `targeting.ts` premature ack removal               | **Green**                            | `src/auto-reply/continuation/targeting.ts:90-120` enqueues durable delivery, enqueues the in-memory system event, requests `delegate-return` heartbeat if needed, and explicitly does **not** ack the durable file in the delivery loop.                                                                                                            |
| `heartbeat-reason.ts` classifier                   | **Green**                            | `src/infra/heartbeat-reason.ts:42-46` classifies `silent-wake-enrichment` and `delegate-return` as `wake`.                                                                                                                                                                                                                                          |
| RFC targeted-completion semantics                  | **Semantics green, publication red** | `docs/design/continue-work-signal-v2.md:192-208` correctly distinguishes task routing from completion-envelope routing, but the RFC still leaks internal `Swim` validation names at `docs/design/continue-work-signal-v2.md:1437-1450`, `docs/design/continue-work-signal-v2.md:1506-1524`, and `docs/design/continue-work-signal-v2.md:1742-1764`. |
| Changelog Finding 1/2/3 entries                    | **Green**                            | `CHANGELOG.md:58-60` has entries for delegate-return wake classification, durable queue preservation, and actual runtime targeted dispatch routing.                                                                                                                                                                                                 |
| `TOOLS.md` canon bank                              | **N/A / stale anchor**               | Root `TOOLS.md` is absent at this HEAD and no `TOOLS.md`/`EVIDENCE-LAYERS.md` file is changed.                                                                                                                                                                                                                                                      |

## Recommendation for Phase 4 cohort sign-off

Phase 4 should **not sign off for Phase 5** until at least these changes are made and byte-verified:

1. Exclude the completing child session from `fanoutMode: "all"` return targets and add a regression test that would fail on the current self-target behavior.
2. Strip or genericize all remaining `Swim`, `figs`, `honest branch`, and `openclaw-bootstrap` references from upstream-bound source, tests, and docs.
3. Remove the duplicated config docs sentence.
4. Remove upstream-unjustified local scratch ignores and the `studies` duplicate-check target, or document why upstream should own those surfaces.
5. Re-run the Phase 3 leak scan on the corrected HEAD before Phase 4 signs off.

Once those are clean, the Finding 1/2/3 core anchors look structurally correct enough for a new Phase 3 approval pass.
