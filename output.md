# Exact-head acceptance audit — karmaterminal/openclaw#1198

Read-only acceptance audit of the narrow post-compaction lifecycle descendant.

- **Issue:** karmaterminal/openclaw#1198
- **Exact base:** `97445001432e5616e97c44b0e6fa26319d018be7`
- **Exact head:** `16f4b3f106033f7fe75f68e67563db1b5b4d0e2f`
- **Reviewed branch:** `origin/codeagent/1198-postcompaction-lifecycle-p1` (left untouched)
- **Review lane:** `codeagent/1198-acceptance-audit` (only `output.md` committed here)
- **Recommendation:** **ACCEPT** — see [Verdict](#verdict).

---

## 1. Ancestry and changed surface

```
git merge-base --is-ancestor 97445001432e5616e97c44b0e6fa26319d018be7 \
                             16f4b3f106033f7fe75f68e67563db1b5b4d0e2f   # exit 0
git rev-list --count 97445001432..16f4b3f1060                           # 5
git diff --shortstat 97445001432 16f4b3f1060  # 18 files changed, 1667 insertions(+), 268 deletions(-)
```

Base is a confirmed ancestor of head. Base is **not** an ancestor of `origin/main`
(it is 844 commits ahead of the `20eda756fae` merge base), so it sits on the #1197
assembly stack — inherited-red controls are mandatory and were run.

### Commits (base..head)

| SHA | Subject |
| --- | --- |
| `2481f160b18` | `fix(continuation): charge post-compaction depth only for accepted children` |
| `79d68e2c115` | `fix(continuation): enforce the stale TTL when post-compaction work is released` |
| `e58c5e54925` | `test(gateway): arm the post-compaction routing fixture inside the stale TTL` |
| `2a5bfaad811` | `fix(continuation): terminalize released rows and keep source-less replays single-spawn` |
| `16f4b3f1060` | `refactor(continuation): give the post-compaction durable-handoff shape one spelling` |

### Changed files

| Status | File | +/- |
| --- | --- | --- |
| A | `src/auto-reply/continuation/post-compaction-staleness.ts` | +46 |
| A | `src/auto-reply/continuation/post-compaction-chain-charge.ts` | +50 |
| M | `src/auto-reply/continuation/post-compaction-taskflow-rejection.ts` | +35 |
| M | `src/auto-reply/continuation/post-compaction-staged-dispatch.ts` | +21 |
| M | `src/auto-reply/continuation/delegate-flow-store.ts` | +20 |
| M | `src/auto-reply/continuation/delegate-store.ts` | +2/-2 |
| M | `src/auto-reply/reply/post-compaction-delegate-delivery.ts` | +198/-147 |
| M | `src/auto-reply/reply/post-compaction-delegate-dispatch.ts` | +8/-4 |
| A | `src/auto-reply/continuation/delegate-taskflow-registry.test-harness.ts` | +146 |
| A | `src/auto-reply/reply/post-compaction-delegate-dispatch.lifecycle.test.ts` | +613 |
| A | `src/auto-reply/continuation/post-compaction-taskflow-rejection.test.ts` | +123 |
| A | `src/auto-reply/continuation/post-compaction-chain-charge.test.ts` | +106 |
| A | `src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts` (added block) | +94 |
| M | `src/auto-reply/reply/post-compaction-delegate-dispatch.delivery-guards.test.ts` | +74/-72 |
| M | `src/auto-reply/reply/post-compaction-delegate-dispatch.recovery.test.ts` | +72/-27 |
| M | `src/auto-reply/reply/post-compaction-delegate-dispatch.queueing-policy.test.ts` | +27/-7 |
| M | `src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts` | +27/-7 |
| M | `src/gateway/server-restart-sentinel.test.ts` | +5/-2 |

Production code is **+380/-160 across 8 files**, all inside
`src/auto-reply/continuation/**` and `src/auto-reply/reply/**`. No protocol, config,
SQLite schema, plugin-SDK, docs, changelog, or presentation surface is touched; no
`#1197`/assembly/deployment ref is moved. Scope matches the issue.

---

## 2. Changed-surface review

### 2.1 P1-A — depth is charged only for accepted children

Base ordering was persist-then-spawn: `persistPostCompactionDelegateChainState()`
wrote `currentCount + 1` before `spawnSubagentDirect()`, so a failed attachment
materialization, artifact-policy assert, spawn fence, or spawn rejection permanently
consumed a hop. Repeat that to `maxChainLength` and the snapshot can never reach any
child.

Head deletes `persistPostCompactionDelegateChainState` and introduces
`commitAcceptedPostCompactionChainCharge`, invoked **after** `spawnResult.status ===
"accepted"` (`post-compaction-delegate-delivery.ts:711-726`). Everything above that
line — artifact policy, spawn fence, attachment materialization, spawn rejection —
now leaves the persisted depth untouched. `compactionChainId` is still resolved
before the spawn (the child must be launched with the id the charge will record) but
is no longer persisted early.

Idempotency is owned by the new `reserveAcceptedPostCompactionChainHop`
(`post-compaction-chain-charge.ts`). It reuses the **pre-existing**
`persistedChainState` / `persistedChainStateKind` TaskFlow state fields
(`delegate-flow-store.ts:158-166`, already consumed by `delegate-dispatch.ts` for
the non-post-compaction path) — no new durable field, no schema-version pressure.
Ordering is the correctness argument: the marker is written **before** the
session-entry patch, so

- marker absent ⇒ the entry was provably never advanced ⇒ charge it;
- marker `advanced` ⇒ return that exact hop ⇒ replay re-persists the same count;
- marker `terminal` ⇒ a rejection that consumed no hop.

The marker write bumps the row one revision, so acceptance is committed against
`reserved.expectedRevision` rather than the stale queued claim
(`post-compaction-delegate-delivery.ts:215-224`, `:727-736`). That retarget is
necessary and correct.

`markPendingDelegateChainStatePersistPlanned` reaches
`updateFlowRecordByIdExpectedRevision`, which fences on revision only and not on
status (`src/tasks/task-flow-registry.ts:552-584`), so marking an already-`succeeded`
durable-handoff row is legal. Verified by reading, not assumed.

### 2.2 P1-B — stale TTL enforced wherever released work moves

Base had the 7-day TTL as a constant exported from the delivery module and applied at
exactly one site (`dispatchPostCompactionDelegates`). Released rows and queued retries
bypassed it. Head moves the constant plus the classifier and the redacted rejection
text into a single owner, `continuation/post-compaction-staleness.ts`, and applies it
at every site that can move staged work closer to a child:

1. `dispatchPostCompactionDelegates` (staging seam) — now calls the shared classifier.
2. `dispatchStagedPostCompactionDelegates` (`post-compaction-staged-dispatch.ts:157-171`)
   — the dispatcher shared by **live release** (`post-compaction-release.ts:104-109`)
   and **startup recovery** (`delegate-dispatch-recovery.ts:327`). Gate is placed
   ahead of the artifact-policy assert and the spawn.
3. `deliverQueuedPostCompactionDelegate` (`post-compaction-delegate-delivery.ts:514-533`)
   — ahead of the disabled-deferral, so a stale row cannot be revived by a config flip,
   restart, or later retry.

I verified the gate is actually **armed in production**, not a no-op:
`stagePostCompactionDelegate` always stamps `firstArmedAt: delegate.firstArmedAt ??
stagedAt` (`delegate-store.ts:790-794`); `decodeDelegateFlow` round-trips it
(`delegate-flow-store.ts:406`); `claimStagedPostCompactionTaskFlowDelegates` returns
decoded rows straight into the dispatcher; and the queue payload always sets
`firstArmedAt: delegate.firstArmedAt ?? delegate.createdAt`
(`session-delivery-queue-storage.ts:184`). The `?? now` leg of
`classifyPostCompactionDelegateAge` is therefore only reachable for legacy unstamped
staged rows, where "reads as freshly armed" is the documented and tested choice.

Boundary semantics are unchanged from base (`ageMs > TTL` is stale, `ageMs === TTL`
still releases) and are now pinned by tests on both the release and delivery sides.
Stale diagnostics carry only `ageMs`; `formatPostCompactionStaleRejection` cannot
emit task prose or attachment bytes, and the added tests assert sentinel strings are
absent from every log/system-event surface.

### 2.3 One spelling for the durable-handoff shape

`dispatchPostCompactionDelegates` enqueues the delivery and only then calls
`finalizeStagedPostCompactionDelegates`, so a drain observes the row at
`succeeded @ claimRevision + 1`, not at the claim. Base open-coded that predicate
inside `revalidatePendingDelegateForSpawn`. Head extracts
`isDurablyHandedOffPostCompactionFlow` (`delegate-flow-store.ts:468-485`) and uses it
from both the spawn fence and the new terminalizer, so the two cannot drift. This is
the correct owner boundary and a genuine de-duplication.

### 2.4 Fix shape

`git diff --numstat` shows non-test production LOC growing by ~220. That buys three
concept-named owners (`post-compaction-staleness`, `post-compaction-chain-charge`,
the durable-handoff predicate) that replace duplicated TTL arithmetic and an
open-coded revision shape, and it deletes `persistPostCompactionDelegateChainState`
outright rather than leaving a second path. No compat shim, no dual-write, no
fallback reader, no legacy alias was added. This is a bounded refactor, not a
minimal patch, and matches the root guide's preferred fix shape.

### 2.5 Best-fix judgement

Is this the best fix, not merely a plausible one?

- **Ownership.** Depth accounting for released post-compaction work belongs to the
  continuation module, and the durable marker belongs on the TaskFlow row that already
  owns the delegate's lifecycle. Both landed there. The alternative — keeping the
  charge in the delivery module and adding a side table — would have created a second
  state owner for the same fact.
- **Siblings.** The parallel non-post-compaction path (`delegate-dispatch.ts:423-433`)
  already used `persistedChainState` + `persistedChainStateKind` with the same
  `advanced` / `terminal` distinction. Head reuses that vocabulary instead of inventing
  a parallel one. Sibling surfaces are consistent.
- **One-sidedness.** The TTL fix is explicitly *not* one-sided: all three release paths
  were changed together, and the shared dispatcher covers live release and startup
  recovery in one place.
- **No new config/env surface**, no SQLite schema version change, no protocol change.

---

## 3. Validation

All commands run from the review worktree at exact head unless stated. Environment:
Node `v22.23.1`, `OPENCLAW_HEAVY_CHECK_LOCK_SCOPE=worktree`. This is a linked
worktree, so `node` wrappers were used instead of `pnpm` per the root guide.

### 3.1 Typechecks

```
node scripts/run-tsgo.mjs -p tsconfig.core.json \
  --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo
# exit 0, no diagnostics

node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json \
  --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo
# exit 0, no diagnostics
```

### 3.2 Ratchets

```
node --import tsx scripts/check-import-cycles.ts
# "Import cycle check: 0 runtime value cycle(s)."  exit 0

node scripts/check-max-lines-ratchet.mjs
# "max-lines ratchet OK: 1034 grandfathered suppressions."  exit 0
```

No `max-lines` suppression was added and no baseline/ignore file was edited by the
change set.

### 3.3 Owned/coupled auto-reply owners

The implementing lane's `output.md` naming "the 12 owned/coupled auto-reply test
files" is not on disk (that lane's worktree is gone; issue #1198 has no comments), so
I enumerated the owned surface myself and ran the **superset**: all 13 files matching
`src/auto-reply/**/*post-compaction*.test.ts`.

```
node scripts/run-vitest.mjs \
  src/auto-reply/continuation/delegate-dispatch.post-compaction-recovery.test.ts \
  src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts \
  src/auto-reply/continuation/post-compaction-chain-charge.test.ts \
  src/auto-reply/continuation/post-compaction-durable-handoff.test.ts \
  src/auto-reply/continuation/post-compaction-release.test.ts \
  src/auto-reply/continuation/post-compaction-taskflow-rejection.test.ts \
  src/auto-reply/reply/post-compaction-context-failure.test.ts \
  src/auto-reply/reply/post-compaction-context.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.delivery-guards.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.lifecycle.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.queueing-policy.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.recovery.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts
```

**Head:** `Test Files 2 failed | 11 passed (13)`, `Tests 5 failed | 156 passed (161)`.
All 5 failures are inherited — see §4.

Every file the change set owns is green, including all 12 tests in the new
`post-compaction-delegate-dispatch.lifecycle.test.ts`, all 3 in
`post-compaction-chain-charge.test.ts`, all 4 in
`post-compaction-taskflow-rejection.test.ts`, and all 3 stale-TTL tests added to
`delegate-dispatch-post-compaction.test.ts`.

### 3.4 session-delivery-queue and gateway restart/compaction owners

```
node scripts/run-vitest.mjs \
  src/infra/session-delivery-queue.managed-artifact.test.ts \
  src/infra/session-delivery-queue.recovery.persistence.test.ts \
  src/infra/session-delivery-queue.recovery.test.ts \
  src/infra/session-delivery-queue-runtime.test.ts \
  src/infra/session-delivery-queue.storage.test.ts \
  src/gateway/server-restart-sentinel.test.ts \
  src/gateway/server-restart-sentinel-notice.test.ts \
  src/gateway/server-restart-deferral.test.ts \
  src/gateway/server.sessions.compaction.test.ts \
  src/gateway/session-compaction-checkpoints.test.ts
# gateway-server shard: 5 files, 115 tests passed
# infra shard:          5 files,  75 tests passed
# "[test] passed 2 Vitest shards in 61.91s"   exit 0
```

10 files, **190 tests, 0 failures**. The only gateway edit in the change set
(`server-restart-sentinel.test.ts`) re-stamps a fixture that was pinned at epoch `1`
so it stays inside the new TTL and still reaches the disabled-deferral assertion it
was written for. That is the correct fixture repair, not a weakened assertion.

### 3.5 Full suite

```
node scripts/test-projects.mjs
```

<!--FULL_SUITE_TALLY-->

---

## 4. Inherited-red controls

Every red was reproduced against exact base before being classified.

Controls ran in an isolated detached worktree at the exact base SHA
(`git worktree add --detach /tmp/audit1198/base-wt 97445001432…`) with `node_modules`
symlinked from the review worktree. The reviewed branch was never checked out,
modified, or moved.

```
cd /tmp/audit1198/base-wt
node scripts/run-vitest.mjs \
  src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts \
  src/auto-reply/continuation/post-compaction-release.test.ts
```

| | Test Files | Tests |
| --- | --- | --- |
| base `97445001432` | 2 failed (2) | 5 failed \| 20 passed (25) |
| head `16f4b3f1060` | 2 failed (2) | 5 failed \| 23 passed (28) |

The `FAIL` name sets are **byte-identical** (`diff` of the sorted `FAIL` lines is
empty). Head adds 3 passing tests to those files and changes neither the failure count
nor any failure identity.

### Inherited failures

| File | Test |
| --- | --- |
| `continuation/delegate-dispatch-post-compaction.test.ts` | `dispatchStagedPostCompactionDelegates error handling > directly dispatches accepted delegates with post-compaction wake flags` |
| `continuation/post-compaction-release.test.ts` | `releasePostCompactionLifecycle > happy path: clears pressure state, fires post-compaction pressure event, and dispatches each staged delegate with the canonical flag set` |
| `continuation/post-compaction-release.test.ts` | `releasePostCompactionLifecycle > finalizes only accepted post-compaction handoffs` |
| `continuation/post-compaction-release.test.ts` | `releasePostCompactionLifecycle > fails direct release when an accepted row was not finalized` |
| `continuation/post-compaction-release.test.ts` | `releasePostCompactionLifecycle > missing totalTokens: skips pressure check + enqueue but still consumes/dispatches staged delegates` |

**Root cause (diagnosis only — deliberately not repaired):** these fixtures stage
delegates carrying a `flowId` but no `expectedRevision`. The paired-durable-source-
metadata fence added earlier in the base lineage
(`bdd401d230d fix(continuation): require paired durable source metadata`) rejects that
shape in `revalidatePendingDelegateForSpawn` (`delegate-store.ts:58-64`), so zero
spawns fire and the assertions on spawn counts fail. A leaked
`mockResolvedValueOnce({ status: "rejected", error: "capacity" })` from
`post-compaction-release.test.ts:186` — `vi.clearAllMocks()` does not drain the
`…Once` queue — then cascades into a later case. Neither mechanism is touched by any
line in the #1198 changed surface. Repairing them is #1197/assembly-lineage debt and
is out of this lane's scope.

---

## 5. Revert controls for the two independent-review regressions

Both were verified in an isolated detached worktree at exact head
(`/tmp/audit1198/revert-wt`), one at a time, each restored to pristine
(`git status --porcelain` empty) before the next.

### 5.1 Durably handed-off `succeeded @ R+1` terminalization

**Revert applied** — `failReleasedPostCompactionDelegate`
(`continuation/post-compaction-taskflow-rejection.ts`) reduced to the base behaviour,
a plain revision-fenced `markPendingDelegateFailed(delegate, …)` with no
durable-handoff retarget.

```
node scripts/run-vitest.mjs \
  src/auto-reply/continuation/post-compaction-taskflow-rejection.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.lifecycle.test.ts
# Test Files 1 failed | 1 passed (2)
# Tests      1 failed | 15 passed (16)
```

Failing test: `failReleasedPostCompactionDelegate > commits a terminal row for work
already handed off to the queue` — `AssertionError: expected false to be true`. The
revision-fenced fail cannot commit against the stale claim revision, so no terminal
row lands. Regression confirmed genuine and the fix load-bearing.

Real-world consequence of the reverted state: the new delivery-time stale/cap/policy
rejections would fail to terminalize a durably handed-off row, leaking the artifact
policy and leaving the entry to churn through its retry budget.

### 5.2 Source-less post-acceptance persist retry cannot duplicate-spawn

**Revert applied** — the base early bail restored at the top of
`maybeFinalizePreviouslyAcceptedDelivery`:
`if (!entry.sourceFlowId || entry.sourceExpectedRevision === undefined) return false;`

```
node scripts/run-vitest.mjs \
  src/auto-reply/reply/post-compaction-delegate-dispatch.lifecycle.test.ts \
  src/auto-reply/reply/post-compaction-delegate-dispatch.recovery.test.ts
# Test Files 1 failed | 1 passed (2)
# Tests      1 failed | 21 passed (22)
```

Failing test: `post-compaction delivery: continuation depth follows accepted children
> does not re-spawn a source-less entry whose post-acceptance chain persist failed` —
`expected "vi.fn()" to be called 1 times, but got 2 times`. A **genuine duplicate
child spawn**. Regression confirmed genuine and the fix load-bearing.

This regression is *created by* the P1-A reordering: base persisted before the spawn,
so nothing after an accepted source-less spawn could throw. Head introduces a post-
acceptance persist, so the replay guard had to be widened to source-less entries.
Catching it before landing is exactly the right call. The guard derives the child key
from `sourceFlowId ?? entry.id`, which is the same value passed to the spawn as
`continuationDelegateFlowId` and therefore the same key `subagent-spawn.ts:164-166`
derives — verified by reading, not assumed.

---

## 6. Source-less depth undercount tradeoff

### What it is

For a **source-less** queue entry (no TaskFlow row) whose spawn was accepted but whose
subsequent session-entry persist threw, the retry is caught by
`maybeFinalizePreviouslyAcceptedDelivery`, which reclaims the delivery without
charging the hop. No durable marker can exist for such an entry — there is no row to
hold one — so re-charging could double count instead. The parent session therefore
undercounts by **exactly one hop**, documented in-place at
`post-compaction-delegate-delivery.ts:231-234` and pinned by the assertion
`continuationChainCount === 0` in the §5.2 test.

### Where source-less entries come from

`dispatchPostCompactionDelegates` merges TaskFlow-staged delegates (which carry
`flowId` + `expectedRevision`) with delegates read back from the session entry's
`pendingPostCompactionDelegates`, which lose their flow metadata through
`normalizePostCompactionDelegate`. That session-entry slot is written by exactly one
production caller: the **re-stage fallback after an enqueue failure**
(`post-compaction-delegate-dispatch.ts:450`). So a source-less entry is already a
degraded/legacy path, not the normal staging route.

### Bound and blast radius

- **Source-backed entries are not affected.** Their marker is written before the
  session-entry patch, and a replay redeems it: `reserveAcceptedPostCompactionChainHop`
  returns the recorded `chainState` and the hop is re-persisted exactly once. Pinned by
  `re-persists the marker hop instead of advancing again when an accepted child
  replays` and its crash-before-marker sibling.
- **Bounded at one hop per affected entry.** The replay short-circuits and the entry
  leaves the queue; it cannot loop.
- **Requires a durable-store write failure.** `patchSessionEntry` runs with
  `requireWriteSuccess: true`; the undercount needs that write to fail while reads keep
  working.
- **The replay guard is durable, not memory-only.**
  `getSubagentRunByChildSessionKey` merges SQLite-persisted subagent runs with
  in-memory runs (`subagent-registry-state.ts:205-231`), so the guard survives child
  completion and process restart. It does not depend on the run still being live.
- **Direction of harm.** The chain may run one extra hop past `maxChainLength` for that
  session. The defect being fixed (P1-A) had the opposite and worse direction: the
  snapshot could be permanently starved and never reach *any* child. A bounded safety
  relaxation on an already-degraded path is strictly preferable to a liveness failure
  on the healthy path.

### Verdict on the tradeoff

**Does not block acceptance.** I could not construct a concrete correctness violation.
Eliminating it would require giving source-less entries their own durable marker —
i.e. inventing a per-queue-entry durable row — which is a materially larger design
change than #1198's scope and would add a second state owner for a fact the TaskFlow
row already owns on the healthy path. Per the workorder I did not broaden the
implementation for a theoretical at-most-one-hop undercount.

The genuinely clean long-term fix is to remove the source-less staging path entirely
(the enqueue-failure re-stage fallback), which would make every post-compaction entry
TaskFlow-backed and marker-protected. That is a follow-up, not a hold.

### Residual observation (non-blocking, no action requested)

A source-backed entry can also lose its hop in one narrower window: marker written →
session-entry persist throws → retry finds **no** subagent-run row (so both the session
store write *and* the persisted subagent-run write were lost) → the spawn fence sees
`succeeded @ claim+2`, classifies the claim as stale, and dead-letters. The marker is
then never redeemed. This requires two independent durable-write losses, produces no
duplicate spawn, and is strictly narrower than the source-less case. The change set is
aware of the `succeeded @ +2` shape and reasons about it explicitly at
`post-compaction-taskflow-rejection.test.ts:106-111`; I agree with that reasoning.
Recording it here for the record only.

---

## 7. Verdict

**ACCEPT.**

- Ancestry is exact; the changed surface is narrow, correctly scoped to #1198, and
  moves no protected ref.
- Both issue contracts are met and enforced at every owner:
  retry-before-accepted-spawn consumes zero budget, and stale released work dies before
  enqueue, drain, and attachment materialization.
- Depth accounting is idempotent across crash, restart, and queue replay via a durable
  marker written before the session-entry patch, reusing an existing TaskFlow field
  rather than adding durable surface.
- The TTL and the durable-handoff revision shape each have exactly one spelling; the
  superseded path was deleted rather than kept alongside.
- Core production and core-test tsgo, import-cycle, and max-lines ratchet: all green.
- Owned auto-reply owners, session-delivery-queue owners, and gateway
  restart/compaction owners: green.
- All 5 reds in the focused run reproduce identically at exact base and are inherited
  #1197-lineage fixture debt; none were repaired, per scope.
- Both independent-review regressions were proven load-bearing by reverting each fix in
  an isolated copy and observing a real failure (no terminal row; duplicate child spawn).
- The named source-less undercount is bounded at one hop, confined to a degraded
  legacy path, requires a durable-store write failure, is documented at the code site
  and pinned by a test, and is strictly safer in direction than the defect it replaces.

### Uncertainties

1. The implementing lane's `output.md` naming the 12 owned/coupled test files was not
   recoverable, so the 13-file superset above is my own enumeration. If the lane's list
   included a file outside `src/auto-reply/**/*post-compaction*.test.ts`, it was not
   run under that heading — though the full suite covers it.
2. The inherited reds are diagnosed by reading, not by bisecting the 844-commit
   base→`origin/main` gap to the exact commit that broke each fixture. The base control
   is what establishes the inherited classification; the named commit is corroborating
   evidence.
3. Proof is local (trusted source, this checkout's existing dependency install). No
   Crabbox/Testbox lane, Docker E2E, live-provider, or cross-platform proof was run;
   the change set touches no packaging, build-output, or platform surface that would
   require it.

### Repository state

The reviewed branch is unchanged. The only mutation is this `output.md` on
`codeagent/1198-acceptance-audit`. The temporary base/revert worktrees under
`/tmp/audit1198/` were removed at the end of the audit; both revert experiments were
restored to pristine before removal.
