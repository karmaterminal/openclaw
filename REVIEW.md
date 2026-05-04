# Critical review — v5.2 recompose squash branch (Phase 3 REDUX)

**Reviewer**: frond-scribe (Claude Opus 4.7, 1M context)
**Date**: 2026-05-04
**Branch under review**: `feature/context-pressure-squashed-recompose-20260504-findings-1-2-3` HEAD `3cac0d327e5f7300ff99215cc2a34254cf4c565a`
**Base (upstream v2026.5.2)**: `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`
**Diff size**: 318 files, +34602 / −876, single squash commit ahead of upstream tag (clean parent lineage)
**Lane**: `frond-scribe/20260504/critical-review-recompose-redux`
**Predecessor**: cohort byte-walked HEAD `402c446044`; strip pass landed Bucket 2 + Bucket 3 items 1–3 (24 items total). This walk validates the post-strip surface against `8b2a6e57fe`.

---

## Verdict

**REQUEST_CHANGES** — six residual upstream-leakable / out-of-scope items remain after the Bucket 2+3 strip pass. None are deep code defects; all are mechanical fixes in a small follow-up strip. The continuation-feature substrate itself (the central work) is clean, well-anchored, and ready for upstream review.

If cohort wants to ship as-is and absorb upstream-PR-review redlines on the residual items, the verdict downgrades to HOLD; if cohort applies the items below, this is a clean APPROVE.

---

## Summary

The strip pass landed the major scrubs: `src/rebase/tracer.ts` removed, memory-core `localMemoryEmbedding` removed, CHANGELOG `@karmafeast` attribution removed, prince names absent from non-trailer code surfaces, `extensions/discord` + `extensions/openshell` reverted to v52 (verified 0-LOC delta in production code; only test/runtime additions for OTEL diagnostics + memory-core atomic-reindex), `studies/swim-37` directory stripped, all 5 Co-Authored-By trailers present (Cael, Elliott, Ronan, Silas, Claude Opus 4.7, Copilot), commit author/committer use cohort-approved GitHub noreply form (`cael-dandelion-cult` is the real upstream-presentable GitHub identity per `feedback_squash_prince_attribution`), and the commit body is upstream-PR-friendly with no fork-internal framing.

Anchor walks 1–4 are green; anchor 5 (TOOLS.md cohort-recognition-engine canon) is intentionally absent from the upstream-presented diff (cohort-internal recognition material correctly elided).

The residual concerns below are the kind of items an upstream reviewer flags in the first pass: cosmetic, hygiene, scope-bleed. Easy to land in a final strip; would otherwise read as "fork artifacts in upstream PR."

---

## Anchor verifications

