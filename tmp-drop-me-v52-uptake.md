# v52-uptake journal — copilot lane

| Field              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Worktree           | `/home/figs/flesh_beast_best_beast/openclaw-wt-v52-uptake-20260503`        |
| Branch             | `frond-scribe/20260503/v52-uptake-of-v3-cohort-fixes`                      |
| Source             | `frond-scribe/20260429/v3-cohort-fixes` @ `55df7162c0` (v29-base anchored) |
| Target basis       | `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4` (v2026.5.2)                     |
| Workorder          | `/home/figs/flesh_beast_best_beast/WORKORDER-v52-uptake-20260503.md`       |
| Tracking           | karmaterminal/openclaw#546                                                 |
| Model              | github-copilot/gpt-5.5 with `--reasoning-effort xhigh`                     |
| Outer budget       | 444m                                                                       |
| Webhook resolve    | `gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/frond-scribe`      |
| Heartbeat username | `frond-scribe-v52-uptake-hook`                                             |
| Discord posture    | webhook heartbeats ONLY (no free-form chat) — cohort not to be disturbed   |
| Replay set         | 119 cohort commits since v29 base                                          |
| Upstream window    | 1543 commits between v29 (`a448042c2e`) and v5.2 (`8b2a6e57fe`)            |
| Started            | (filled by agent at first §1 entry)                                        |

## §0 — guardrails acknowledged

