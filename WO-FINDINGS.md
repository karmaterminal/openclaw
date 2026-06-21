# WO-FINDINGS — Feature-preservation audit of back-merge (candidate vs original assembly)

**Reviewer:** independent code-agent (frond-scribe cohort), adversarial feature-clobber audit
**Date:** 2026-06-20
**Verdict:** **Continuation feature FULLY PRESERVED.** All 5 named invariants byte-verified intact.
**1 P0 (must-fix-before-ship)** found — a merge-introduced _syntax error_ in tooling our feature
edited (NOT continuation runtime). 2 P2 (1 codex supersession, 1 pre-existing test-hygiene). 0 P1.

---

## Byte-exact refs (verified)

| role                           | sha          | note                                        |
| ------------------------------ | ------------ | ------------------------------------------- |
| Candidate (ships)              | `bc26669ab5` | HEAD = `83ab022024` + gateway-protocol heal |
| Back-merge commit              | `ca02cd2e61` | parents: `3f3e3f5d6d`, `cbbb466852`         |
| Original assembly (pre-absorb) | `3f3e3f5d6d` | our feature on old base                     |
| merge-base                     | `18aa327655` | last upstream absorbed                      |
| upstream/main absorbed         | `cbbb466852` |                                             |

Method per file (byte-verified, git-diff authoritative): three-way
`git show {3f3e3f5d6d|bc26669ab5|cbbb466852}:<f>` + `git diff 18aa327655 3f3e3f5d6d -- <f>`
(our intent) + `git diff 3f3e3f5d6d bc26669ab5 -- <f>` (merge's net contribution; watch for OUR loss).
Scope: the 55 both-changed files; priority = the 17 continuation-coupled files.

---

## Findings

### 🔴 P0 — F2: merge-introduced syntax error in `scripts/plugin-sdk-surface-report.mjs:172`

**MUST-FIX before ship.** A botched conflict resolution left a **duplicate `),`**, making the
script unparseable. Breaks the script, **4 tests**, and the plugin-SDK surface-budget CI guard.

Provenance — the `publicDeprecatedExports` budget value was a real conflict (both sides changed it):

- original `3f3e3f5d6d` value `3237`, upstream `cbbb466852` value `3245` — **both parse fine**.
- candidate kept upstream `3245` (correct) **but added a second `),`**.

`node --check` proof:

```
orig (3f3e3f5d6d):     OK
upstream (cbbb466852): OK
candidate (bc26669ab5): SyntaxError: Unexpected token ')'  at scripts/plugin-sdk-surface-report.mjs:172
```

Candidate bytes (`git show bc26669ab5:scripts/plugin-sdk-surface-report.mjs`, lines 169-173):

```js
    publicDeprecatedExports: readBudgetEnv(
      "OPENCLAW_PLUGIN_SDK_MAX_PUBLIC_DEPRECATED_EXPORTS",
      3245,
    ),
    ),                       // <-- LINE 172: spurious duplicate — DELETE
    publicWildcardReexports: readBudgetEnv(
```

Original (`3f3e3f5d6d`, valid) has a single `),` and value `3237`.

**Failing tests** (`test/scripts/plugin-sdk-surface-report.test.ts`, all 4 fail because the spawned
script crashes with `SyntaxError` instead of emitting budget messages):

- `rejects loose numeric budget env vars before collecting SDK stats`
- `rejects unsafe budget env vars before collecting SDK stats`
- `accepts exact deprecated export budget overrides by public entrypoint`
- `rejects deprecated export growth by public entrypoint`

**Heal:** delete the duplicate `),` at line 172. (Keep upstream's `3245`.) Tooling-scoped, _not_
continuation runtime — but it breaks the full suite + the CI surface-budget guard, so it blocks ship.

---

### 🟡 P2 — F1: `extensions/codex/src/app-server/thread-lifecycle.ts` codex web-search rotation superseded

Hand-resolved conflict region. Candidate adopted **upstream's** version verbatim
(candidate `:443-475` == upstream `cbbb466852:447-474`), dropping our codex fix
`fb40f3c1d6 "resume legacy app-server bindings on transient web-search turns"` exact semantics.

- **Ours** (`3f3e3f5d6d`): renamed `deferLegacyWebSearchRotationToTransientNativeSurface` →
  `deferLegacyWebSearchRotation`, gated on the **broader** `transientWebSearchRestriction`
  (`isTransientWebSearchRestriction` is also true for `nativeProviderWebSearchSupport === "unknown"`
  and `disableTools`), so a transient web-search turn **resumes** the legacy thread.
- **Candidate/upstream**: keeps old name gated on the **narrower** `params.nativeCodeModeEnabled === false`;
  for non-native-mode transient restrictions the inner branch instead sets `preserveExistingBinding = true`
  and starts a **fresh transient thread** (candidate `:456-468`).

Net: binding-**preservation goal is met by both** (the legacy binding row is not destroyed); the
behavioral delta is "resume existing thread this turn" (ours) vs "start transient + keep binding"
(upstream). Upstream evolved this area deliberately (`da67802baf`, `f1c44e2d6d`, `2ca375fc1a`,
network-proxy/remote-plugin/MCP-rotation), so its version is the more-evolved one and "start transient"
is plausibly the safer behavior on a restricted turn. **Not continuation-core** (#1057/#952 untouched).

**Recommend:** frond-scribe byte-confirm `preserveExistingBinding` satisfies `fb40f3c1d6`'s intent.
If the exact resume-this-turn behavior is must-preserve, re-rank P1 and re-apply our defer condition.

---

### 🟡 P2 — F3: continuation-drain test has a partial `store-load.js` mock (pre-existing, test passes)

`src/agents/subagent-announce.continuation-drain.test.ts` (our-feature-authored, +849) mocks
`../config/sessions/store-load.js` (`:206-207`) exporting only `loadSessionStore`, not
`normalizeSessionStore`. The post-merge drain-persist path resolves `normalizeSessionStore`
(real export at `src/config/sessions/store-load.ts:349`, used `:431`), so the partial mock emits
`[vitest] No "normalizeSessionStore" export…` and the drain logs `[continuation:drain-persist-failed]`.

- **Test still passes 12/12** (it asserts graceful persist-failure handling).
- **Production unaffected** — the real module exports `normalizeSessionStore`.
- The mock block is **byte-identical orig (`3f3e3f5d6d`) vs candidate** → pre-existing in our own
  assembly, **NOT a merge clobber** (merge diff for this file is empty).

**Recommend:** refresh the mock to include `normalizeSessionStore` so the persist path is genuinely
exercised (today it may silently no-op inside the test). Low priority.

---

### ℹ️ Non-findings (suite failures unrelated to feature/merge)

- **N1 `src/infra/exec-authorization-render.test.ts`** — deterministic fail
  `expected "rg -n needle", received "/usr/bin/rg -n needle"`. **Environment artifact** (ripgrep at
  `/usr/bin/rg` on this seat). Test+source **byte-identical to upstream**; untouched by our feature.
- **N2 `extensions/imessage/src/monitor.watch-subscribe-retry.test.ts`** — `retries a transient
watch.subscribe startup timeout` failed once in the full run, **passed 5/5 on isolated rerun** =
  timing flake. **Byte-identical to upstream**; untouched by our feature.

---

## The 5 named invariants — all VERIFIED PRESERVED (byte-cited)

**INV1 — #1057 lane-routing.** `src/auto-reply/continuation/work-dispatch.ts` is **byte-identical**
to original (merge and upstream both never touched it; `git diff 3f3e3f5d6d bc26669ab5 -- <f>` empty).
Wiring intact: `continuationLane = isSubagentSessionKey(work.sessionKey) ? resolveSessionLane(...) : undefined`
(`:253-255`), gate `if (continuationLane === undefined && getQueueSize(MAIN_COMMAND_LANE) > 0)` (`:256`),
`lane: continuationLane` passed to `getReplyFromConfig` (`:285`). Callees `get-reply.ts` and
`embedded-agent-runner/lanes.ts` are also byte-identical to original.

**INV2 — run.ts lane-collision guard.** `src/agents/embedded-agent-runner/run.ts:736-741`:

```js
// #1057: a subagent continuation is routed onto its own session lane, so the
// global lane resolves to that same session lane. ... would self-deadlock; run it directly instead.
if (globalLane === sessionLane) {
  return taskWithCurrentLifecycle();
}
```

Merge to run.ts was **+62/-0** (pure-additive upstream lane-_timeout_-heartbeat work:
`laneTaskAbortController`, progress heartbeat, timeout-release) — zero deletions, never touches the
routing guard. `globalLane` 10/10, `sessionLane` 4/4, `deadlock` 1/1 (orig/cand).

**INV3 — #952 reap-fix (no `parentRunId` for own-turn `continue_work`).** Verified in all three files:

- `attempt-execution.ts:1069-1086` — `scheduleContinuationWorkBatch({ sessionKey, chainState, requests,
config, log })` has **no `parentRunId`**; full #952 comment present; `traceparent` threaded `:1075`.
- `agent-runner.ts:3132-3137` — same `scheduleContinuationWorkBatch` call, no `parentRunId`, matching note.
- `followup-runner.ts` — **byte-identical** to original (untouched by upstream & merge).
  Both big files' merge diffs are pure-upstream in non-overlapping regions; counts identical
  (attempt-execution `parentRunId` 3/3, `scheduleSpawnInitContinueWorkWake` 2/2; agent-runner `continue_work` 6/6).

**INV4 — traceparent / continuationTrigger threading.** Counts identical orig vs candidate across
every continuation/reply file: work-dispatch `traceparent` 3/3 `continuationTrigger` 1/1, get-reply 0/1,
agent-runner 15/0, attempt-execution 9/0, followup-runner 4/0, agent-runner-execution 6/0, types 1/1+2/0,
attempt.ts continuation-opts (`continueWorkOpts`/`requestCompactionOpts`/`drainsContinuationDelegateQueue`)
1/1 each, subagent-announce `continuationTriggerOverride` 4/4 `traceparent` 4/4. Threaded into work
requests at `agent-runner.ts:3096/3114` and `attempt-execution.ts:1075`.

**INV5 — `removeSessionEntry` still called from agent-runner-execution.ts.**
`session-accessor.ts:656` `removeSessionEntry` body is **byte-identical** orig vs candidate (survived the
+847 upstream rewrite of that file). Imported at `agent-runner-execution.ts:79`, called at `:3534`
(corrupted-session reset path); that source file is byte-identical to original.

---

## Coverage summary (55 both-changed files)

**Method layers:** (1) per-file three-way diff; (2) continuation-token survival counts orig-vs-cand;
(3) a trimmed `comm` sweep across all 55 files for any dropped added line; (4) byte-reads of every
invariant locus and every deletion-heavy region; (5) full Vitest suite.

- **17 priority continuation files:** all PRESERVED. The merge's changes to the heavily-merged cores
  (`agent-runner.ts` +38/-21, `attempt-execution.ts` +17/-8, `run.ts` +62/-0, `attempt.ts` +15/-3,
  `heartbeat-runner.ts` +49/-43) land **only in upstream-owned regions our feature never modified**;
  every feature token count is identical.
- **Refactor-relocated additions survived & stayed wired:** `volitional` trigger
  (`session-compaction-checkpoints.ts:143/146`); 4× `continuationChain*: undefined` reset fields in
  `agent-runner-session-reset.ts:84-87` (persisted via new `persistSessionResetLifecycle` which writes
  `nextEntry`); `lastContextPressureBand: undefined` + `fallbackEntry: entry`
  (`session-updates.ts:275/324`); `continue_delegate` leaf-deny rides the surviving role-based resolver
  (`agent-tools.policy.ts`: `SUBAGENT_TOOL_DENY_LEAF` → `resolveSubagentDenyListForRole("leaf")` `:75` →
  exported `resolveSubagentToolPolicyForSession` `:111`; upstream removed only the dead depth-based path).
- **Every merge _deletion_ traced to upstream removing its OWN pre-existing code** (e.g.
  `archiveRemovedSessionTranscripts`, `isSessionTotalTokensFresh`, `resolveSubagentDenyList`,
  `completion_handoff_pending` block) — none were our feature's additions.
- **Explained non-feature changes:** generated baseline `.sha256` (regenerated), budget recalibration
  in surface-report (separate from F2), `agent.ts` heal (local const defs), memory-core test table
  rename `chunks_fts`→`memory_index_chunks_fts`, subagent-registry test `setTestEnvValue` helper adoption.

---

## Validation / exact commands

- Typecheck: PASS (per workorder: `tsgo:core`, `tsgo:core:test`, `tsgo:all` exit 0).
- Full suite: `node scripts/test-projects.mjs` → **82,518 passed / 6 failed / 46 skipped, 89 shards, 552s.**
  - 6 failures = **4× F2** (single merge syntax error, must-fix) + **1× N1** (env: `/usr/bin/rg`) +
    **1× N2** (flaky, passed on rerun). No other failures.
- Single-file proofs (worktree-safe runner):
  `node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast.config.ts --maxWorkers=1 test/scripts/plugin-sdk-surface-report.test.ts`
  `node --check scripts/plugin-sdk-surface-report.mjs`
  `node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 src/agents/subagent-announce.continuation-drain.test.ts` (12/12 pass)
- Both-changed set: `comm -12 <(git diff --name-only 18aa327655 3f3e3f5d6d|sort -u) <(git diff --name-only 18aa327655 cbbb466852|sort -u)`

## Uncertainties

- **F1** rests on a judgment that `preserveExistingBinding` satisfies the codex fix's intent — a human
  with codex app-server context should confirm; if exact resume-this-turn matters, re-rank to P1.
- **N1/N2** are byte-identical to upstream; I did not run a clean upstream checkout to confirm they
  also fail there, but their bytes are upstream's and the causes (env `rg` path / timing) are clear.
- Semantic-orphaning coverage relied on token-count parity + merge-region non-overlap + targeted
  byte-reads; the very large files (`agent-runner.ts`, `attempt-execution.ts`) had their feature
  regions confirmed byte-identical to original (merge changed only non-feature regions), so no rewire
  is possible there.

## Bottom line

The 1361-commit back-merge **preserved the continuation feature intact** — all 5 invariants hold by
byte. The single real defect is **F2 (P0): a one-line duplicate-`),` syntax error** in
`scripts/plugin-sdk-surface-report.mjs` from a botched budget conflict resolution; trivial heal,
but must be fixed before ship (breaks the suite + CI guard).