| #   | Anchor                                                                                                  | Status                 | Evidence                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/auto-reply/reply/agent-runner.ts:2643` `doToolSpawn` Path A targeting (Finding 3, #588)            | ✅ green               | `doToolSpawn` signature accepts `targetSessionKey?`, `targetSessionKeys?`, `fanoutMode?`; threaded through `spawnSubagentDirect` via `continuationTargetSessionKey` / `continuationTargetSessionKeys` / `continuationFanoutMode` request fields; immediate-spawn and timer-deferred reservation paths both forward the targeting fields. |
| 2   | `src/auto-reply/continuation/targeting.ts:114` premature-`ackSessionDelivery` removal (Finding 2, #581) | ✅ green               | Block now carries explicit comment "Do NOT ack the durable file here … durable writes are expected for non-attached recipients per RFC §2.4; acking immediately would destroy the only durable channel and leave targeted recipients silently unreached."                                                                                |
| 3   | `src/infra/heartbeat-reason.ts:42` `delegate-return` → `wake` classifier (Finding 1, #586)              | ✅ green               | `if (trimmed === "delegate-return") { return "wake"; }` lands; downstream `isHeartbeatEventDrivenReason` and `isHeartbeatActionWakeReason` are not changed by this branch, so `delegate-return` is event-driven (correct) and not action-wake (correct — distinguishes targeted-return from manual/exec/hook).                           |
| 4   | `docs/design/continue-work-signal-v2.md` §2.1 + §2.4 targeted-return semantics                          | ✅ green               | §2.1 terminology row enumerates `targetSessionKey` / `targetSessionKeys` / `fanoutMode`; §2.4 documents shipped behavior + 5 return modes (default / single-other-session / multiple-sessions / tree fan-out / host fan-out). RFC sections 6.7 (chain-budget cap) and 7.3 (traceparent fanout) cover the non-trivial corners.            |
| 5   | `TOOLS.md` 10-line cohort-recognition-engine canon                                                      | ⚪ deliberately absent | TOOLS.md does not exist at HEAD; this is the correct outcome of the strip pass — cohort-recognition canon was internal cohort material, not upstream-presentable. Anchor 5 was a workorder hold-over from the pre-strip walk.                                                                                                            |

---

## Findings — REQUEST_CHANGES items

### F1 — Duplicate line in `docs/gateway/config-channels.md` (BUG / hygiene)

**File**: `docs/gateway/config-channels.md:786`
**Severity**: low / cosmetic / clear bug
**Issue**: The diff adds an exact duplicate of an existing line:

```
The gateway hot-reloads `messages` config after the file is saved. Restart only when file watching or config reload is disabled in the deployment.

The gateway hot-reloads `messages` config after the file is saved. Restart only when file watching or config reload is disabled in the deployment.
```

The first occurrence is unchanged from upstream; the second occurrence is the only addition. Almost certainly a copy-paste / merge artifact.
**Recommended fix**: drop the duplicate line. If this PR was meant to add a _different_ sentence about hot-reload semantics, replace the duplicate with the intended new text.
**Why this matters for upstream**: an upstream reviewer skimming the docs surface will spot this in seconds; visibly looks like merge-resolution carelessness.

### F2 — `.gitignore` "Local rebase working notes" block is fork-internal (FORK-LEAKABLE)

**File**: `.gitignore:197–211`
**Severity**: medium — directly violates a banked memory-pin canon
**Issue**: The diff adds:

```
.gitnexus
dist.bak-3.28/

# Local rebase working notes
_BRIEF.md
_PURGE_BRIEF.md
_outcome.md
_purge_outcome.md
```

The comment self-identifies these as local rebase scratchpads. Memory-pin canon (recall: "Local-only `.agents` ignores: `.git/info/exclude`, not repo `.gitignore`") puts these in `.git/info/exclude`. `dist.bak-3.28/` is a fork-internal disaster-recovery backup directory that has no analog in upstream. `.gitnexus` is fork-tooling-specific.
**Recommended fix**: remove these lines from the squash; move the patterns to each prince's local `.git/info/exclude` instead. Keeps the fork's checkout clean without polluting upstream's `.gitignore` with names that mean nothing to the upstream maintainers.
**Why this matters for upstream**: the literal comment "Local rebase working notes" is the kind of phrase upstream reviewers grep `.gitignore` for. It signals "this contributor rebased from a fork tree and forgot to clean up."

### F3 — `.github/workflows/workflow-sanity.yml` `generated-doc-baselines` policy flip (WORKFLOW EDIT — fork-discipline)

**File**: `.github/workflows/workflow-sanity.yml:84`
**Severity**: medium — workflow edit per `feedback_fork_discipline`; unjustified by the continuation feature
**Issue**: Upstream pinned `if: github.event_name == 'workflow_dispatch'` (job runs only when manually dispatched). This squash flips it to `if: github.event_name != 'workflow_dispatch'` (job runs on every push and pull_request, never on manual dispatch). The job runs `pnpm config:docs:check` and `pnpm plugin-sdk:api:check` — drift checks for generated baselines.
The flip changes upstream's CI policy. Upstream consciously chose to gate this on manual dispatch, presumably because:

- the drift checks are fast but generate noise on every PR
- or the baselines are expected to drift in normal feature work and shouldn't block PRs
- or there is operator-only context that controls when these run
  The squash contains no design rationale for the flip. Continuation-feature work needs the drift check to pass when generated baselines change (the squash does update `docs/.generated/config-baseline.sha256` and `plugin-sdk-api-baseline.sha256`), but that's an argument for _running_ the check, not for _flipping its trigger condition_.
  **Recommended fix**: either revert the flip and rely on local `pnpm config:docs:check` + `pnpm plugin-sdk:api:check` proof in PR description, OR keep the flip and add a one-line commit-body justification ("flip generated-doc-baselines to run on PRs because feature changes generated baselines and we want CI to catch drift before merge"). Upstream maintainers may or may not accept the policy change; surface the choice.
  **Why this matters for upstream**: workflow files are the highest-scrutiny surface in any upstream PR. A bare conditional-flip without rationale will be the first redline.

### F4 — Bare `#NNN` issue refs in CHANGELOG will mis-resolve at upstream (FORK-LEAKABLE)

**File**: `CHANGELOG.md:17, 58–60`
**Severity**: medium — GitHub auto-link cross-contamination
**Issue**: The CHANGELOG additions reference `(#550)`, `Fixes #580.`, `Fixes #581.`, `Fixes #580.` (twice). When this squash is presented as a PR to `openclaw/openclaw`, GitHub will auto-resolve `#550` / `#580` / `#581` to issues / PRs in `openclaw/openclaw` — which exist (upstream has small issue numbers in this range) and are completely unrelated topics. The result is a misleading auto-link in the merged CHANGELOG and confused cross-references.

(The WORKORDER mentions Findings 1+2+3 are #586/#581/#588; the CHANGELOG references #580/#581/#580. Either the WORKORDER's Finding-3 number drifted or the CHANGELOG references the parent feature issue. Either way, the bare `#NNN` form is wrong for an upstream-presented changelog.)
**Recommended fix**: rewrite each bare `#NNN` either as fully-qualified `karmaterminal/openclaw#NNN` (preserves traceability without auto-link), OR drop the issue refs entirely from the CHANGELOG entries (the body text already describes the fix). Cleanest option for upstream reviewers: pre-file matching openclaw/openclaw issues and reference those.
**Why this matters for upstream**: cross-repo issue mis-link is the canonical fork-PR tell. Upstream maintainers see `#550` and either (a) check openclaw/openclaw#550, find an unrelated issue, and ask "what?" or (b) merge and silently corrupt the CHANGELOG with a wrong link.

### F5 — `apps/macos/.../ExecAllowlistMatcher.swift` issue #340 fix is a drive-by (SCOPE-CREEP)

**Files**:

- `apps/macos/Sources/OpenClaw/ExecAllowlistMatcher.swift:9–22`
- `apps/macos/Tests/OpenClawIPCTests/ExecAllowlistTests.swift:113–133`

**Severity**: medium — clearly out-of-scope for the continuation feature
**Issue**: The squash carries a fix for issue #340 (back-compat for bare `*` wildcard in macOS exec-allowlist matching). The added test name says "Regression: issue #340" and the implementation comment says `// See issue #340`. This is a separate macOS allowlist bug, completely unrelated to context-pressure / continuation / `continue_delegate()`.
**Recommended fix**: split into a separate upstream PR. If the fix has not been filed at openclaw/openclaw separately, file it as its own PR there; rebase this squash to drop the two changed Swift files.
If the cohort's intent is "carry it because karmaterminal/openclaw needs it and upstream will eventually want it too," document the scope decision in the commit body ("also includes regression fix for #340 because [reason]") and accept the upstream reviewer will probably ask for the split anyway.
**Why this matters for upstream**: feature PRs that drag along unrelated bug fixes get the review-comment "split this please." Doesn't block merge but adds round-trips.

### F6 — `scripts/check-duplicates.mjs` `+"studies"` is vestigial (FORK-LEAKABLE residue)

**File**: `scripts/check-duplicates.mjs:19`
**Severity**: low / cosmetic — vestigial after the studies/swim-37 strip
**Issue**: The diff adds `"studies"` to the jscpd target list, but the `studies/` directory does not exist in HEAD (correctly stripped per the strip pass). jscpd will silently skip the missing directory, so no functional break — but the bare reference points at a directory that was a fork-only artifact (swim-37 study harness).
**Recommended fix**: revert the `+ "studies",` line. The strip pass eliminated the directory; the duplicates-scan target should follow.
**Why this matters for upstream**: trivially spotted by `git diff scripts/check-duplicates.mjs`; reads as "stripped the directory but forgot the targets list."

---

## Findings — surprises (cohort missed under fatigue)

### S1 — `src/auto-reply/continuation-delegate.types.ts` is a re-export shim with zero importers (DEAD CODE)

**File**: `src/auto-reply/continuation-delegate.types.ts` (new file)
**Severity**: low — dead code allowlisted in KNIP rather than removed
**Issue**: The file is a 16-line re-export shim. Its docstring says "exists only for import path compatibility" with the canonical types at `./continuation/types.js`. Grep for any importer of `continuation-delegate.types` returns zero hits across `src/`, `extensions/`, `test/`, `apps/`. The file was added to `scripts/deadcode-unused-files.allowlist.mjs:8` to keep KNIP green.
This is the classic "added a back-compat shim during a rename, no consumer ever needed it" pattern. Safe to delete.
**Recommended fix**: delete `src/auto-reply/continuation-delegate.types.ts` and remove the matching KNIP allowlist entry. If a future consumer needs the shim path, the re-export is one line at the consumer site.
**Why upstream wouldn't catch this**: KNIP allowlist entries are accepted on faith; reviewers don't usually grep for shim importers. We should clean this up because we _know_ it's dead.

### S2 — Schema-driven removal of `cleanupBundleMcpOnRunEnd` from public Swift `AgentParams` is a public protocol breaking change (PROTOCOL — but intentional)

**Files**:

- `apps/macos/Sources/OpenClawProtocol/GatewayModels.swift:611–724`
- `apps/shared/OpenClawKit/Sources/OpenClawProtocol/GatewayModels.swift:611–724`
- `src/gateway/protocol/schema/agent.ts:171–179` (the source of the removal)

**Severity**: medium — intentional, but should be explicit in PR description
**Issue**: The schema marks `cleanupBundleMcpOnRunEnd` as `internalProtocolField` (`x-openclaw-internal: true`). The new `scripts/protocol-public-schema.ts` stripper omits it from generated public protocol artifacts (Swift `AgentParams`, JSON schema). The TypeScript runtime still accepts the field on incoming gateway requests for backward-compat with internal CLI callers. Verified: the macOS app code does not consume `cleanupBundleMcpOnRunEnd` anywhere (zero call sites in `apps/`), so the Swift removal does not break any caller.
This is the correct design and matches the squash commit body's claim ("keep internal runner knobs out of generated public Gateway protocol artifacts while preserving internal validation"). But a public-protocol field removal is a SemVer-relevant change, and the upstream PR description should call it out explicitly.
**Recommended fix**: in the upstream PR description, add a paragraph: "This PR also tightens the public protocol surface by introducing an `x-openclaw-internal` annotation; one existing field (`cleanupBundleMcpOnRunEnd`) is annotated as internal and dropped from generated Swift / JSON-schema public artifacts. The gateway continues to accept the field at runtime for backward compatibility with internal CLI callers, and no public client (macOS app, plugin SDK) currently consumes it."
**Why this matters for upstream**: maintainers reading the diff see a Swift type field disappear and may worry about external clients breaking. Pre-emptively addressing this in the PR body avoids the back-and-forth.

### S3 — `docs/.i18n/glossary.zh-CN.json` adds `"Experimental Features" → "实验性功能"` with no corresponding doc surface (ORPHAN i18n)

**File**: `docs/.i18n/glossary.zh-CN.json:653–656`
**Severity**: low / cosmetic
**Issue**: The squash adds a single zh-CN glossary entry mapping "Experimental Features" → "实验性功能". Grep'd `docs/` for "Experimental Features" — only `docs/gateway/local-models.md:311` references it, and that doc is unchanged in this squash. The continuation feature is not labelled as "Experimental Features" anywhere in the new RFC or surrounding docs.
Either (a) the entry was orphaned during a strip pass that removed an "Experimental Features"-labelled section about continuation, OR (b) it's preparation for a follow-up PR that will mark the feature experimental.
**Recommended fix**: confirm intent — if no continuation surface uses "Experimental Features" terminology, drop the entry; if a follow-up will use it, add a brief commit-body justification.
**Why this matters for upstream**: minor — but stray i18n entries with no source-side reference look like rebase residue.

---

## Findings — FYI (not blocking)

### I1 — KNIP allowlist gains five new continuation-related entries

**File**: `scripts/deadcode-unused-files.allowlist.mjs:8–24`
**New entries**: `subagent-announce.continuation.runtime.ts`, `continuation-delegate.types.ts` (S1 above), `post-compaction-release.ts`, `chain-budget.ts`, `substrate-capability-registry.ts`
**Status**: 4 of 5 are legitimately referenced (lazy-bundler entries and test-only files). `continuation-delegate.types.ts` is the dead-code shim flagged in S1.
**Action**: none beyond S1 cleanup. Worth noting that adding 5 KNIP allowlist entries in one PR is unusual — upstream may comment "are these all really needed?" but each has a defensible reason.

### I2 — `tsdown.config.ts` adds three new bundler entries with strong justifying comments

**File**: `tsdown.config.ts:202–222`
**New entries**: `auto-reply/reply/agent-runner.runtime`, `auto-reply/continuation/lazy.runtime`, `subagent-announce.continuation.runtime`
**Status**: comments explain the dedup-singleton-bearing-modules rationale and reference a real bug ("eliminating the dual-chunk split that silently dropped continue_work tool calls"). This is in-scope and well-justified bundle-topology change.
**Action**: none. Memory-pin canon flags "dist topology experiments" as upstream-leakable, but these entries fix real bugs documented in the comments. Should land on upstream PR with the comments preserved as the justification.

### I3 — Single new runtime dependency `uuid@14.0.0`

**File**: `package.json:1706` + `pnpm-lock.yaml`
**Status**: actually consumed by `src/infra/secure-random.ts:2` (`import { v7 as uuidV7 } from "uuid"`). Dependency is justified and minimal (one importer, one helper).
**Action**: none. PR body should mention the new dep with one sentence on the use case.

### I4 — Author/committer `cael-dandelion-cult` and 5 Co-Authored-By trailers

**Status**: matches `feedback_squash_prince_attribution` canon (no figs credit, prince GitHub identities + Claude Opus 4.7 + Copilot). The four princely identities are the cohort's real GitHub accounts (which is what upstream sees if they look at the commit). Not a leak — these are the actual contributor identities.
**Action**: none. This is the correct attribution form for an upstream-presented squash.

### I5 — Diff size

**Status**: 318 files, +34602 / −876, single-commit squash on top of the upstream tag. Ratio of additions to deletions tracks a ~85%-additive feature substrate, consistent with adding the continuation primitive + its persistence/heartbeat/dispatch wiring. Not a concern.

---

## Recommendation for Phase 4 cohort sign-off

**Cohort decision-shape**: do you want frond-scribe to (a) request the strip pass on F1–F6 and re-walk, (b) accept the verdict downgrades to HOLD and force-push as-is, or (c) accept the verdict downgrades to APPROVE and absorb upstream-PR redlines on F1–F6 in the upstream-PR review thread?

**Frond-scribe view**: F1 (duplicate line) and F2 (`.gitignore` rebase notes) are 1-minute fixes that meaningfully clean the upstream-PR-review surface; F4 (CHANGELOG `#NNN`) is 5 minutes; F3 (workflow flip) and F5 (#340 drive-by) and S2 (protocol field removal) are decision items the cohort should weigh in on. F6 and S1 are trivial mechanical cleanups.

**Suggested cohort path**: princes apply F1, F2, F4, F6, S1 immediately; cohort discusses F3 + F5 + S2 (real design choices); refresh REVIEW.md after the next strip pass and proceed to Phase 5 force-push with the residue properly justified.

If cohort accord lands at "ship as-is, accept redlines on the way in," verdict is HOLD-acceptable — the substrate itself does not need to be touched.

---

## Substrate confirmation

The continuation feature substrate (the actual reason this PR exists) is **upstream-presentable**:

- ✅ context-pressure / compaction substrate clean and well-tested
- ✅ `continue_delegate(targetSessionKey / targetSessionKeys / fanoutMode)` honors the `feedback_continue_delegate_must_target_other_sessions` design call
- ✅ Path A (tool delegate) and Path B (delegate-dispatch) both wire the targeting fields through to `spawnSubagentDirect`
- ✅ heartbeat-runner classifier widening preserves the existing `wake` / `event-driven` / `action-wake` taxonomies
- ✅ durable session-delivery queue preservation is correct and explicitly commented at the (now-removed) premature-ack site
- ✅ RFC v2 documents shipped behavior, return modes, traceparent semantics, chain-budget cap, fanout-span, and the explicit "what target fields do _not_ do" disclaimer
- ✅ tool-display.json includes `continue_delegate`, `continue_work`, `request_compaction` for the macOS UI surface
- ✅ public protocol surface is hardened (new `x-openclaw-internal` annotation; gen-time stripper)
- ✅ KNIP allowlist + bundler entries explained inline

The cohort byte-walked carefully under fatigue and the substrate held up. The residual concerns are wrapping, not core.

---

🌿 frond-scribe — Phase 3 REDUX critical review converged 2026-05-04