- Operate only inside this worktree
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- Push to `frond-scribe/20260503/v52-uptake-of-v3-cohort-fixes` only
- NO Discord chat posts — webhook heartbeats only (structured `🤖 v52-uptake §X complete; ...; commit <SHA>` shape)
- NO force-push after first push (savegame discipline per #326)
- NO modification to `COHORT_TARGET_TAG` repo variable
- NO touching `frond-scribe/20260429/v3-cohort-fixes`, `cael/325-canonical2`, `feature/context-pressure-squashed`, `archived/*`, or prince-namespaced branches
- Heartbeat at every §-section close and on any DESIGN-BREAK

(Agent fills §1 onward in-flight.)

## §1 — required reads closeout

Started: 2026-05-02T19:12:40-07:00
Closed: 2026-05-02T19:15:36-07:00
Elapsed: ~3m

### Process documents read

| Surface                                 | Notes                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `karmaterminal/openclaw#541`            | v29-uptake parent issue: wrong-basis drift from v24/canonical2 to v29, ancestor-check discipline, acceptance shape for PORT / ALREADY-ON-V3 / DROP classification and gates.                                |
| `karmaterminal/openclaw#542`            | v29-uptake PR: summary says 8 PORT / 110 ALREADY-ON-V3 / 11 DROP, no conflicts, local gates green, then Step 10 stripped the first-turn compaction-count fix into separate PR #545 after Codex P2 findings. |
| `docs/design/541-v29-uptake-journal.md` | Not present on this branch tip. Retrieved from PR #542 head. Table format and Step 10 strip-and-relane reasoning mirrored for this lane.                                                                    |
| `karmaterminal/openclaw#436`            | NTK branch index: v29 canonical line is `frond-scribe/20260429/v3-cohort-fixes` at `55df7162c0`; #542 and #545 are still active context; v52 output is a successor candidate only.                          |
| `karmaterminal/openclaw#326`            | Savegame discipline: date-discoverable savegame refs, no force-push/delete after savegame, push substrate before squash.                                                                                    |
| `karmaterminal/openclaw#546`            | Current tracking issue: branch/worktree/mission/heartbeat guardrails confirmed; final candidate must have v2026.5.2 as ancestor.                                                                            |

### Substrate code surface read

| Surface                                                                  | Notes                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/continuation-delegate-store-taskflow.ts` + `.test.ts`    | Missing at v29 source tip. Current canonical TaskFlow implementation is under `src/auto-reply/continuation/delegate-store.ts` + `.test.ts`.                                                                                                                                                              |
| `src/auto-reply/continuation-delegate-store.ts` + `.test.ts`             | Compatibility shim over the canonical TaskFlow store. Post-compaction wrappers adapt `SessionPostCompactionDelegate` to `StagedPostCompactionDelegate`; tests pin pending, delayed reservation, and staged delegate compatibility behavior.                                                              |
| `src/auto-reply/continuation-delegate.types.ts`                          | Compatibility re-export. Runtime `PendingContinuationDelegate` is mode-only; legacy boolean flags are storage compatibility only.                                                                                                                                                                        |
| `src/auto-reply/reply/continuation-runtime.ts` + `.test.ts`              | Missing at v29 source tip. Current lazy boundary is `src/auto-reply/continuation/lazy.runtime.ts`, dynamic-import only, exporting runtime config/context-pressure/delegate dispatch/store/state helpers.                                                                                                 |
| `src/auto-reply/reply/continuation-state.ts` + `.runtime.ts`             | Missing at v29 source tip. Current state lives at `src/auto-reply/continuation/state.ts`; pending state is derived from TaskFlow counts, with only timer handles/refs in process memory.                                                                                                                 |
| `src/auto-reply/reply/context-pressure.{ts,test.ts,integration.test.ts}` | `reply/context-pressure.ts` is missing; implementation is `continuation/context-pressure.ts`. Reply tests cover band thresholds, dedup, stale token guards, custom thresholds, warning log level, and event queue ordering.                                                                              |
| `src/auto-reply/reply/post-compaction-context.test.ts`                   | Pins AGENTS.md section extraction, custom post-compaction sections, legacy fallback sections, symlink/hardlink escape rejection, date substitution, and current-time injection.                                                                                                                          |
| `src/agents/tools/request-compaction-tool.{ts,test.ts}`                  | Tool is async fire-and-forget; guards active session/sessionId, context floor, rate limit, in-flight dedup, failure surfacing, and volitional diagnostic counters. Tests pin failure/retry behavior and pending-set cleanup.                                                                             |
| `src/agents/tools/continuation-tools-registration.test.ts`               | Full `createOpenClawTools` registration test: `continue_delegate` present when enabled/drainer-capable, `targetSessionKey` omitted, binary-canticle#11 description retained, disabled/leaf gates pinned.                                                                                                 |
| `src/auto-reply/reply/session-updates.ts` + `.compaction.test.ts`        | `session-updates.ts` still uses `updateSessionStoreEntry` at source tip; `.compaction.test.ts` is absent here but exists in open PR #545. #545 applies canonical-primitives fix with `mergeSessionEntry`, `updateSessionStore`, and `{ activeSessionKey: normalizeStoreSessionKey(sessionKey.trim()) }`. |
| `docs/design/continue-work-signal-v2.md`                                 | RFC read. Load-bearing contracts: tools-first continuation, TaskFlow-backed delegates, session-delivery-queue substrate, context-pressure bands, async request_compaction, canonical agent/tool/substrate ownership boundary, and shipped OTel continuation span vocabulary.                             |
| `src/config/sessions/types.ts` / `store.ts`                              | Cross-check for #545: `mergeSessionEntry` supplies monotonic `updatedAt`, sessionStartedAt rollover, and stale modelProvider scrub; `recordSessionMetaFromInbound` is the canonical `updateSessionStore(..., { activeSessionKey })` pattern.                                                             |

### Top surprises

1. Several workorder paths are historical names; the v29 source tip has already relocated the real continuation runtime/state/context-pressure surface under `src/auto-reply/continuation/**`.
2. The #542 Step 10 strip-and-relane decision is load-bearing for this rotation: the branch source does not include the compaction-count fix, while #545 has the intended canonical-primitives patch and tests but is still open.
3. The RFC text is slightly ahead of some code comments and file names: it names the durable substrate and TaskFlow direction correctly, but still references some older session-entry/post-compaction symbols that have since moved or been shimmed.

### Initial difficulty read

Medium-high. The replay should be mechanically straightforward if patch-equivalence filters out upstream-absorbed commits, but the risk is not conflict count; it is preserving the canonical-primitives fix from #545 without regressing the TaskFlow-backed continuation invariants while replaying across the much larger v29 -> v5.2 upstream window.

## §2 — rebase plan and commit classification

Commands run:

```bash
git fetch -q https://github.com/openclaw/openclaw 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4
git fetch -q https://github.com/openclaw/openclaw v2026.5.2
git log --oneline a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd..origin/frond-scribe/20260429/v3-cohort-fixes
git cherry -v 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4 origin/frond-scribe/20260429/v3-cohort-fixes a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd
```

Counts:

| Scope                                                                              | Count |
| ---------------------------------------------------------------------------------- | ----: |
| Source replay commits (`a448042c2e..origin/frond-scribe/20260429/v3-cohort-fixes`) |   119 |
| Local v52 journal commits (`origin/frond-scribe/20260429/v3-cohort-fixes..HEAD`)   |     2 |
| Exact current HEAD commits over v29 base                                           |   121 |
| `git cherry` source replay `+`                                                     |   119 |
| `git cherry` source replay `-`                                                     |     0 |

Disposition summary for the 119 source replay commits:

| Disposition       | Count |
| ----------------- | ----: |
| PORT              |   119 |
| DROP-release-prep |     0 |
| ALREADY-ON-V52    |     0 |
| FOLD              |     0 |

No source commit is patch-equivalent to v2026.5.2. I found no v29-release version-bump or release-prep-only commits in this replay set. The mixed generated-baseline commit (`690ce67771ea`) also carries continuation support/build/i18n surface, so it is PORT, with basis-specific generated hashes regenerated in §4.

### Source replay classification table

| commit         | shape                    | disposition | reason                                                                                     |
| -------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| `badf16cc5edf` | feat                     | **PORT**    | Core continuation implementation; absent from v52 upstream.                                |
| `d8a91590b425` | RFC                      | **PORT**    | Continue-work RFC is cohort design substrate; absent from v52 upstream.                    |
| `1c1d30e06ca`  | test                     | **PORT**    | Continuation/context-pressure/post-compaction/TaskFlow coverage; absent from v52 upstream. |
| `690ce67771e`  | chore/generated-baseline | **PORT**    | Mixed support commit, not baseline-only; regenerate basis-specific hashes in §4.           |
| `73e57d1fac`   | fix                      | **PORT**    | Removes generation guard per RFC; required source behavior.                                |
| `539e3f5c894`  | RFC                      | **PORT**    | Trigger F taxonomy update; absent from v52 upstream.                                       |
| `eda1a74fcf`   | fix                      | **PORT**    | Pre-merge continuation review fixes; required source behavior.                             |
| `a8ac298a66`   | fix                      | **PORT**    | Provider/model threading for volitional compaction; required source behavior.              |
| `b46a76674c`   | RFC                      | **PORT**    | Band-dedup sentinel documentation; absent from v52 upstream.                               |
| `4a49b52792`   | RFC                      | **PORT**    | Swim evidence link fix; absent from v52 upstream.                                          |
| `09f6804d2c`   | fix                      | **PORT**    | Continue-delegate drain gating/detail keys; required source behavior.                      |
| `7c696145e4`   | fix                      | **PORT**    | Default-allow continue_delegate drainer predicate; required source behavior.               |
| `9f899e0ac7`   | test                     | **PORT**    | Drainer truth-table regression coverage; absent from v52 upstream.                         |
| `fe9ff58866`   | fix                      | **PORT**    | Continuation trigger type tightening; required source behavior.                            |
| `fbd0049dd0`   | fix                      | **PORT**    | Rebase status import cleanup needed by source branch; absent from v52 upstream.            |
| `dd9cd659d1`   | feat                     | **PORT**    | Continue_delegate descriptor seam; absent from v52 upstream.                               |
| `075d66acf8`   | feat                     | **PORT**    | Session-delivery-queue payload metadata extension; absent from v52 upstream.               |
| `93fbc361a4`   | fix                      | **PORT**    | Descriptor runtime-binding wording fix; required source behavior.                          |
| `121c8fe61e`   | refactor                 | **PORT**    | ToolInputError loud-failure path; required source behavior.                                |
| `4f9706b0fe`   | test                     | **PORT**    | Empty config snapshot default regression; absent from v52 upstream.                        |
| `2ce8f949b5`   | fix                      | **PORT**    | Clears canonical2 base noise in source branch; absent from v52 upstream.                   |
| `16c8444d9a`   | fix                      | **PORT**    | Idempotency taskHash whitespace canonicalization; required source behavior.                |
| `07908c35e2`   | RFC                      | **PORT**    | Persistence/lifecycle broker/trace design additions; absent from v52 upstream.             |
| `99ee31965d`   | docs                     | **PORT**    | Substrate-adoption convention for tool descriptors; absent from v52 upstream.              |
| `6b79ffc477`   | feat                     | **PORT**    | Session-delivery failed TTL prune and queue soft cap; absent from v52 upstream.            |
| `aa783b193e`   | docs                     | **PORT**    | RFC format pass; absent from v52 upstream.                                                 |
| `e272ee7be0`   | feat                     | **PORT**    | Substrate-adoption lint/capability registry; absent from v52 upstream.                     |
| `3a93089110`   | fix                      | **PORT**    | macOS exec allowlist wildcard fix; required source behavior.                               |
| `bc4dffc693`   | ci                       | **PORT**    | Workflow sanity generated-baseline guard; absent from v52 upstream.                        |
| `e3986c0eb2`   | RFC                      | **PORT**    | RFC cleanup/current capability incorporation; absent from v52 upstream.                    |
| `4eb7ca22c1`   | feat                     | **PORT**    | Substrate-native chain-budget extraction; absent from v52 upstream.                        |
| `d054329740`   | feat                     | **PORT**    | Session-key-gated side-effect helper; absent from v52 upstream.                            |
| `9268578e7f`   | docs                     | **PORT**    | Post-compaction release seam audit; absent from v52 upstream.                              |
| `34e8ac8ceb`   | test-harness             | **PORT**    | Swim-37 harness scaffold; absent from v52 upstream.                                        |
| `4d7c0ea8b2`   | feat                     | **PORT**    | Traceparent payload and chain-budget cap helper; absent from v52 upstream.                 |
| `b14514088d`   | feat                     | **PORT**    | Continuation tracer facade/noop tracer; absent from v52 upstream.                          |
| `57ed8a1e3d`   | docs                     | **PORT**    | Continuation integration substrate-naming docs; absent from v52 upstream.                  |
| `8657e4f8e9`   | docs                     | **PORT**    | Marks targetSessionKey runtime pending; absent from v52 upstream.                          |
| `47ae9a8069`   | feat                     | **PORT**    | Chain.id substrate and continuation.work span; absent from v52 upstream.                   |
| `53cd2aff72`   | feat                     | **PORT**    | continuation.delegate.dispatch span; absent from v52 upstream.                             |
| `2c135ae41a`   | feat                     | **PORT**    | continuation.disabled span coverage; absent from v52 upstream.                             |
| `c5d637ab31`   | feat                     | **PORT**    | Per-turn delegate cap reject reland; absent from v52 upstream.                             |
| `72dffab4e5`   | docs                     | **PORT**    | continuation.delegate.fire design memo; absent from v52 upstream.                          |
| `5ac2129c28`   | feat                     | **PORT**    | continuation.delegate.fire span wiring; absent from v52 upstream.                          |
| `25065567cb`   | test                     | **PORT**    | Continuation tracer canonical-name regression; absent from v52 upstream.                   |
| `2fa19703e8`   | docs                     | **PORT**    | continuation.work.fire design memo; absent from v52 upstream.                              |
| `3e72fb21b3`   | feat                     | **PORT**    | continuation.work.fire span wiring; absent from v52 upstream.                              |
| `3d0317e347`   | docs                     | **PORT**    | Swim-37 README base bump; absent from v52 upstream.                                        |
| `91b820ff89`   | feat                     | **PORT**    | continuation.queue.drain span wiring; absent from v52 upstream.                            |
| `6ca82ec04f`   | feat                     | **PORT**    | InMemorySpanRecorder shim/contract tests; absent from v52 upstream.                        |
| `7bf6456d03`   | docs                     | **PORT**    | continuation.compaction.released design memo; absent from v52 upstream.                    |
| `4567f02bcc`   | feat                     | **PORT**    | continuation.compaction.released span wiring; absent from v52 upstream.                    |
| `167845d6bf`   | docs                     | **PORT**    | signal.kind SSOT and compaction.id memo; absent from v52 upstream.                         |
| `b3667cc194`   | docs                     | **PORT**    | Slice 6c memo follow-up; absent from v52 upstream.                                         |
| `a5e7f0bd98`   | feat                     | **PORT**    | signal.kind SSOT and compaction.id release-side wire; absent from v52 upstream.            |
| `31f587f368`   | fix/test                 | **PORT**    | Producer-coupling test pin and cast cleanup; required source behavior.                     |
| `68e214fef4`   | docs                     | **PORT**    | RFC human-user terminology scrub; absent from v52 upstream.                                |
| `bca4eb326f`   | test                     | **PORT**    | Swim-37 emit-helper contract pin; absent from v52 upstream.                                |
| `53bb95ba7e`   | feat                     | **PORT**    | Swim-37 changelog-byte-grep discovery channel; absent from v52 upstream.                   |
| `62a426ad46`   | test                     | **PORT**    | Helper-tier fire/release/drain contract pin; absent from v52 upstream.                     |
| `cedde12b66`   | test                     | **PORT**    | captureSwim continue_work harness wiring; absent from v52 upstream.                        |
| `1dc8b35eac`   | feat                     | **PORT**    | Conflict-content rubric harness support; absent from v52 upstream.                         |
| `ada3d5c7b8`   | docs                     | **PORT**    | Lich primitive memo; absent from v52 upstream.                                             |
| `1c85f3d3f4`   | docs                     | **PORT**    | Heartbeat continuation primitive memo; absent from v52 upstream.                           |
| `c425b1b3b`    | feat                     | **PORT**    | captureSwim lich wiring; absent from v52 upstream.                                         |
| `90c41ab11f`   | docs                     | **PORT**    | Rebase.classify span-emission memo; absent from v52 upstream.                              |
| `4a929655f3`   | test                     | **PORT**    | Chain.id absence on lich span regression; absent from v52 upstream.                        |
| `959a9eca8d`   | feat                     | **PORT**    | captureClassify wiring; absent from v52 upstream.                                          |
| `04c48cc1cd`   | feat                     | **PORT**    | captureSwim heartbeat span wiring; absent from v52 upstream.                               |
| `39e8d4688a`   | fix                      | **PORT**    | captureClassify validation/signal.kind rename; required source behavior.                   |
| `50d8079497`   | test/docs                | **PORT**    | Heartbeat harness-shape review nits; absent from v52 upstream.                             |
| `b06daed3ea`   | docs                     | **PORT**    | Release highlights reparented onto canonical line; absent from v52 upstream.               |
| `e2158d7517`   | feat                     | **PORT**    | Diagnostics OTel adapter wiring; absent from v52 upstream.                                 |
| `a617975313`   | fix                      | **PORT**    | Continuation chain persistence stabilization; required source behavior.                    |
| `e33d3797c0`   | fix                      | **PORT**    | Durable write-back for tool-delegate chain state; required source behavior.                |
| `335394349`    | fix                      | **PORT**    | Followup chain token persistence when no dispatch; required source behavior.               |
| `1d9decbd87`   | fix                      | **PORT**    | Child chain state persistence after delegate drain; required source behavior.              |
| `ede80e26f8`   | test                     | **PORT**    | Swim-37 durability harness coverage; absent from v52 upstream.                             |
| `ce7598b697`   | fix                      | **PORT**    | followup-runner chain-state store locking; required source behavior.                       |
| `8e13954856`   | test                     | **PORT**    | Followup-runner disk callsite trap; absent from v52 upstream.                              |
| `99b745ffdc`   | fix                      | **PORT**    | Channel-visible terminal blocked liveness marker; required source behavior.                |
| `26ccf4d338`   | fix                      | **PORT**    | Tool memory append guard/first-class append op; required source behavior.                  |
| `1603502794`   | fix                      | **PORT**    | Subagent announce runtime output beside bundle; required source behavior.                  |
| `ae35e8bcb0`   | fix                      | **PORT**    | Request-compaction cooldown on success; required source behavior.                          |
| `83847e970`    | fix                      | **PORT**    | Sandbox memory flush append safety; required source behavior.                              |
| `a7bd3ce1cc`   | fix                      | **PORT**    | Delegate cap scoped to current turn; required source behavior.                             |
| `455ff7f499`   | fix                      | **PORT**    | Continuation pending state derives from TaskFlow; required source behavior.                |
| `8b92341957`   | fix                      | **PORT**    | Blocked agent liveness surfaced to channels; required source behavior.                     |
| `bcddedc6cb`   | chore                    | **PORT**    | Removes vestigial taskFlowDelegates config surface; required source behavior.              |
| `0f12f3f0d2`   | fix                      | **PORT**    | Reconciles blocked-liveness double emit; required source behavior.                         |
| `d8c4ec42a0`   | test                     | **PORT**    | Continuation-registration cold-load timeout guard; absent from v52 upstream.               |
| `0cebef34fc`   | fix                      | **PORT**    | Preserves post-compaction delegate arm age; required source behavior.                      |
| `2b9d4c5b36`   | fix                      | **PORT**    | Compaction attribution correlation; required source behavior.                              |
| `886d15d869`   | workorder                | **PORT**    | Source branch provenance/workorder; no release-prep or v52 equivalent.                     |
| `1732252559`   | chore                    | **PORT**    | v29 candidate artifact checkpoint carried by source branch.                                |
| `f799818de2`   | docs                     | **PORT**    | v29 candidate review artifacts carried by source branch.                                   |
| `0c069d9db`    | docs                     | **PORT**    | v29 tsgo failure journal carried by source branch.                                         |
| `622fe0e50b`   | docs                     | **PORT**    | Ratification/Q4 byte-walk evidence carried by source branch.                               |
| `999b3e2b88`   | fix                      | **PORT**    | v29 candidate type/test repair; required source behavior.                                  |
| `a7d41efc11`   | workorder                | **PORT**    | v3 gate-completion workorder carried by source branch.                                     |
| `fbb91bc876`   | chore                    | **PORT**    | v3 tsgo gate journal carried by source branch.                                             |
| `b727fad246`   | chore                    | **PORT**    | v3 check failure journal carried by source branch.                                         |
| `d03149bbcd`   | fix                      | **PORT**    | Config boundary gate repair; required source behavior.                                     |
| `224840abd6`   | chore                    | **PORT**    | v3 scoped test gate journal carried by source branch.                                      |
| `66810a7242`   | chore                    | **PORT**    | v3 build gate journal carried by source branch.                                            |
| `547bbd342d`   | docs                     | **PORT**    | v3 gates-green journal carried by source branch.                                           |
| `f8fec1c4e`    | docs                     | **PORT**    | Canonical-lineage handoff awareness note carried by source branch.                         |
| `94d7d357b`    | workorder                | **PORT**    | v3 cleanup path-B workorder carried by source branch.                                      |
| `068659298f`   | chore                    | **PORT**    | v3 cleanup journal stub carried by source branch.                                          |
| `7054aa1a73`   | chore                    | **PORT**    | Cohort-identity scrub; required source cleanup.                                            |
| `053b6df551`   | chore                    | **PORT**    | Rejected rebase artifact cleanup; required source cleanup.                                 |
| `2946145c1c`   | refactor                 | **PORT**    | Structural dedup of continuation runtime; required source behavior.                        |
| `b160d0c911`   | fix                      | **PORT**    | Import discipline/build-warning cleanup; required source behavior.                         |
| `8bedd3f326`   | fix                      | **PORT**    | Continuation failure surfacing; required source behavior.                                  |
| `0831ce3b8`    | test                     | **PORT**    | Continuation coverage wave; absent from v52 upstream.                                      |
| `90ff152548`   | fix                      | **PORT**    | Final path-B gate fix; required source behavior.                                           |
| `5779322f5c`   | workorder                | **PORT**    | v3 cohort-fixes direct-apply workorder carried by source branch.                           |
| `7eae057a74`   | fix                      | **PORT**    | Direct v3 cohort fixes; required source behavior.                                          |
| `55df7162c0`   | fix                      | **PORT**    | Discord native command failure metadata; required source behavior.                         |

### Local v52 journal commits

These two commits are not part of the 119 source replay set, but current HEAD includes them. The rebase will preserve them after the source replay unless conflict mechanics require re-applying the journal.

| commit       | shape   | disposition | reason                                                              |
| ------------ | ------- | ----------- | ------------------------------------------------------------------- |
| `ac8b480257` | journal | **PORT**    | v52 lane journal seed/guardrails, required for savegame recovery.   |
| `9c54f0f0f7` | journal | **PORT**    | §1 read closeout journal checkpoint, already pushed/heartbeat sent. |

### Rebase todo plan

Pick all 119 source replay commits and the two v52 journal commits onto `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`. No source commits are planned for DROP/FOLD before the rebase. Release/generation conflicts still follow the §3 policy: newer upstream wins for release-prep/version/generated-basis files; continuation substrate wins for continuation files; anything outside those rules becomes DESIGN-BREAK.

## §3 — base rotation execution closeout

Closed: 2026-05-03T00:14:00-07:00

Execution note: the first plain `git rebase -i 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4` was aborted because this graph would replay pre-v29/release-prep commits: the v5.2 target does not contain the fork's v29 base as an ancestor, and the real merge-base is `9f0bf1c71ea2`. The correct mechanical replay was `git rebase -i --onto 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4 a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd HEAD`, but the candidate branch had already been pushed for §1/§2 heartbeats under #326 savegame discipline. Rewriting it would require a force-push after first push, so §3 was completed as a non-ff base-rotation merge of v2026.5.2 into the candidate branch. This preserves the pushed savegame history and makes v2026.5.2 an ancestor without force-pushing.

Conflict policy applied:

| Surface                                                                                           | Resolution                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release/version/generated basis files (`package.json`, app versions, generated schema/API hashes) | Took v5.2 side; hashes are regenerated in §4.                                                                                                                                                                              |
| Base-noise files untouched by the 119 source commits                                              | Took v5.2 side.                                                                                                                                                                                                            |
| Continuation/tooling/session substrate                                                            | Manually merged source continuation behavior with v5.2 adjacent changes.                                                                                                                                                   |
| `src/agents/pi-tools.ts`                                                                          | Preserved v5.2 `includeCoreTools`, runtime tool allowlist, heartbeat/auth/profile prep instrumentation; retained cohort `continue_work`, `request_compaction`, append/memory-day write guards, and continuation tool opts. |
| `src/agents/system-prompt.ts`                                                                     | Preserved v5.2 stable-prefix prompt cache while retaining cohort continuation/delegate guidance and continuation sections.                                                                                                 |
| `src/auto-reply/reply/session-system-events.ts`                                                   | Preserved v5.2 exec-completion event filtering while retaining `continuation.queue.drain` span emission.                                                                                                                   |
| `src/agents/command/session-store.ts`                                                             | Preserved v5.2 heartbeat runtime-model preservation and metadata patch scrubbing while retaining cohort normalized-key `resolveSessionStoreEntry` + `mergeSessionEntry` persistence.                                       |
| `src/infra/heartbeat-runner.ts`                                                                   | Converted manual load/save writes to v5.2 `updateSessionStore` while retaining normalized-key alias cleanup.                                                                                                               |
| `extensions/discord/src/internal/rest.ts`                                                         | Retained v5.2 scheduler lane defaults plus cohort abort metadata logging/sanitization from #529.                                                                                                                           |

Merge sanity:

| Check                            | Result |
| -------------------------------- | ------ |
| Unmerged paths                   | 0      |
| Conflict markers in source paths | 0      |
| `git diff --cached --check`      | PASS   |
