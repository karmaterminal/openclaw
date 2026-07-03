# Upstream `main` Drift vs Assembly Continuation Branch — Back-Merge Report

**Lane:** read-only analysis. No code edits, no PR, no merge/rebase landed. The only
working-tree change is this `output.md`.

**Author branch:** `codeagent/upstream-drift-assembly-report`
**Generated:** 2026-07-02 (America/Los_Angeles)

---

## 0. Refs, merge base, scope

| Ref | SHA | Tip subject / date |
| --- | --- | --- |
| Assembly base (HEAD) | `2ed7288ffcdca5cccbd07927f4c028a637ab6fa2` | `Merge … assembly-safe-fold-1155-1156` · 2026-07-02 08:23 -0700 |
| `origin/main` (fork) | `537b8a2516326f18c97e1764225eb9fb97d1f44e` | `test(qa): cover expanded Crabline bindings (#98779)` · 2026-07-02 17:07 -0700 |
| `upstream/main` (openclaw) | `ae9de77665385c6238e7bd0b2e775b5768643d6b` | `test(qa): cover Crabline Matrix sends (#99265)` · 2026-07-02 17:38 -0700 |
| `origin/codeagent/1144-assembly-review-followups` (PR #1158) | `6b11562fbf12a7a4189506dcf0c4a5488856bc0f` | not folded into assembly |
| **Merge base** (all three) | `a6aaba76ac66ba3edacafd337672ab8ae1660b70` | `fix(google): bound OAuth response body reads` · 2026-06-28 21:49 -0700 |

Key topology facts:

- `git merge-base origin/main upstream/main` = `537b8a2516…` = **`origin/main` itself**.
  The fork's `main` is a *clean ancestor* of `upstream/main`; it is only **4 commits behind**
  (all four are trailing `test(qa): cover Crabline …` + one `refactor(shared): lazy runtime loader
  foundation (#99261)`). So for drift purposes, **`origin/main` ≈ upstream `main`**; back-merging
  `origin/main` is effectively back-merging upstream.
- `git merge-base origin/main <assembly>` = `git merge-base upstream/main <assembly>` =
  `a6aaba76ac…`. **Same merge base** either way.
- Divergence from the merge base:
  - `origin/main` is **+700 commits** (382,409 insertions / 16,884 deletions across 2,026 files).
  - Assembly is **+480 commits** (55,878 insertions / 999 deletions across 348 files).
  - Raw `assembly..origin/main` diff (what a back-merge pulls) = **2,316 files**.
- PR #1158 (`codeagent/1144-assembly-review-followups`) merge-base with assembly = assembly HEAD
  itself → #1158 is a **descendant** of the assembly base (fast-forward-able onto it); it is *not*
  in the assembly base yet.

> The insertion counts are dominated by generated/lock/test artifacts across ~4 days of very
> high-velocity upstream commits; the *conflict* surface is far smaller (below).

### Commands used (representative)

```bash
git fetch origin main frond-scribe/20260624/assembly-continuation-followons \
  codeagent/1144-assembly-review-followups
git fetch upstream main
git merge-base origin/main 2ed7288ffc
git merge-base upstream/main 2ed7288ffc
git merge-base origin/main upstream/main
git rev-list --count 2ed7288ffc..origin/main        # 700
git rev-list --count origin/main..2ed7288ffc         # 480
git diff --shortstat a6aaba76 origin/main            # 2026 files
# --- conflict forecast (non-destructive) ---
git merge --no-commit --no-ff origin/main            # exit 1, conflicts
git diff --name-only --diff-filter=U                 # 12 files
git merge --abort                                    # restored clean
# --- classification ---
git diff --numstat a6aaba76 2ed7288ffc -- <path>     # assembly-side churn
git diff --numstat a6aaba76 origin/main -- <path>    # main-side churn
git show d45b8be939 -- .../tool-result-truncation.ts # #98955 fix
git ls-tree origin/main --name-only .../tool-result-text.ts
gh pr view 98955 --repo openclaw/openclaw --json mergeCommit,files
gh api repos/openclaw/openclaw/issues/{99168,98528,96857,97742}
```

Code-intelligence note: GitNexus was not available in this worktree. Symbol tracing used
`git grep <symbol> <ref> -- <pathspec>`, `git show <ref>:<path>`, ripgrep, and the captured
conflict preimages. All symbol claims below are cited to files/lines on a named ref.

---

## A. Merge conflict forecast

`git merge --no-commit --no-ff origin/main` into the assembly base **failed with conflicts
(exit 1)** and was immediately aborted. Post-abort worktree is clean, `HEAD` = `2ed7288ffc`,
no `MERGE_HEAD`. **12 conflicted files, 29 conflict hunks.**

> ⚠️ `rerere.enabled=true` in this worktree. The forecast merge only *recorded preimages*
> (no resolutions were stored, since we aborted unresolved). The real merge later will still
> present all conflicts, but be aware rerere will try to auto-apply once someone resolves them.

| # | File | Hunks | asm churn | main churn | Class | Mechanical vs design |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/agents/subagent-announce.ts` | 2 | +1119/-37 | +19/-1 | **must-preserve-assembly** | **DESIGN-SENSITIVE** |
| 2 | `src/auto-reply/reply/agent-runner-execution.ts` | 2 | +504/-26 | +330/-239 | **must-preserve-assembly + superseder overlap** | **DESIGN-SENSITIVE** |
| 3 | `src/gateway/server-methods/agent.ts` | 1 | +39/-2 | +130/-43 | must-preserve-assembly | mechanical + ordering |
| 4 | `src/agents/embedded-agent-runner/run/attempt.ts` | 1 | +44/-0 | +183/-80 | adjacent drift (option-bag) | mechanical union |
| 5 | `src/infra/heartbeat-runner.ts` | 2 | +76/-12 | +39/-5 | adjacent drift (option-bag) | mechanical union |
| 6 | `src/infra/diagnostic-events.ts` | 1 | +55/-0 | +31/-0 | adjacent drift (type union) | mechanical union |
| 7 | `src/agents/embedded-agent-runner/compact.ts` | 1 | +8/-7 | +47/-8 | adjacent drift (imports) | mechanical (take main) |
| 8 | `test/scripts/lint-suppressions.test.ts` | 1 | +2/-0 | +1/-0 | baseline | regenerate/union |
| 9 | `scripts/plugin-sdk-surface-report.mjs` | 3 | +5/-5 | +10/-10 | generated budgets | **regenerate, do not hand-pick** |
| 10 | `src/plugins/status.test.ts` | 1 | +1/-0 | +6/-0 | test mock shape | take main's mock |
| 11 | `extensions/mattermost/src/mattermost/client.retry.test.ts` | 11 | +18/-66 | +27/-132 | probably independent | mechanical (multi-hunk) |
| 12 | `extensions/ollama/provider-discovery.test.ts` | 3 | +28/-41 | +15/-33 | probably independent | mechanical |

### Per-conflict resolution notes

**1. `src/agents/subagent-announce.ts` — DESIGN-SENSITIVE, highest risk.**
Assembly overwhelmingly owns this file (+1119/-37 vs main's +19/-1).
- *Hunk @ imports:* assembly adds `import { resolveAgentIdFromSessionKey, resolveStorePath,
  updateSessionStore } from "../config/sessions.js"`; main adds `import { logWarn } from
  "../logger.js"`. → **union both** (assembly does *not* currently import `logWarn`; it must be
  added to support main's warning below).
- *Hunk @ silent/skip reply (~line 981):* the base did `return true;` early. **Assembly deliberately
  removed the early return** and set `skipAnnounceDelivery = true` to *fall through to chain-hop
  accounting*, with an explicit comment: "*Without this, subagents that reply with NO_REPLY bypass
  cost-cap enforcement and chain-hop accounting entirely.*" Main kept the early `return true;` but
  added a cron `ANNOUNCE_SKIP` warning (`isAnnounceSkip(reply) && isCronSessionKey(...)` → `logWarn`).
  A naive "take main" **silently reverts the assembly continuation fix** (NO_REPLY subagents would
  again bypass cost-cap/chain-hop). A naive "take assembly" drops main's cron warning.
  → **Hand-merge:** keep assembly's `skipAnnounceDelivery = true` fall-through (no early return),
  *insert main's cron ANNOUNCE_SKIP `logWarn` before the fall-through*. Assembly already imports
  `isCronSessionKey` (2 refs) and `isAnnounceSkip` (4 refs); only `logWarn` must be added.

**2. `src/auto-reply/reply/agent-runner-execution.ts` — DESIGN-SENSITIVE, highest risk.**
Both sides did major work (asm +504/-26, main +330/-239).
- *Hunk @ `onAgentEvent` (~line 2997):* **main refactored the handler into an IIFE closure** that
  sets up commentary normalization (`commentaryTextByItem`, `lastEmittedCommentaryByItem`),
  message-tool-only delivery tracking (`messageToolOnlyDeliveryToolCallIds`), progress suppression
  after message-tool delivery, and `buildCommandOutputFromToolResultEvent`. **Assembly added a
  `blocked` liveness surfacing block** (`readStringValue(evt.data.livenessState) === "blocked"` →
  `await surfaceBlockedLivenessState()`). → **Take main's IIFE structure as the base and re-insert
  assembly's blocked-liveness block** inside the returned handler. This is the single most delicate
  hunk; main's added logic is part of the message-tool-only / command-output family (see Part C).
- *Hunk @ error classification (~line 3613):* assembly adds
  `isSessionCorruption = /function call turn comes immediately after/i.test(message)` — a
  **provider-replay poisoning symptom guard** (Anthropic rejects malformed tool_use/tool_result
  ordering). Main adds `oauthRefreshFailure` + `hasAuthProfileFailoverFailure` classification, and
  its downstream `providerRequestError` guard references those. → **Union both**; keep assembly's
  `isSessionCorruption` *and* main's OAuth/failover classifiers, preserving each side's downstream
  consumers. (Companion file `src/auto-reply/reply/provider-request-error-classifier.ts` is
  main-only [M] and merges clean; verify the merged guard still references it.)

**3. `src/gateway/server-methods/agent.ts` — mechanical + ordering.**
Assembly adds `sessionContinuationTraceparent = entry?.continuationTraceparent;` (continuation
tracing; 3 uses in assembly, 0 in main). Main adds a `respondDeletedAgentSession({…}) { return; }`
early-return guard (0 in assembly). → **Union;** put **main's deleted-session guard first** (early
return), then assembly's traceparent read. Confirm `respondDeletedAgentSession` import lands from
main's non-conflict region.

**4. `src/agents/embedded-agent-runner/run/attempt.ts` — mechanical union (verified typecheck path).**
Same option-bag gets different fields: assembly adds `continueWorkOpts`, `requestCompactionOpts`,
`drainsContinuationDelegateQueue`; main adds `conversationCapabilityProfile: runtimeCapabilityProfile`.
→ **Union all four.** Assembly's three field *types* live in `run/params.ts:135,137,309` (that file
is [B] both-touched and **auto-merged clean**, so they survive). Main's `conversationCapabilityProfile?:
ResolvedConversationCapabilityProfile` type is at `attempt.ts:740` and `effective-tool-policy.ts:53`
(main-only [M], clean), and `runtimeCapabilityProfile` is defined at `attempt.ts:1249` (non-conflict
region → auto-applied). Union should typecheck once resolved.

**5. `src/infra/heartbeat-runner.ts` — mechanical union (2 hunks).**
Both add distinct fields to the same options type + call site: assembly `parentRunId?` /
`parentRunId: params.parentRunId`; main `runScope?: HeartbeatRunScope` / `runScope: "global"`.
→ **Union both** at type (`~1442`) and call (`~2727`). Ensure `HeartbeatRunScope` type (main) is
present.

**6. `src/infra/diagnostic-events.ts` — mechanical union.**
Both add a new exported type at the same spot: assembly `DiagnosticRunFireReason = "timer" |
"external-trigger" | "continuation-chain"`; main `DiagnosticExecApprovalFollowupSuppressedEvent`.
→ **Keep both.** (`continuation-chain` is an assembly continuation signal — preserve.)

**7. `src/agents/embedded-agent-runner/compact.ts` — mechanical, take main's import line.**
Assembly removed the `generateSecureToken` import (assembly's version uses it 0×); main added
`resolveRuntimeOsLabel` and still uses `generateSecureToken` (1×) and `resolveRuntimeOsLabel` (2×).
Because the merge brings in *main's* code that uses **both** symbols, → **take main's side of this
import hunk** (`resolveRuntimeOsLabel` + `generateSecureToken`). Verify no unused-import lint after.

**8. `test/scripts/lint-suppressions.test.ts` — union then regenerate.**
Both add one entry to a sorted allow-list (assembly `request-compaction-tool.ts|…no-underscore-dangle`;
main `agent-bundle-mcp-runtime.ts|…prefer-add-event-listener`). → **Union, keep sorted, then confirm
the baseline matches actual post-merge suppressions** (regenerate rather than hand-edit to silence).

**9. `scripts/plugin-sdk-surface-report.mjs` — REGENERATE (do not hand-pick).**
The conflicts are *numeric budgets* both sides bumped differently (`infra-runtime` 584→591 asm /
→585 main; `publicExports` 10398→10415 / →10408; `publicDeprecatedExports` 3255→3262 / →3261;
`publicEntrypoints` 322 / →323). → **Run the surface-report generator after merge and set budgets to
real post-merge values.** Picking either side will be wrong.

**10. `src/plugins/status.test.ts` — take main's mock.**
Assembly inlines `isPluginMetadataSnapshotCompatible: () => true`; main uses a configurable
`isPluginMetadataSnapshotCompatibleMock`. → **Take main's** (declare the mock var); confirm no
assembly test relies on the always-true inline.

**11–12. `extensions/mattermost/…client.retry.test.ts` (11 hunks), `extensions/ollama/provider-discovery.test.ts` (3).**
Both sides refactored provider tests; overlap is textual, not semantic (no continuation/no-output
invariant). → **Mechanical**; mattermost is the most tedious (11 hunks) but low-risk. Re-run the two
extension test files after merge.

**Lockfile / package:** `pnpm-lock.yaml` (main +155/-303) and `package.json` (main +24/-14) are
**main-only [M], no conflict**; assembly never touched them. → After merge, run `pnpm install` to
confirm lockfile integrity.

---

## B. Adjacent upstream changes on continuation / session / tool surfaces

Classification legend: **[C]** in conflict set · **[A]** assembly-only (main untouched → clean) ·
**[M]** main-only (adjacent upstream work assembly will adopt) · **[B]** both touched, git
auto-merged (verify no semantic drift).

### B.1 The decisive win: the whole continuation subsystem is assembly-only

`main` **did not touch `src/auto-reply/continuation/**` at all.** Every file there is [A] and
merges clean, including the core:

- `continuation/delegate-dispatch.ts` (+748), `continuation/work-dispatch.ts` (+1238),
  `continuation/work-store.ts` (+863), `continuation/delegate-store.ts` (+739),
  `continuation/state.ts` (+206), `continuation/targeting.ts` (+161),
  `continuation/context-pressure.ts` (+309), `continuation/post-compaction-release.ts` (+125),
  `continuation/signal.ts` (+150), `continuation/scheduler.ts` (+42), `continuation/config.ts`
  (+179) — plus thousands of lines of colocated tests.
- `packages/agent-core/src/agent-loop.ts` [A] (+307) — main untouched → clean.
- `src/infra/session-cost-usage.ts` [A] (+60/-2) — main untouched → clean.
- Assembly-only reply modules: `agent-runner-session-reset.ts`, `no-op-rearm-guard.ts` (+526),
  `post-compaction-delegate-dispatch.ts` (+828), `run-provenance.ts`, `cot-frame.ts`,
  `session-system-events.ts` (+44/-12), `normalize-reply.ts`, and their tests.

**Implication:** the bulk of the assembly continuation feature is in files upstream never edited, so
the merge does not threaten it textually. The only assembly-owned files that collide are the seven
[C] source files in Part A where assembly *threaded into shared structs* that main also edited.

### B.2 Main-only [M] adjacent work assembly will inherit (verify runtime interaction)

| File | main churn | Classification | Interaction to verify |
| --- | --- | --- | --- |
| `embedded-agent-runner/tool-result-truncation.ts` | +71/-17 | **potential superseder** (#98955) | See Part C — fixes blank tool output; assembly's `attempt.ts` callers unchanged. |
| `llm/providers/tool-result-text.ts` (NEW) | +199 | **potential superseder** (#97742) | Cross-provider structured tool-result text preservation. |
| `embedded-agent-runner/tool-result-char-estimator.ts` (NEW) | +37 | adjacent | Feeds truncation sizing; interacts with #98955. |
| `embedded-agent-runner/run/preemptive-compaction.ts` | +32/-1 | **adjacent semantic drift** | Shares the compaction lifecycle with assembly's post-compaction delegate work. Verify compaction ordering. |
| `embedded-agent-runner/result-fallback-classifier.ts` | +10/-4 | adjacent | Result-fallback classification vs assembly's `isSessionCorruption` guard. |
| `embedded-agent-runner/run/llm-idle-timeout.ts` (NEW) | +59 | adjacent | Idle-timeout vs assembly continuation timers. |
| `auto-reply/reply/provider-request-error-classifier.ts` | +4 | adjacent | Referenced by agent-runner-execution.ts conflict #2. |
| `auto-reply/reply/dispatch-from-config.ts` | +88/-32 | probably independent | Reply dispatch. |
| `auto-reply/reply/commands-login.ts` (NEW +252), `commands-steer.ts`, `commands-session.ts`, `commands-acp.ts` | large | probably independent | New/updated reply command surface. |
| `auto-reply/reply/inbound-meta.ts` / `strip-inbound-meta.ts` | +21/-56, +48/-3 | probably independent | Inbound-meta refactor. |
| `embedded-agent-runner/thinking.ts` | +36/-23 | probably independent | Reasoning handling. |
| `embedded-agent-runner/effective-tool-policy.ts` | +35/-70 | adjacent | Hosts `conversationCapabilityProfile` type consumed by `attempt.ts` union. |

### B.3 Both-touched auto-merged [B] — verify no silent semantic drift

These merged without conflict but both sides edited them; skim after merge:

- `auto-reply/reply/agent-runner.ts` — assembly **+998/-157**, main +1/-2. Assembly heavily
  rewrote it; main's 1-line change auto-merged. **Highest-churn auto-merge — verify.**
- `embedded-agent-runner/run/params.ts` — asm +20 / main +11/-6. Holds the `attempt.ts` option
  types; auto-merge is what makes conflict #4 typecheck. **Verify both field sets present.**
- `auto-reply/reply/followup-runner.ts` (asm +311/-3, main +25), `embedded-agent-runner/run.ts`
  (asm +60, main +19/-3), `agent-runner-execution.test.ts` (asm +4, main +198/-4),
  `get-reply-run.ts`, `queue/drain.ts`, `session.test.ts`, `commands-status.test.ts`,
  `run.overflow-compaction.loop.test.ts`, `embedded-agent-subscribe.tools.ts` (asm +1/-1, part of
  #97742's surface).

---

## C. No-output / tool-result poisoning assessment

### C.1 The upstream no-output family

| Ref | Type | State | Summary |
| --- | --- | --- | --- |
| `openclaw/openclaw#98955` | PR | **MERGED** (2026-07-02) | `fix(agents): preserve fresh tool result text under aggregate cap`. Merge commit `d45b8be939`. P1, `merge-risk: session-state`. |
| `openclaw/openclaw#97742` | PR | **MERGED** (2026-07-01) | `fix(llm): preserve structured tool result text across providers`. |
| `openclaw/openclaw#99168` | issue | **CLOSED** | `large tool output can poison subsequent results as (no output)` — the canonical no-output poisoning report. |
| `openclaw/openclaw#98528` | issue | **OPEN** | `Tool output (exec, web_fetch, web_search) returns empty after first call per turn [2026.6.11 regression]`. |
| `openclaw/openclaw#96857` | issue | **OPEN** | `Normal tool text outputs can degrade to "(see attached image)" placeholders`. |

### C.2 Does `origin/main` contain the fix? — YES, and it merges CLEAN

- **#98955 (`d45b8be939`) is an ancestor of `origin/main`** (`git merge-base --is-ancestor` ✔), i.e.
  `d45b8be939 fix(agents): preserve fresh tool result text under aggregate cap (#98955)`.
- **Assembly never touched `embedded-agent-runner/tool-result-truncation.ts`** (asm diff empty vs
  base; main +71/-17). It is **not** in the 12-file conflict set → **the no-output fix merges with
  zero conflict.**
- **#97742's code is in `origin/main` too:** `src/llm/providers/tool-result-text.ts` exists on
  `origin/main`, absent on assembly (introduced/refined by `b63e06f68a fix(llm): preserve structured
  tool result replay`). Assembly's only overlap with #97742's broad provider surface is a trivial
  `embedded-agent-subscribe.tools.ts` +1/-1 that **auto-merged** (not in conflict set).

### C.3 What #98955 actually changes (files/functions)

Files: `embedded-agent-runner/tool-result-truncation.ts` (+71/-17) and its test (+130/-6). Mechanism:

- Adds `AGGREGATE_ELISION_MARKER` — a bounded marker (`"[tool result elided: aggregate tool-result
  budget exceeded; rerun the command if the output is needed]"`) placed **instead of clearing to an
  empty string**.
- Adds `protectTrailingToolResults` + `getTrailingToolResultEntryIds(branch)` so the **freshest
  trailing tool results are protected** from aggregate-cap recovery (spent last, not first).
- Reworks `buildAggregateToolResultReplacements` recovery ordering: older/eligible entries are
  reduced first; protected trailing entries only if still over budget.
- Changes the **file-local** `clearToolResultText(message)` → `clearToolResultText(message,
  maxTextChars = Number.POSITIVE_INFINITY)`, now emitting a bounded marker slice rather than empty.
- `truncateOversizedToolResultsInMessages` passes `protectTrailingToolResults: Boolean(projectionState)`.

**Blast radius is contained:** `clearToolResultText` is unexported/file-local, and the public
`truncateOversizedToolResultsInMessages` signature is unchanged. Assembly's two callers at
`embedded-agent-runner/run/attempt.ts:4231` (prompt projection) and `:4779` (provider prompt
history) are **outside** the attempt.ts conflict region and need no code change — they inherit the
improved behavior automatically.

### C.4 Does it touch replay / truncation / image-text conversion?

- **Truncation:** yes — this *is* the truncation/aggregate-cap path.
- **Provider replay/conversion:** handled by the sibling **#97742** (`tool-result-text.ts` +
  `anthropic/openai/mistral/google/xai` transport-stream + `*-shared.ts` provider converters), also
  already in `origin/main`, also clean vs assembly.
- **Image/text conversion (#96857, "(see attached image)")** remains **OPEN** upstream — not fully
  addressed by #98955/#97742.

### C.5 Conflict with #1156 diagnostics / #1158 continuation-delegate durability?

- **No textual conflict.** #98955/#97742 land in truncation/provider files assembly does not edit.
- **Complementary, not competing:** assembly's `isSessionCorruption`
  (`/function call turn comes immediately after/i`, in `agent-runner-execution.ts`) is a *downstream
  guard* for the malformed tool_use/tool_result ordering that tool-result poisoning produces;
  #98955 attacks the *root cause* (don't blank fresh tool results). Keeping both is correct and is
  exactly what conflict #2's "union" resolution does. There is **no supersession of assembly's guard
  by upstream, nor vice-versa.**
- The one place they *co-locate* is the `agent-runner-execution.ts` `onAgentEvent` hunk, where main's
  message-tool-only / command-output logic (same no-output/message-delivery family) and assembly's
  blocked-liveness surfacing must both survive the hand-merge.

### C.6 Would merging help Cael's blank-output symptom before proofs?

**Likely yes, if Cael's symptom is the #99168 "poison → (no output)" / aggregate-cap variant.**
Merging `origin/main` brings in **both** #98955 (fresh-tool-result preservation + marker) and #97742
(cross-provider structured tool-result replay) with **no conflict and no assembly code change**, and
they flow through assembly's existing `truncateOversizedToolResultsInMessages` call sites.
**Caveat:** #98528 (empty after first call per turn) and #96857 (image-placeholder degradation) are
**still open upstream** — if Cael's blank output is the per-turn-empty or image-placeholder variant,
the merge may not fully resolve it. **Confirm which symptom Cael exhibits before treating the merge
as the fix.**

---

## D. Back-merge risk report (ranked)

### D.1 Files likely to conflict (ranked by risk)

1. **`src/agents/subagent-announce.ts`** — design-sensitive; naive resolution silently reverts the
   NO_REPLY chain-hop/cost-cap fix. Hand-merge required.
2. **`src/auto-reply/reply/agent-runner-execution.ts`** — design-sensitive; main's `onAgentEvent`
   IIFE refactor (message-tool-only/command-output) must absorb assembly's blocked-liveness; error
   classifiers must union (keep `isSessionCorruption`).
3. **`src/gateway/server-methods/agent.ts`** — mechanical + ordering (deleted-session guard before
   continuation traceparent).
4. **`src/agents/embedded-agent-runner/run/attempt.ts`** — mechanical option-bag union (typecheck path verified).
5. **`src/infra/heartbeat-runner.ts`** — mechanical option-bag union (×2).
6. **`src/infra/diagnostic-events.ts`** — mechanical type union.
7. **`src/agents/embedded-agent-runner/compact.ts`** — mechanical (take main's import).
8. **`scripts/plugin-sdk-surface-report.mjs`** — regenerate budgets (do not hand-pick).
9. **`test/scripts/lint-suppressions.test.ts`** — union + regenerate baseline.
10. **`src/plugins/status.test.ts`** — take main's mock.
11. **`extensions/mattermost/…client.retry.test.ts`** — mechanical, 11 hunks (tedious, low-risk).
12. **`extensions/ollama/provider-discovery.test.ts`** — mechanical.

### D.2 Mechanical vs design-sensitive

- **Design-sensitive (2):** #1, #2. Require a human/assembly-aware merge; must not lose assembly
  behavior.
- **Mechanical union / ordering (5):** #3–#7 — union both sides' additions; typecheck.
- **Regenerate / baseline (2):** #8 (surface-report budgets), #9 (lint-suppressions).
- **Test-only mechanical (3):** #10, #11, #12.

### D.3 Upstream changes to preserve (bring in, don't drop)

- #98955 no-output fix (`tool-result-truncation.ts`) — clean.
- #97742 provider structured tool-result replay (`tool-result-text.ts` + provider transports) — clean.
- Main-only adjacent [M]: `tool-result-char-estimator.ts`, `preemptive-compaction.ts`,
  `result-fallback-classifier.ts`, `llm-idle-timeout.ts`, `provider-request-error-classifier.ts`,
  `commands-*`, `effective-tool-policy.ts` (needed by conflict #4), `pnpm-lock.yaml`/`package.json`.

### D.4 Assembly behavior to protect from silent revert

- **NO_REPLY chain-hop/cost-cap fall-through** (`subagent-announce.ts` — conflict #1).
- **`isSessionCorruption` provider-replay guard** (`agent-runner-execution.ts` — conflict #2).
- **blocked-liveness surfacing** (`agent-runner-execution.ts` `onAgentEvent` — conflict #2).
- **continuation traceparent** (`gateway/server-methods/agent.ts` — conflict #3;
  `DiagnosticRunFireReason` `continuation-chain` in `diagnostic-events.ts` — conflict #6).
- **continuation option threading** (`continueWorkOpts` / `requestCompactionOpts` /
  `drainsContinuationDelegateQueue` in `attempt.ts` + `params.ts`; `parentRunId` in
  `heartbeat-runner.ts`).
- **The entire `src/auto-reply/continuation/**` tree + `agent-loop.ts` + `session-cost-usage.ts`**
  (clean, but re-run their tests to catch adjacent-drift breakage from main's compaction/timeout changes).

### D.5 Recommended merge order & post-merge validation

1. Resolve the **10 mechanical/regenerate/test** conflicts first (#3–#12).
2. Resolve the **2 design-sensitive** conflicts (#1, #2) deliberately, favoring assembly semantics
   and folding in main's additions.
3. Regenerate: `scripts/plugin-sdk-surface-report.mjs` budgets; `lint-suppressions` baseline.
4. `pnpm install` (lockfile came from main only).
5. `pnpm build` (module boundaries / dynamic imports changed on main; watch for
   `[INEFFECTIVE_DYNAMIC_IMPORT]`).
6. `pnpm tsgo` / `pnpm check:test-types` (the option-bag unions in #4/#5 and the classifier union in
   #2 are the most likely type breakages).
7. `node scripts/run-vitest.mjs run` the touched + sibling suites (below).
8. `pnpm check:import-cycles` (main added lazy runtime loaders / new files).

Because this is a Codex-style worktree, prefer `node scripts/run-vitest.mjs run --config
test/vitest/vitest.<shard>.config.ts --maxWorkers=1 <path>` for narrow proof and Crabbox/Testbox for
broad gates — do not run local `pnpm test`/`pnpm check` fan-outs here.

### D.6 Exact smoke tests before Cael deploy

- **No-output regression proof (primary for Cael):**
  - `src/agents/embedded-agent-runner/tool-result-truncation.test.ts` (upstream #98955 tests).
  - `src/llm/providers/tool-result-text.test.ts` + provider transport-stream tests
    (`anthropic-transport-stream.test.ts`, `openai-transport-stream.test.ts`,
    `extensions/google/transport-stream.test.ts`, `extensions/xai/stream.test.ts`) for #97742.
  - `src/agents/embedded-agent-runner/run/attempt.ts` prompt/provider-history projection paths
    (any `attempt.*prompt*`/`context-engine` tests) to prove truncation still yields non-empty
    trailing tool output.
- **Assembly continuation durability (protect from revert):**
  - `src/agents/subagent-announce.ts` cost-cap/chain-hop tests + the assembly continuation suite:
    `src/auto-reply/continuation/delegate-dispatch*.test.ts`, `work-dispatch.test.ts`,
    `delegate-store.test.ts`, `post-compaction-*`, `agent-runner.continuation-*` tests.
  - `src/auto-reply/reply/agent-runner-execution.*.test.ts` (blocked-liveness, release-queued-compaction).
- **Shared-struct unions:** `src/infra/heartbeat-runner` tests; `src/gateway/server-methods/agent`
  tests; `embedded-agent-runner/run/params` / `effective-tool-policy` tests.
- **Live proof:** a real gateway agent turn that produces large tool output (exec / web_fetch) across
  ≥2 tool calls in one turn, confirming (a) fresh output is not blanked, and (b) NO_REPLY subagents
  still hit cost-cap/chain-hop accounting. Do this on Crabbox set up like a user before bringing
  Cael + the other princes up.

### D.7 Wait for #1158 fold, or back-merge assembly first?

**Recommendation: back-merge `origin/main` into the assembly base first, then fold/rebase #1158 on
top.** Rationale:

- #1158 (`codeagent/1144-assembly-review-followups`, `6b11562f…`) is a **descendant of the assembly
  base** (its merge-base with assembly *is* assembly HEAD), so it can be replayed after the drift
  merge with minimal extra conflict.
- The two design-sensitive conflicts (#1 subagent-announce, #2 agent-runner-execution) are exactly
  the surfaces #1158 continues to touch (continuation/delegate durability). Doing the drift merge
  first establishes the merged shape of `onAgentEvent`, the error-classifier union, and the NO_REPLY
  fall-through, so #1158 rebases onto a known-good base instead of a moving target.
- Folding #1158 first would force resolving those same design-sensitive hunks **twice** (once for
  #1158's version, once for main's), increasing the chance of silently reverting the NO_REPLY /
  session-corruption / blocked-liveness fixes.
- If #1158 is *near-ready*, an acceptable alternative is: land #1158 into assembly (fast-forward-ish),
  **re-run this forecast** against the updated assembly tip, then back-merge main. Either way, **do
  the design-sensitive resolution once, on whichever tip is final, and re-verify with §D.6.**

---

## Uncertainties / gaps

- `rerere.enabled=true` here: the real merge will still surface all conflicts, but rerere may
  auto-apply once resolved — review its resolutions rather than trusting them blindly.
- Typecheck of the #4/#5 unions is *inferred* from symbol/type locations on each ref (params.ts,
  attempt.ts:740/1249, effective-tool-policy.ts), not from an executed build (read-only lane). Run
  `pnpm tsgo` after resolving to confirm.
- #97742's landing commit in `origin/main` shows as `b63e06f68a "…structured tool result replay"`
  (a refinement/rename of the PR title); the *behavior* (provider tool-result-text preservation) is
  confirmed present by file existence, not by re-reading every provider hunk.
- Cael's exact blank-output variant is unconfirmed. #98955 addresses #99168 (poison→no-output);
  #98528 (per-turn empty) and #96857 (image placeholder) remain open upstream. Match the symptom
  before declaring the merge a fix.
- This report analyzes `origin/main`; `upstream/main` is only 4 (test/refactor) commits ahead and
  does not change the conflict picture.

## Worktree state

Clean. Merge forecast aborted; `HEAD` = `2ed7288ffcdca5cccbd07927f4c028a637ab6fa2`; the only added
file is `output.md`.
