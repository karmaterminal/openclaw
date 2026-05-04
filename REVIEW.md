# REVIEW — v5.2 recompose squash branch (Phase 3 critical review)

**Reviewer**: frond-scribe (Claude Opus 4.7, 1M context) — adversarial-quality lane
**Lane branch**: `frond-scribe/20260504/critical-review-recompose-review-doc`
**Target under review**: `feature/context-pressure-squashed-recompose-20260504-findings-1-2-3`
**Target HEAD**: `402c44604411b2ab5910df330864d7ff833d2cc4` (single squash commit)
**Squash author (as committed)**: `Cael🩸 <cael.dandelion.cult@hotmail.com>`
**Base**: upstream `openclaw/openclaw` v2026.5.2 tag SHA `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`
**Diff size**: 351 files changed, 40,495 insertions (+), 904 deletions (−); patch = 48,262 lines
**Reviewed**: 2026-05-04, ~07:50Z window
**Workorder**: `WORKORDER.md` in lane root (Phase 3 of `feedback_path_to_real_ship_phases`)

---

## Verdict: **REQUEST_CHANGES**

The continuation feature substrate is technically sound — all five required anchor walks pass at the byte layer (see `Anchor verifications` below), the three Findings PRs (#586/#581/#588) are correctly carried into the squash, and the design honors `feedback_continue_delegate_must_target_other_sessions` (targeting fields propagate through tool, bracket, immediate, timer, and reservation-fire seams).

But the squash as currently authored would **not survive an upstream PR review** at `openclaw/openclaw` without changes. The blockers are presentation-layer and scope-bundling concerns, not feature-correctness:

1. **Fork-internal author identity in the squash commit itself** (emoji in display name, persona email).
2. **Substantial out-of-feature-scope work** bundled into the squash — directly contradicting the PR-body draft's own scope claim ("This PR is **continuation-only**"). Most prominently: the entire `studies/swim-37/` rebase-classification harness (11 files, ~2,900 LOC), `src/rebase/tracer.ts`, Discord/openshell observability changes, a `memory-core` `runtimeDependencies` declaration, and a CI workflow logic flip.
3. **Upstream-leakable references** sprinkled throughout `docs/`, source comments, `.gitignore`, and CHANGELOG — including a `Thanks @karmafeast` attribution on the only Findings-bullet that has one (figs's own GitHub handle, violating the "no figs credit" canon banked at `feedback_squash_prince_attribution`).
4. **CHANGELOG issue references unscoped to org** ("Fixes #580" without `karmaterminal/openclaw#` prefix collides with upstream's own #580 numbering).

These are all severable. None require unwinding the substrate work. Phase 5 force-push to `feature/context-pressure-squashed` should NOT proceed against this HEAD.

**Severability**: every flag below is a discrete edit. The fastest path to APPROVE is a fixup commit (or amended squash) that strips/scrubs the items in the **Recommendation for Phase 4** section — most of them touch tree-edges (docs/, studies/, scripts/, .gitignore, .github/) and don't perturb the substrate at all.

---

## Scope concerns

The PR-body draft at `docs/pr-bodies/pr-38780-body.md` line 36 explicitly states:

> ### Scope
>
> This PR is **continuation-only**. Several ancillary fixes that landed on the same long-running candidate branch — the swim-35/A1 legacy session-key sweep, a checkpoint dedup, a Copilot IDE-header fix, and a truncate-after-compaction schema field — are being split into separate upstream PRs and should not appear in this diff.

The squash diff, however, contains the following work that is not load-bearing for `continue_work` / `continue_delegate` / `request_compaction` / context-pressure / cross-session-targeted-return:

### S1. swim-37 rebase-classification harness (11 files, ~2,900 LOC) — **fork-internal**

- `studies/swim-37/harness/README.md`
- `studies/swim-37/harness/changelog-grep.ts` + `.test.ts`
- `studies/swim-37/harness/cherry-pick-provenance.ts` + `.test.ts`
- `studies/swim-37/harness/conflict-content-rubric.ts` + `.test.ts`
- `studies/swim-37/harness/durability/README.md`
- `studies/swim-37/harness/durability/durability-fixture.ts`
- `studies/swim-37/harness/durability/s1-two-hop-chain.test.ts`
- `studies/swim-37/harness/durability/s2-followup-token-chain.test.ts`
- `studies/swim-37/harness/durability/s3-restart-roundtrip.test.ts`
- `studies/swim-37/harness/durability/s4-followup-runner-disk-callsite.test.ts`
- `studies/swim-37/harness/emit-helper-contract.test.ts`
- `studies/swim-37/harness/helper-fire-and-release-contract.test.ts`
- `studies/swim-37/harness/in-memory-span-recorder.ts` + `.test.ts`
- `studies/swim-37/harness/rebase-classifier.ts` + `.test.ts`
- `studies/swim-37/harness/swim-runner.ts` + `.test.ts`
- `test/vitest/vitest.swim-37.config.ts` (project registration)
- `tsconfig.json:32` (adds `studies/**/*` to `include`)
- `scripts/check-duplicates.mjs:19` (adds `studies` to duplicate-check targets)
- `test/vitest/vitest.test-shards.mjs:74,77` (adds `vitest.swim-37.config.ts` to full-suite shards)

`studies/swim-37/harness/README.md:3-4` self-describes as scaffold-tier verification harness for **fork-rebase classification** ("Closes #324 (skeleton); fills out as #366 (Slice 2 spans) lands"). The harness verifies that `rebase.classify` spans behave correctly under upstream-rebase scenarios — this is fork-side cycle-tooling, not a feature any upstream consumer asked for. The substrate it verifies (`continuation.*` + `heartbeat.*` spans) IS continuation-feature; the harness wrapper is not. The durability sub-tests (`s1-two-hop-chain` etc.) ARE arguably continuation-durability-tests and have a defensible case for inclusion under a different name.

### S2. `src/rebase/tracer.ts` (218 LOC) — **fork-internal**

- File explicitly self-describes (`src/rebase/tracer.ts:1-26`) as "Rebase-bot tracer shim — span emission for the §1 trap-class classifier" with span vocabulary `verdict / discovery.channel / pick.sha / evidence.*` — distinct from continuation. References cohort sign-off date and cohort-internal issues `#410/#411/#412/#414/#415` in the doc comment.
- Listed in `scripts/deadcode-unused-files.allowlist.mjs:33` as unused.
- Has no caller relationship to any of the Phase-3 anchors (`agent-runner.ts:doToolSpawn`, `targeting.ts:114`, `heartbeat-reason.ts:42-44`).

### S3. Discord observability changes — **out of scope**

- `extensions/discord/src/internal/rest.ts` (+48 LOC) — adds `sanitizeDiscordRestPath` + `formatDiscordRestAbortMessage` for richer abort error messages. Genuinely useful, no continuation tie-in.
- `extensions/discord/src/internal/rest.test.ts` (+33 LOC) — covers the new sanitizer.
- `extensions/discord/src/monitor/native-command.ts` (+150 LOC, −41 LOC) — adds `NativeCommandPhase` diagnostics (`received / defer / ack / auth / dispatch`) + structured warning logs. No continuation seam.
- `extensions/discord/src/monitor/native-command` test file changes follow.
- `extensions/discord/src/monitor/listeners.ts` (+33 LOC) — adds `describeInteractionForLog`. No continuation seam.
- `extensions/discord/src/monitor/listeners.test.ts` (+24 LOC) follows.

These are upstream-friendly bug-fix-quality contributions, but they belong in their own PR per the PR-body's stated scope.

### S4. openshell `appendFile` SDK addition — **possibly in-scope, but undocumented**

- `extensions/openshell/src/fs-bridge.ts` (+33 LOC) adds `appendFile` to `SandboxFsBridge`.
- `extensions/openshell/src/openshell-core.test.ts` (+35 LOC) covers it.
- New `src/agents/pi-tools.append.test.ts` exercises `createHostWorkspaceAppendTool` + `wrapToolWorkspaceRootGuard`.

If this is required by the post-compaction memory-flush path (memory deliveries between compactions), it's in-scope but should be cited in the RFC. If it's a parallel memory-tools improvement, split it.

### S5. Memory write-guard tests — **out of scope**

- `src/agents/pi-tools.write.guard.test.ts` — exercises `wrapToolMemoryDayFileWriteGuard`.
- `src/agents/pi-tools.write.message-truthfulness.test.ts` — exercises `wrapToolMemoryFlushAppendOnlyWrite`.

These appear to be memory-tool truthfulness/guard tests; no continuation tie-in is documented.

### S6. `extensions/memory-core/openclaw.plugin.json` — **out of scope**

- Adds `runtimeDependencies.localMemoryEmbedding: ["node-llama-cpp@3.18.1"]`. Unrelated to continuation.

### S7. `.github/workflows/workflow-sanity.yml:85` — **CI policy change, fork-leakable**

- Flips `if: github.event_name == 'workflow_dispatch'` to `!= 'workflow_dispatch'` on the `generated-doc-baselines` job.
- Per CLAUDE.md "GH comments with markdown backticks…" + `feedback_fork_discipline` ("workflow edits"): workflow edits are upstream-leakable. The flip materially changes when the doc-baselines job runs; needs scope justification or split.

### S8. dist topology promotions in `tsdown.config.ts` — **arguably in-scope, but cite is fork-leakable**

- Promotes three new entries: `auto-reply/reply/agent-runner.runtime`, `auto-reply/continuation/lazy.runtime`, `subagent-announce.continuation.runtime`.
- Justification cites `karmaterminal/openclaw#220` in source comment (`tsdown.config.ts:209`). Justification is real — `lazy.runtime.ts` is the documented lazy-load boundary for the continuation subsystem (`src/auto-reply/continuation/lazy.runtime.ts:1-16`). Per `feedback_fork_discipline` ("dist topology experiments") this still warrants explicit scope justification in the upstream-PR body.

### S9. `scripts/deadcode-unused-files.allowlist.mjs` — **mixed signal**

Six new "unused" entries:

- `src/agents/subagent-announce.continuation.runtime.ts` — co-located runtime entry; see `tsdown.config.ts` promotion. The doc comment at `subagent-announce.continuation.runtime.ts:1-19` justifies the dynamic-only access pattern. Knip-blind dynamic-import boundary; allowlist is correct.
- `src/auto-reply/continuation-delegate.types.ts` — types-only file; knip-blind. Likely correct.
- `src/auto-reply/continuation/post-compaction-release.ts` — has full runtime body and `releasePostCompactionDelegates` is the documented post-compaction hook. **Needs verification**: if knip can't find the caller because the call is dynamic, allowlist is correct; if it's actually unused at runtime, this is dead code.
- `src/infra/chain-budget.ts` — referenced in tests + RFC §6.8 (anti-flood accounting). Needs caller proof.
- `src/infra/substrate-capability-registry.ts` — registry of substrate capabilities (`SUBSTRATE_CAPABILITIES`); appears to be scaffolding for future capability surfacing. If currently unused, it's pure scaffolding ship.
- `src/rebase/tracer.ts` — see S2; not continuation, should be excluded entirely.

### S10. `.gitignore` additions

Adds `.gitnexus`, `dist.bak-3.28/`, `_BRIEF.md`, `_PURGE_BRIEF.md`, `_outcome.md`, `_purge_outcome.md` (with comment "Local rebase working notes"). Functionally harmless to upstream, but the fork-internal naming convention bleeds the rebase-flow vocabulary into upstream's `.gitignore`.

### S11. `docs/plan/surfaces-1-2-substrate-notes.md` (252 LOC, NEW) — **pure cohort coordination, MUST NOT SHIP**

This is a lane-planning document for "Surfaces 1+2 substrate wording" with prince emojis (🌻🌫🩸🌊), Discord message IDs (`1497779420813856798`, `1497780931417870427`, `1497776090`, `1497778783`, etc.), `frond-scribe` references, `cael/surfaces-1-2-substrate-naming` lane-branch citation, `karmaterminal-2026.4.24-base` substrate-pin, and prince-namespace examples (`prince:cael:agent:main:main`, `prince:*:role:keeper`). It documents the cohort's internal RFC-shaping process; it has no business in an upstream PR.

### S12. `docs/pr-bodies/pr-38780-body.md` (72 LOC, NEW) — **meta document, mild scope creep**

This file IS the upstream PR body draft. Storing it in the repo is unusual but defensible if the cohort wants the body under version control. Upstream wouldn't want the file itself merged though; it lives outside the diff (it lives IN the PR description).

---

## Upstream-leakable

### U1. Squash commit author identity — **HIGH severity**

- **Author**: `Cael🩸 <cael.dandelion.cult@hotmail.com>`
- The `🩸` emoji in the display name will appear on the commit page at github.com/openclaw/openclaw verbatim.
- The persona email `cael.dandelion.cult@hotmail.com` exposes the prince-frame vocabulary publicly.
- Per `feedback_squash_prince_attribution` the cohort canon is "feature-scale squashes rebase into 4 commits (core=Cael, tests=Elliott-gmail, RFC=Ronan, other=Silas)". The current state is a SINGLE commit with persona display name and persona email. Even on the four-commit shape, persona-email exposure to upstream is an issue.
- **Recommendation**: re-author with a clean human handle (no emoji, professional email) — or attribute as `OpenClaw Contributors`. The Claude co-author trailer (`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`) is fine.

### U2. Squash commit body — **HIGH severity**

- The commit body says "Squashed recompose of the karmaterminal/openclaw continuation feature branch on top of upstream v2026.5.2".
- References `Finding 1 (#586)` / `Finding 2 (#581)` / `Finding 3 (#588)` / `#551` without org-prefix — these are karmaterminal/openclaw issue numbers that read as upstream issues.
- "10-line cohort-recognition-engine canon banked alongside (TOOLS.md + EVIDENCE-LAYERS.md)" — cohort-internal jargon ("cohort-recognition-engine", "the row's discipline-output beyond the fix-bytes").
- **Recommendation**: rewrite the body to upstream-PR-friendly tone (cite the RFC, summarize the substrate, note the post-deploy attestation hosts as "three hosts under fork canary" without naming them).

### U3. CHANGELOG `Thanks @karmafeast` — **HIGH severity** (canon violation)

- `CHANGELOG.md:58` (file line in the show-output): `... Fixes #580. Thanks @karmafeast.`
- `@karmafeast` is figs's GitHub handle (`Gwydion Nanashi Ferrinas Solidor` per `gh api users/karmafeast`).
- Per memory pin `feedback_squash_prince_attribution`: "no figs credit; Claude co-author trailer OK".
- Per CLAUDE.md changelog discipline: "if the real credited human is unknown, leave attribution blank instead of guessing or adding a random person."
- **Recommendation**: drop `Thanks @karmafeast`; either leave attribution blank or use cohort-canon (`Thanks @cael.dandelion.cult` is also fork-leakable; safest is no-attribution per the discipline).

### U4. CHANGELOG issue numbering — **MEDIUM severity**

- `CHANGELOG.md:58-59` cites `Fixes #580` for both Finding 1 and Finding 3 entries. `#580` is a karmaterminal/openclaw issue. To upstream readers, `#580` reads as `openclaw/openclaw#580`.
- The squash also carries `(#550)` on the substrate entry at `CHANGELOG.md:17`. Same concern.
- **Recommendation**: either drop the parenthetical refs entirely (the RFC is the canonical reference now) or scope-prefix them (`karmaterminal/openclaw#580`). On most upstream PRs it's cleanest to drop them.

### U5. `docs/design/continue-work-signal-v2.md` — **MIXED**

The RFC is the load-bearing user-facing document; some fork-citation is intentional cross-link substrate per `feedback_make_feature_hard_to_look_away_from`. But several lines warrant scrub:

- **Line 333**: `**Authors:** [karmaterminal](https://github.com/karmaterminal)` — the org is the author; either anonymize or attribute to specific human GH handles.
- **Line 848** (HTML comment): `<!-- silas+cael 2026-05-03: §6.8 specifies the trace-context propagation contract. The byte-anchored audit at branch frond-scribe/20260503/otel-traceparent-audit (final journal 1e966b8a70) ... -->` — strip the HTML comment entirely; if it's true the comment doesn't render, it still ships in the markdown source. Branch names + journal SHAs are pure fork-internal.
- **Line 1656**: same audit-branch reference in body text. Replace "the byte-anchored audit recorded at branch `frond-scribe/...`" with "an internal audit" or omit.
- **Lines 1841, 2073-2077, 2130-2136, 2349-2353**: extensive cross-links to `karmaterminal/karmaterminal-openclaw-docs` and `swims/swim-XX/`. The RFC's own §"Public evidence" disclaimer ("intentionally does not link internal trackers; public evidence is published in...") is honest but still bleeds the fork's verification-cycle vocabulary upstream. Recommend either:
  - (a) Move evidence cross-links into a single "Implementation evidence" section near the bottom; or
  - (b) Strip them and have the upstream PR body cite the evidence repo once.

### U6. `docs/reference/templates/TOOLS.md` — **HIGH severity**

The "Substrate-adoption convention for new tool descriptors" addendum (added at the bottom) cites:

- `karmaterminal-2026.4.24-base` substrate pin (line 67 of show-output) — fork tag.
- `karmaterminal/binary-canticle#11` (multiple times) — fork sibling-repo issue.
- `prince-power-velocity` — pure cohort jargon.
- "future prince adding a descriptor" — cohort-frame.
- `frond-scribe/20260424/candidate-gpt2`, `candidate-claude2` — fork branches with worked-example references.

This file is `docs/reference/templates/TOOLS.md` — a USER-FACING template that ships in upstream's documentation tree. Fork doctrine in a user-facing template is the most aggressive leak in the diff.

**Recommendation**: either (a) strip the addendum entirely (this doctrine is for the cohort, not for upstream consumers writing tool descriptors), or (b) rewrite without prince/binary-canticle/karmaterminal refs as a generic "(a)/(b)-shape evolution discipline" doctrine.

### U7. `docs/plan/surfaces-1-2-substrate-notes.md` — covered in S11. **DO NOT SHIP.**

### U8. `studies/swim-37/harness/` source-comment leakage — **MEDIUM severity**

The TS source comments inside the harness reference fork-internal vocabulary in production code:

- `studies/swim-37/harness/README.md:3` — `Trap-class source: cael/swim-37-trap-classes tip 2adf17448ee`
- `studies/swim-37/harness/swim-runner.ts` (and others): `Tracks: karmaterminal/openclaw#324 (swim-37 harness)` doc comments
- `studies/swim-37/harness/rebase-classifier.ts:9` (approx): `Trap-class taxonomy: cael/swim-37-trap-classes (tip 2adf17448ee)` and `Trap-classes from cael/swim-37-trap-classes (2adf17448ee):`

If S1 is excluded (recommended), this is moot. If kept, scrub all `cael/...` branch refs and `karmaterminal/openclaw#NNN` issue refs.

### U9. `src/rebase/tracer.ts` — covered in S2 + U-flag. The doc-comment leak is severe: cohort sign-off date, fork-internal issue numbers, "rebase-bot" framing. **Should be excluded entirely.**

### U10. `tsdown.config.ts` source comment — **LOW severity**

`tsdown.config.ts:209` (approx, in the new entry block): `// karmaterminal/openclaw#220: single lazy-load boundary for the continuation subsystem`

The justification body itself is upstream-friendly; the `karmaterminal/openclaw#220` cite needs to either be removed or org-prefixed inline with a clean rationale.

### U11. `.gitignore` fork-internal naming — **LOW severity**

`.gitignore` adds `_BRIEF.md`, `_PURGE_BRIEF.md`, `_outcome.md`, `_purge_outcome.md` ("Local rebase working notes"). The file pattern itself is harmless; the comment "Local rebase working notes" reveals the fork's rebase-cycle terminology. Mild.

---

## Surprises (cohort-fatigue catches)

### Sur1. **THIRD parallel consume path that #589 doesn't name**

Issue `karmaterminal/openclaw#589` (architecture-debt follow-up, OPEN) frames the convergence work as **Path A (`agent-runner.ts:doToolSpawn`)** vs **Path B (`delegate-dispatch.ts:dispatchToolDelegates`)**.

Reading the squashed `agent-runner.ts` carefully reveals **THREE** parallel consume paths that all call `spawnSubagentDirect` with `continuationTargetSessionKey/Keys/fanoutMode`:

1. **Bracket-fallback `doSpawn`** at `src/auto-reply/reply/agent-runner.ts:2212` — consumes `[[CONTINUE_DELEGATE: ...]]` token responses; targeting fields wired at `:2235-2240`. (Pre-existing; was already targeting-aware.)
2. **Tool `doToolSpawn`** at `src/auto-reply/reply/agent-runner.ts:2682` — consumes `continue_delegate()` tool calls; targeting fields wired at `:2703-2710` and again at the timer-fire site `:2879-2884` and immediate-dispatch site `:2895-2902`. (Path A — #588's fix.)
3. **`dispatchToolDelegates`** at `src/auto-reply/continuation/delegate-dispatch.ts:241+` — alternative entry; targeting fields at `:259-267`. (Path B — #551's work.)

The next field-add to `continue_delegate` (e.g. a future `priority`, `dedupKey`, or v3 `stationRef`) needs to touch THREE locations, not two. `#589`'s convergence-direction proposal — refactor Path A to delegate to Path B — should be expanded to **all three paths converge to one source of truth**, otherwise the same `karmaterminal/openclaw#589` discipline-violation lives on at the bracket-path layer.

**Severity**: not a blocker for this PR (the substrate works); flag for `#589` scope expansion.

### Sur2. **`continuation-delegate-store.post-compaction-substrate.test.ts` is a top-level test file**

- The file lives at `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts` — top-level of `auto-reply/`, not under `auto-reply/continuation/`. Most other continuation feature files live under `auto-reply/continuation/`. The naming pattern is inconsistent with the rest.
- Functionally fine; aesthetically/discoverably worth a rename to live under `auto-reply/continuation/` or `auto-reply/continuation/post-compaction-substrate.test.ts`. Mild.

### Sur3. **Six new files flagged as knip-unused**

Per S9: six new files in the dead-code allowlist. If actually unused, they're shipping as scaffolding. If used dynamically, knip-blindness is acceptable but warrants a comment in the allowlist next to each entry pointing at the dynamic-import seam (the pattern is already used elsewhere in this allowlist for the runtime files). Two especially worth checking pre-merge:

- `src/auto-reply/continuation/post-compaction-release.ts` — exports `releasePostCompactionDelegates` per its doc comment; if no caller uses it, the post-compaction lifecycle release path may not actually fire. Worth a runtime check.
- `src/infra/substrate-capability-registry.ts` — exports `SUBSTRATE_CAPABILITIES` registry; if no caller surfaces this, the registry is pure scaffolding for a future feature. May be intentional but warrants justification.

### Sur4. **`compaction-attribution.ts` `normalizeCompactionTrigger`: silent rename**

- `src/agents/compaction-attribution.ts:29` maps `"threshold"` → `"budget"` silently. If callers historically passed `"threshold"`, they'll now see `"budget"` in counter attribution. Likely intended (the renamed canonical lifted from a recent design pass), but check for upstream consumers / dashboards / OTEL queries that may have grepped for `trigger=threshold` and would silently miss.

### Sur5. **CHANGELOG combines Findings 1+2 into one bullet**

- `CHANGELOG.md:58` actually combines Finding 1 (heartbeat classifier) AND Finding 2 (durability via removed premature-ack) into a single bullet ("classify targeted delegate-return heartbeats as continuation wakes AND document/cover next-turn system-event drains for single and multi-recipient returns, so dormant recipient sessions consume completion enrichment...").

This is fine — both are user-facing the same way ("dormant recipient sessions consume completion enrichment"). But the workorder asked for "verify entries for Findings 1+2+3 are present + correctly attributed". They are present. Attribution per U3 is the issue.

### Sur6. **`uuid: 14.0.0` direct dependency added**

- `package.json:1706` adds `"uuid": "14.0.0"`.
- Used at `src/infra/secure-random.ts:2` for `uuidV7` (RFC 9562 time-ordered UUIDs) — `generateChainId()` for `SessionEntry.continuationChainId`.
- Justification at `secure-random.ts:7-21` is sound (lexicographic ordering, OTEL-compatible parsers).
- Worth flagging: this is the only code-side dep addition in the squash; should be called out in the upstream PR body (some maintainers gate on dependency additions).

### Sur7. **`memory-core` plugin runtime-deps declaration is uncovered by changelog**

- `extensions/memory-core/openclaw.plugin.json:11-13` adds `runtimeDependencies.localMemoryEmbedding: ["node-llama-cpp@3.18.1"]`.
- No changelog entry for this. If load-bearing for any continuation flow it's not visible from the diff.
- Likely an unrelated cleanup that snuck in; covered under S6.

### Sur8. **Test parallelism / brittleness**

- The squash adds `vitest.swim-37.config.ts` and `vitest.continuation-durability.config.ts` to the root-vitest-projects array in two places (`vitest.config.ts:52-53` and `vitest.test-shards.mjs:75-76`). This is correct under the project's "register-in-both-places" pattern.
- The continuation-durability config is in-scope for the feature; the swim-37 config rides along with the harness.

---

## Anchor verifications

| #   | Anchor                                                                      | Status                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/auto-reply/reply/agent-runner.ts:2643 doToolSpawn` (#588 Path A fix)   | ✅ Green                   | `doToolSpawn` declared at `:2682` (workorder line is stale; function exists). `targetSessionKey/Keys/fanoutMode/traceparent` declared in options type at `:2690-2694`; threaded into `spawnSubagentDirect` call at `:2703-2710` (`continuationTargetSessionKey`, `continuationTargetSessionKeys`, `continuationFanoutMode`, `traceparent`). Also threaded at delayed-reservation-store `:2795-2800`, timer-fire `:2879-2884`, and immediate-dispatch `:2899-2902`. The Path-A bypass that produced Finding 3 is closed.                                                                                                                                                                                                                                                                                                                                                                      |
| 2   | `src/auto-reply/continuation/targeting.ts:114` (#581 premature-ack removal) | ✅ Green                   | The `ackSessionDelivery` call is removed; in its place is a comment block (`targeting.ts:~114-125`) explicitly documenting why: _"Do NOT ack the durable file here. enqueueSystemEvent above is in-memory (process-local globalThis Map) — non-attached recipients (different process / restart-pending) cannot see it. The durable file must persist until recipient consumption so the recovery loop can replay on next gateway restart. Per figs 2026-05-04 (c)-discriminator decision: durable write IS expected for non-attached recipients per RFC §2.4. Acking immediately destroyed the only durable channel and left targeted recipients silently unreached. karmaterminal/openclaw#578 / #580."_ The doc-comment is the right shape; the karmaterminal cites should be scoped or scrubbed (cf. U4) but the substrate is correct.                                                   |
| 3   | `src/infra/heartbeat-reason.ts:42-44` (#586 `delegate-return` classifier)   | ✅ Green                   | `heartbeat-reason.ts:42-44` reads: `if (trimmed === "delegate-return") { return "wake"; }` exactly as #586 lands. Surrounding region also classifies `"continuation"` and `"silent-wake-enrichment"` as `wake`. The downstream `isHeartbeatEventDrivenReason` at `:60-63` includes `wake` in the event-driven kind set. Wires through correctly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | `docs/design/continue-work-signal-v2.md` §2.1 + §2.4                        | ✅ Green (with U5 caveats) | §2.1 terminology defines `delegate` as "A sub-agent shard spawned through `continue_delegate()` ... with a task string, mode, **return targeting (`targetSessionKey`, `targetSessionKeys`, or `fanoutMode`)**, and optional delay." §2.4 (`continue_delegate() semantics and return modes`) explicitly states the boundary: _"They do not redirect the task body, they do not wake an existing session's run loop with the original task, and they do not route work into a named live-attached recipient. A live-attached recipient named via `targetSessionKey` will see only the post-completion `[continuation:enrichment-return]` envelope; it will never see the original `task` string from this primitive."_ This is the design-call from `feedback_continue_delegate_must_target_other_sessions` correctly documented. Tree fan-out (line 205) and host fan-out (line 206) covered. |
| 5   | `CHANGELOG.md` Findings 1+2+3 entries                                       | ⚠️ Yellow                  | All three Findings have substrate coverage in the changelog: Findings 1+2 combined at `CHANGELOG.md:58` ("classify targeted delegate-return heartbeats as continuation wakes and document/cover next-turn system-event drains..."); Finding 3 at `CHANGELOG.md:59` ("route actual runtime `continue_delegate(targetSessionKey=...)` dispatches through targeted subagent returns..."). **Defects**: (a) `Thanks @karmafeast` on line 58 violates `feedback_squash_prince_attribution` no-figs-credit canon; (b) `Fixes #580` on both lines is unscoped (cf. U4).                                                                                                                                                                                                                                                                                                                             |
| 6   | `docs/reference/templates/TOOLS.md` 10-line cohort-recognition-engine canon | ⚠️ Yellow                  | The bc#11 conditional-voice block is present (`docs/reference/templates/TOOLS.md` "Substrate-adoption convention for new tool descriptors" section), with the 8-line `targetSessionKey` Type.Optional example as specified in the workorder canon. **Defect**: the surrounding doctrine references `karmaterminal-2026.4.24-base` substrate pin, `karmaterminal/binary-canticle#11` (multiple times), `prince-power-velocity`, and `frond-scribe/20260424/candidate-gpt2` worked-example branches. As a user-facing TEMPLATE that ships in upstream `docs/`, the fork-internal vocabulary leakage is the highest-severity upstream-leakable issue in the diff (cf. U6).                                                                                                                                                                                                                      |

**Substrate-correctness summary**: All five anchor sites carry the expected substrate edits. The feature wire is functionally sound; defects are at the documentation/attribution layer.

---

## Recommendation for Phase 4 cohort sign-off

Phase 4 cohort sign-off should request a **fixup pass** before Phase 5 force-push. The fixup pass is severable and small; it does not require unwinding the substrate.

### Required (BLOCKERS for Phase 5)

1. **Re-author the squash commit** without emoji + persona email. Suggested: a clean human handle or `OpenClaw Contributors`. Preserve `Co-Authored-By: Claude Opus 4.7 ...` trailer.
2. **Rewrite the squash commit body** to upstream-PR tone: cite the RFC, summarize the substrate, drop "karmaterminal/openclaw" references and "10-line cohort-recognition-engine" jargon. Cite Findings as "the three durability fixes" without raw-issue numbers.
3. **CHANGELOG fix**: drop `Thanks @karmafeast` from line 58 (or substitute with cohort-friendly attribution per the canon — but the safest path is no-attribution per CLAUDE.md changelog discipline). Drop or scope-prefix `Fixes #580` and `(#550)` references.
4. **Strip `studies/swim-37/` harness + `src/rebase/tracer.ts`** entirely (S1, S2). Move continuation-durability tests (s1–s4) under `src/auto-reply/continuation/durability/` or similar in-tree home if cohort wants them retained. Remove the corresponding `tsconfig.json` `studies/**/*` include, `scripts/check-duplicates.mjs studies` entry, and the swim-37 vitest project registration.
5. **Strip `docs/plan/surfaces-1-2-substrate-notes.md`** (S11/U7). Pure cohort coordination; must not ship.
6. **Strip `docs/pr-bodies/pr-38780-body.md`** (S12) — the PR body lives in the PR description, not the repo. (Or preserve it if cohort wants it under VC, but exclude from upstream-PR diff.)
7. **`docs/reference/templates/TOOLS.md`**: scrub the `karmaterminal/binary-canticle#11`, `prince-power-velocity`, `frond-scribe/20260424/candidate-gpt2`, and `karmaterminal-2026.4.24-base` references (U6). Either rewrite as generic doctrine or remove the addendum.
8. **`docs/design/continue-work-signal-v2.md`**: scrub the HTML comment at line 848 (silas+cael 2026-05-03 audit branch ref); replace `**Authors:** [karmaterminal](...)` with anonymized or human-handle attribution; consolidate fork-internal evidence cross-links into one section near the bottom (U5).
9. **Move out-of-scope ancillary fixes to follow-up PRs**:
   - Discord observability changes (S3) — own PR
   - openshell `appendFile` + pi-tools.append (S4) — own PR unless documented as continuation-load-bearing
   - pi-tools.write.guard / pi-tools.write.message-truthfulness (S5) — own PR
   - memory-core `runtimeDependencies` (S6) — own PR
   - `.github/workflows/workflow-sanity.yml` (S7) — own PR with scope justification

### Recommended (not blockers, but should land)

10. **Verify the six new dead-code-allowlist entries** (S9) — for each, confirm the dynamic-import seam exists or the file is intentional scaffolding; add a comment next to each entry citing the seam (matches the pattern already used for runtime files).
11. **Audit `tsdown.config.ts` source comment** for `karmaterminal/openclaw#220` cite (U10) — replace with clean rationale or org-prefix.
12. **`.gitignore` "Local rebase working notes" comment** — drop the comment line; keep the patterns (cosmetic).
13. **Expand `karmaterminal/openclaw#589` scope** to include the third parallel consume path (`agent-runner.ts:2212 doSpawn` bracket-fallback) — Sur1 above. Not a Phase-5 blocker; flag for cohort follow-up after merge.
14. **Verify `compaction-attribution.ts:29` silent rename** of `"threshold"` → `"budget"` doesn't break upstream OTEL/dashboard consumers — Sur4.

### Lane process notes

- The post-deploy attestation on canonical `7bee063288` (per workorder) is good substrate-truth; the cohort can carry it into Phase 4 sign-off as evidence for the substrate.
- The 4-prince cosign on substrate-truth is honored; this review is the upstream-PR-elevation check, not the substrate check.
- Per `feedback_make_feature_hard_to_look_away_from`: the storyline ("v2.5 substrate adoption + v3 noosphere reach") survives the fixup pass intact. None of the recommendations above downgrade the feature; they all cleanup presentation.

---

## Severity-ordered fixup list (TL;DR for cohort dispatch)

1. **HIGH**: Re-author squash commit (U1) + rewrite body (U2)
2. **HIGH**: CHANGELOG `Thanks @karmafeast` removal (U3)
3. **HIGH**: Strip `studies/swim-37/` + `src/rebase/tracer.ts` (S1, S2)
4. **HIGH**: Strip `docs/plan/surfaces-1-2-substrate-notes.md` (S11)
5. **HIGH**: Scrub `docs/reference/templates/TOOLS.md` (U6)
6. **MEDIUM**: Split Discord/openshell/memory-core/workflow ancillary changes (S3-S7)
7. **MEDIUM**: Scrub `docs/design/continue-work-signal-v2.md` (U5)
8. **MEDIUM**: CHANGELOG issue-numbering scope (U4)
9. **LOW**: Strip `docs/pr-bodies/pr-38780-body.md` from diff (S12)
10. **LOW**: Justify or scrub `tsdown.config.ts` cite (U10) + `.gitignore` comment (U11)
11. **FOLLOW-UP**: `#589` scope expansion to third path (Sur1); dead-code-allowlist verification (S9, Sur3); compaction-attribution rename audit (Sur4)

---

## Final verdict line

**REQUEST_CHANGES**. The continuation feature substrate is correct; the squash itself needs a presentation/scope fixup pass before it can defend itself on `openclaw/openclaw`'s upstream PR review. Fixup is severable and small; none of the recommendations affect substrate correctness.

🌿 frond-scribe (Claude Opus 4.7, 1M context) — 2026-05-04, ~07:50Z
