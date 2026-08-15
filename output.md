# RED fossil: pre-adoption ingress abandonment bypasses the retry budget

- **Bound issue:** [karmaterminal/openclaw#1254](https://github.com/karmaterminal/openclaw/issues/1254) (Project 87)
- **Lane:** `silas-abandonment-red-fossil` — TEST/PROOF ONLY
- **Base:** deployed composite `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
- **Branch:** `codeagent/silas-abandonment-red-fossil`
- **Evidence source:** causal report commit `cfbb29bfd3e751e718fda44649b690268621f13f`
- **No PR opened. No production code changed. No fleet state, database, config, continuation ref, Discord traffic, or GitHub issue/PR touched.**

## What landed

| File | Purpose |
| ---- | ------- |
| `src/channels/message/ingress-drain.abandonment-retry-budget.test.ts` | The fossil: 1 RED contract test + 4 GREEN negative controls, driven through the real production queue and drain. |
| `causal-proof/silas-abandonment-fossil/proof-spec.json` | Fossil causal spec. Every fossil edge is `CHARACTERIZES`, never `PROVES`. |
| `causal-proof/silas-abandonment-fossil/graph/{nodes,edges}.csv`, `graph/{manifest,proof}.json` | Derived graph exports (23 nodes, 21 edges, 7 layers). |
| `causal-proof/silas-abandonment-fossil/gitnexus-relations.json` | The disposition asymmetry from GitNexus with recorded index staleness. |
| `causal-proof/silas-abandonment-fossil/history-matrix.json` | Machine-readable cross-revision behavioral matrix. |

## The contract the fossil states

At `6b09` the ingress drain has two pre-adoption settle paths and only one of them is bounded:

```text
onFailed(error)        -> applyFailureDisposition -> resolveIngressFailureDisposition
                                                     -> fail(retry-limit-exceeded)  [bounded]
                                                     -> release(lastError)          [retry]

onAbandoned()          -> releaseUnadopted        -> releaseClaim                    [always]
onCancelled()          -> releaseUnadopted        -> releaseClaim(recordAttempt:false) [budget-free by design]
```

`resolveIngressFailureDisposition` is the **only** producer of `retry-limit-exceeded`
(`src/channels/message/ingress-retry-policy.ts:115`). `onAbandoned` has no path to it, so
`maxAttempts` is unreachable for a claim that is repeatedly abandoned before adoption.
`queue.release` still increments `attempts` (`src/channels/message/ingress-queue.ts:1146`),
so the counter climbs forever against a ceiling nothing checks, backoff saturates at
`DEFAULT_INGRESS_RETRY_MAX_MS = 180000`, and the row keeps the head of its FIFO lane.

The fossil asserts the desired contract:

1. A pre-adoption abandoned claim consumes the bounded retry budget.
2. With `deadLetterMinAgeMs=0`, the eighth abandonment terminalizes through the existing
   `retry-limit-exceeded` failure disposition instead of releasing again.
3. The terminal outcome is operator-visible and payload-retaining per the existing
   dead-letter contract (`listFailed` returns the row with its original payload).
4. A subsequent row in the same lane makes progress — no poison-head starvation.
5. Cancellation stays budget-free.
6. The session-lifecycle producer keeps a separate reason identity: the terminal record
   retains `turn-abandoned`, distinct from an ordinary thrown-failure message.

## Exact RED receipts

Command (sanctioned runner, from the repo root at `6b09`):

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.abandonment-retry-budget.test.ts
```

```text
× terminalizes a repeatedly abandoned pre-adoption claim at the attempt ceiling 156ms
✓ keeps an abandoned claim retryable below the attempt ceiling 63ms
✓ leaves cancellation budget-free even at the attempt ceiling 63ms
✓ keeps an unrelated lane draining while one lane head is abandoned 59ms
✓ still dead-letters an ordinary thrown dispatch failure on its bounded path 66ms

Test Files  1 failed (1)
     Tests  1 failed | 4 passed (5)
```

The failing assertion, verbatim:

```text
AssertionError: expected [] to deeply equal [ ObjectContaining{…} ]

- [
-   ObjectContaining {
-     "attempts": 7,
-     "id": "source-message-head",
-     "laneKey": "guild/channel/silas",
-     "message": "turn-abandoned",
-     "payload": { "text": "session changed while starting work" },
-     "reason": "retry-limit-exceeded",
-   },
- ]
+ []

❯ src/channels/message/ingress-drain.abandonment-retry-budget.test.ts:110:58
```

`[]` is the whole defect: after eight abandonments with the exact Discord production policy
(`maxAttempts: 8, deadLetterMinAgeMs: 0`, `extensions/discord/src/monitor/ingress.ts:552-555`),
the dead-letter table is empty and the row is pending for a ninth attempt.

### Fossil shape

Real-shaped, not mocked. It uses the production `createChannelIngressQueue` over a temp
`OPENCLAW_STATE_DIR` (SQLite) and the production `createChannelIngressDrain`. One long-lived
drain instance runs eight `drainOnce()` passes against one enqueued row. Dispatch calls
`lifecycle.onDeferred()` then `await lifecycle.onAbandoned()` — the exact callback
`completeFollowupRunLifecycle` invokes for an un-admitted turn
(`src/auto-reply/reply/queue/types.ts:331`).

Time is controlled by an injected clock shared by queue and drain, advanced by
`DEFAULT_INGRESS_RETRY_MAX_MS + 1000` between passes. The real backoff policy stays enabled;
the clock simply moves past the capped delay, so the retry policy is exercised rather than
neutered by `baseMs: 0`.

`expect(abandonedAttempts).toEqual([0,1,2,3,4,5,6,7])` proves the same row re-entered the
exact `onAbandoned` path once per attempt with a monotonically climbing consumed budget.

The `attempts: 7` expectation is the existing dead-letter contract, not a new one:
`queue.fail` never increments, so a terminal record retains the claim-time count. This is
already proven green by `src/channels/message/ingress-drain.cancellation.test.ts`, which
asserts `attempts: 1` when `maxAttempts: 2`.

### Negative controls (all GREEN at `6b09`, must stay green after the repair)

| Control | Bounds the repair against |
| ------- | ------------------------- |
| `keeps an abandoned claim retryable below the attempt ceiling` | Dead-lettering early. Seven abandonments must remain pending with `attempts: 7`, `lastError: turn-abandoned`, and no failed rows. |
| `leaves cancellation budget-free even at the attempt ceiling` | Routing cancellation through the budget. Seeded at the ceiling, three `onCancelled` passes must not change attempts and must not dead-letter. |
| `keeps an unrelated lane draining while one lane head is abandoned` | Collateral lane damage. The neighbouring lane completes on its first pass and is never released or failed. |
| `still dead-letters an ordinary thrown dispatch failure on its bounded path` | Collapsing producer identity. The thrown-failure dead letter must carry `message: "dispatch exploded"`, distinct from `turn-abandoned`. |

## History matrix

Fossil bytes were **identical at every runnable revision** — no import was rewritten and no
assertion was weakened to obtain a result.

| Revision | Role | Runnable | Tally | Primary | Classification |
| -------- | ---- | -------- | ----- | ------- | -------------- |
| `6b09b1dbe93` | deployed composite | yes | 1 failed \| 4 passed | **RED** | intended RED |
| `530b33e4e37` | absorbed upstream base | yes | 1 failed \| 4 passed | **RED** | identical; not fork-introduced |
| `ab5b8b9a02c` | current upstream context | yes | 1 failed \| 4 passed | **RED** | still live upstream today |
| `ac110917e13` (`06600e2ca09^`) | just before the Discord retry/cancellation fix | yes | 2 failed \| 3 passed | **RED** | primary RED identical; cancellation control failed with `expected cancel callback to be defined` because `lifecycle.onCancelled` did not exist yet — structural absence, not a behavioral regression |
| `16c14e5bbfc9` | turn-adoption seam introduction, [openclaw/openclaw#108924](https://github.com/openclaw/openclaw/pull/108924) | **no** | — | **RED by source** | `queue.listFailed` and `ingress-drain.test-helpers.ts` did not exist. Running it would have required replacing the terminal-outcome assertion, which is forbidden. |

**Verdict: born broken, never a regression, not fork-introduced.**

At `16c14e5bbfc9` `onAbandoned` already called `releaseClaim(state.claim, "turn-abandoned")`
inside `settleOnce` with no disposition check, while `applyFailureDisposition ->
resolveIngressFailureDisposition` existed at line 401 of that same file. All three archaeology
commits (`16c14e5bbfc9`, `69983f80113`, `06600e2ca09`) are ancestors of `530b33e`, `ab5b8b9`
**and** `6b09`, so this is an upstream-owned defect that the fork inherited.

`69983f80113` ([#122384](https://github.com/openclaw/openclaw/pull/122384)) is why the incident
looks like a retry storm rather than a stranded claim: it made pre-adoption failures hand back
to durable ingress. It correctly removed the stranding without adding the missing bound.

Cross-revision runs used detached git worktrees with `node_modules` symlinked from the `6b09`
checkout. Workspace packages resolve through tsconfig paths / the vitest alias at `./packages`,
so each worktree used its own workspace sources; `packages/normalization-core` and
`packages/retry` are byte-identical across all three revisions, so the symlink cannot have
changed behavior. All temporary worktrees were removed.

## Owner boundary

| Concern | Owner |
| ------- | ----- |
| Unbounded pre-adoption abandonment | `src/channels/message/ingress-drain.ts:504-506` (`onAbandoned`) with `releaseUnadopted` at `421-438` |
| Sole retry-limit enforcement | `src/channels/message/ingress-retry-policy.ts:92-121` (`resolveIngressFailureDisposition`) |
| Bounded sibling path already correct | `src/channels/message/ingress-drain.ts:487-498` (`onFailed`) -> `applyFailureDisposition` at `325-354` |
| Policy that makes the ceiling the only bound | `extensions/discord/src/monitor/ingress.ts:552-555` (`deadLetterMinAgeMs: 0`) |
| Abandonment producer | `src/auto-reply/reply/queue/types.ts:313-336` (`completeFollowupRunLifecycle`) |
| Attempt accounting | `src/channels/message/ingress-queue.ts:1146` (`release` increments) |

The repair belongs in the drain, not in the producer and not in Discord. The producer is
correctly reporting "this turn ended without ever owning the reply lane"; the drain is the
component that owns retry disposition and is failing to apply its own policy to one of its two
pre-adoption settle paths. The channel-specific config is correct — `deadLetterMinAgeMs: 0`
simply removes the age floor and exposes that the attempt ceiling was never wired.

## Blocker the next lane inherits (design fork, needs a maintainer call)

A pre-existing test **explicitly codifies the unbounded behavior**:

`src/channels/message/ingress-drain.test.ts:676-707`
— *"keeps retry-accounted abandonment pending beyond the failure threshold"*

With `retryPolicy: { maxAttempts: 1, deadLetterMinAgeMs: 0, baseMs: 0, maxMs: 0 }` it drives
three abandonments and asserts the row is still pending with `attempts: 3` and
`listFailed?()` returns `[]`.

- Introduced by `06600e2ca09` *"fix(discord): unblock ingress after retry exhaustion"*
  (joshavant, 2026-08-12) — the same commit that added `onCancelled` and refactored the
  unconditional release into `releaseUnadopted`.
- It is **upstream-owned**, not a fork artifact.
- Its name (*"beyond the failure threshold"*) shows the author knew attempts passed
  `maxAttempts` and asserted `pending` anyway.
- It carries **no comment naming a contract, invariant, or reason**.

Per root `AGENTS.md` — *"Tests alone do not make internals contracts. If compat stays, name the
contract and migration/removal plan in code, test, or PR."* — this reads as a characterization
of the shape at the time rather than a stated invariant. But it is a real design signal and the
repair is therefore **not purely additive**: the fix lane must delete or retarget that
expectation, and that is a maintainer product decision, not a silent test edit. This lane did
not touch it.

## Proposed minimal intervention (NOT applied; proven reachable then reverted)

Route abandonment through the same bounded disposition `onFailed` already uses. In
`src/channels/message/ingress-drain.ts`, generalize `releaseUnadopted` into a settle-shaped
helper so both pre-adoption exits keep their guard/ordering semantics and only the terminal
action differs:

```ts
const settleUnadopted = async (
  state: ActiveHandlerState<TPayload, TMetadata>,
  settle: (claim: ChannelIngressQueueClaim<TPayload, TMetadata>) => Promise<void>,
) => {
  if (state.phase !== "deferred" && state.phase !== "dispatching") return;
  if (state.guillotined || state.superseded) return;
  clearStallTimer(state);
  await state.settleOnce(async () => { await settle(state.claim); }).catch(() => undefined);
};

onCancelled: async () => {
  // Cancellation means ownership ended before delivery, so preserve every
  // prior retry fact while reopening the canonical row for replacement.
  await settleUnadopted(state, (claim) => releaseClaim(claim, { recordAttempt: false }));
},
onAbandoned: async () => {
  // A turn that ended without ever owning the reply lane is a real failed
  // attempt: it must consume the same bounded budget as onFailed, or an
  // unadoptable row retries forever and starves the head of its lane.
  await settleUnadopted(state, (claim) =>
    applyFailureDisposition(claim, new Error("turn-abandoned")),
  );
},
```

Production LOC delta of this candidate: **+10 / -5 = +5** (measured with
`git diff --numstat`), of which 3 added lines are the required ownership comment. It deletes a
policy asymmetry rather than adding a branch. `applyFailureDisposition`'s release arm writes
`lastError: disposition.message`, which is `"turn-abandoned"`, so the durable last-error
contract and the existing `attempts` increment are unchanged below the ceiling.

**Reachability receipt.** The candidate was applied locally, verified, and reverted — it is
**not** in any commit on this branch (`git status` clean apart from the fossil and proof
artifacts). With it applied:

```text
✓  src/channels/message/ingress-drain.abandonment-retry-budget.test.ts (5 tests) 414ms
   Test Files  1 failed | 8 passed (9)
        Tests  1 failed | 66 passed (67)
```

All five fossil tests turned GREEN. The single remaining failure was the codifying test above.
Every other drain, lane, supersede, freshness, watchdog, cancellation, debounce-failure and
ingress-monitor test stayed green — including
`"abandoned reply ownership releases claim with attempt increment"` and
`"lets callers await an abandoned claim release"`. This proves the fossil asserts a reachable
contract and localizes the entire blast radius of the repair to one codified expectation.

## Proof plan for the fix lane

1. Independent review of this fossil before any production edit.
2. Get a maintainer decision on `ingress-drain.test.ts:676-707`: delete it, or retarget it to
   assert the bounded outcome. Do not edit it silently.
3. Apply the owner-correct fix in `src/channels/message/ingress-drain.ts`. Keep the repair in
   the drain; do not special-case Discord, the session-lifecycle producer, or the error text.
4. **GREEN:** full `channels` shard, then the full suite.
5. **Patch-only revert -> RED:** revert only the production hunk, leave the fossil and the
   test decision in place, confirm the fossil returns to exactly the receipt above.
6. **Reapply -> GREEN.**
7. Consider the severable follow-up the causal report names separately:
   `session-admission-reason-code` — give `admitReplyTurn` a closed reason
   (`expected-session-mismatch`, `recovery-owner-invalidated`, `pre-operation-interrupted`)
   at `src/auto-reply/reply/reply-turn-admission.ts:263-325`. That is what makes a future
   dead letter diagnosable rather than merely bounded. It stays out of the repair lane.

## Proposed non-continuation corpus layout

```text
karmaterminal-openclaw-docs:main:PR-NNNNNN/PROOFS/6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955/
  README.md                       # this document
  fossil/
    ingress-drain.abandonment-retry-budget.test.ts
  receipts/
    6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955.red.txt
    530b33e4e37264c89ecd5abdd06279dd23d5c867.red.txt
    ab5b8b9a02c8b90c15b9c618b03cdf9a553d0cde.red.txt
    ac110917e1356833f65e1536768cbfbe7c1938d0.red.txt
    channels-shard.txt
    full-suite.txt
    full-suite-baseline-classification.txt
  causal-proof/
    proof-spec.json
    history-matrix.json
    gitnexus-relations.json
    graph/{nodes.csv,edges.csv,manifest.json,proof.json}
```

`PR-NNNNNN` is assigned by the fix lane when it opens its PR. The `<FULL_SHA>` segment is the
deployed composite the fossil was frozen against, not the fix commit, so the corpus entry stays
a stable non-continuation record of the RED state.

## Validation

### Owning suite

`channels` shard, complete:

```text
Test Files  1 failed | 103 passed (104)
     Tests  1 failed | 1131 passed (1132)
```

The single failure is the intended fossil RED. Every other channels test — drain, lanes,
supersede, freshness, watchdog, cancellation, debounce-failure, monitor, queue, dead-letters —
passes with the fossil present.

### Full suite

`node --import tsx scripts/test-projects.mts` at `6b09` + fossil:

```text
[test] failed 538 Vitest shards in 2589.96s
[test] failed shard digest (12)
```

12 of 538 shards failed. Exactly one is this lane's. Every other failing file was re-run
against a **clean detached worktree at exact `6b09`, with no fossil present**:

| Shard | File(s) | Baseline at exact `6b09` | Classification |
| ----- | ------- | ------------------------ | -------------- |
| `channels` | `ingress-drain.abandonment-retry-budget.test.ts` | — | **this lane's intended RED** |
| `agents-core` | `embedded-agent-subscribe...continuation-responses.test.ts` | 3 failed \| 5 passed | pre-existing |
| `auto-reply-reply` | `post-compaction-durable-handoff.test.ts`, `project84-owned-topology.contract.test.ts` | 2 files, 5 tests failed | pre-existing |
| `extension-discord` | `monitor/message-handler.queue.test.ts` | 1 failed \| 21 passed | pre-existing |
| `unit-src` | `claws/project.test.ts`, `snapshot/git-backup.test.ts` | 2 files, 3 tests failed | pre-existing |
| `plugins` | `bundled-plugin-metadata`, `npm-install-security-scan.release`, `runtime/runtime-llm.runtime` | 3 files, 4 tests failed | pre-existing |
| `tooling` | `openclaw-prepack`, `plugin-npm-package-manifest`, `scripts/full-release-validation-at-sha` (+ `prepare-extension-package-boundary-artifacts`) | 4 files, 6 tests failed | pre-existing |
| `tui-pty` | `tui-pty-harness.e2e.test.ts` | **63 passed, 0 failed** | full-suite-load flake |
| `extension-telegram` | `bot.create-telegram-bot.channel-post-media.test.ts` | **3587 passed, 0 failed** | full-suite-load flake |
| `infra` | `backup-create.test.ts` | **6397 passed, 0 failed** | full-suite-load flake |

The `[code-mode-matrix] FAIL harness_error ollama-...` line is a live model-matrix harness
artifact, not a Vitest failure.

None of these is attributable to this lane. `git diff --numstat 6b09 HEAD` is a single added
test file (`321 0`) in the `channels` shard; the other shards run in separate Vitest processes
and cannot observe it. Per the lane's failure-classification rule, all of them stay out of
this lane.

**Adjacent note for the fix lane:** `extensions/discord/src/monitor/message-handler.queue.test.ts >
"dead-letters an exhausted preflight failure and releases its Discord lane"` is already red at
exact `6b09`. It sits in the same Discord ingress dead-letter neighborhood as this defect and
is worth reading before the repair, but it reproduces without the fossil and is not owned here.

### Static checks

```text
./node_modules/.bin/oxfmt src/channels/message/ingress-drain.abandonment-retry-budget.test.ts   # clean
node scripts/run-oxlint.mjs src/channels/message/ingress-drain.abandonment-retry-budget.test.ts # clean
```

## Uncertainties and evidence gaps

- **Not an incident replay.** The fossil reproduces the production retry policy and the
  pre-adoption abandonment path. It does not reproduce Silas's session-lifecycle rejection
  producer, and no live row state was available. It characterizes the mechanism, not the seat.
- **Producer branch still unknown.** Which of the three `admitReplyTurn` rejection branches
  fired for Silas is not determined by this lane and is not determinable without the reason
  code proposed above.
- **`16c14e5bbfc9` has no behavioral receipt.** Born-broken there rests on source inspection.
  A behavioral run would have required rewriting the fossil's observation surface.
- **GitNexus index is stale** (`a59a96549b7`, indexed 2026-08-08). It confirmed the asymmetry
  in shape, but `releaseUnadopted` is absent from it, so every symbol-level claim was
  re-verified against `6b09` source directly.
- **Committed RED breaks the suite by design.** This branch is intentionally red on exactly one
  test file until the fix lands. It is not merge-ready and no PR was opened.

## Exact commands

```bash
# Fossil at the lane base (RED)
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.abandonment-retry-budget.test.ts

# Owning shard
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1

# Full suite (package.json#scripts.test)
node --import tsx scripts/test-projects.mts

# Exact-6b09 baseline classification for any non-fossil failure
git worktree add --detach /tmp/oc-baseline-6b09 6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955
ln -sfn "$PWD/node_modules" /tmp/oc-baseline-6b09/node_modules
cd /tmp/oc-baseline-6b09 && node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.<shard>.config.ts --maxWorkers=1

# Format + lint the fossil
./node_modules/.bin/oxfmt src/channels/message/ingress-drain.abandonment-retry-budget.test.ts
node scripts/run-oxlint.mjs src/channels/message/ingress-drain.abandonment-retry-budget.test.ts

# Cross-revision run (repeat per SHA, remove the worktree afterwards)
git worktree add --detach /tmp/oc-fossil-<sha> <sha>
ln -sfn "$PWD/node_modules" /tmp/oc-fossil-<sha>/node_modules
cp src/channels/message/ingress-drain.abandonment-retry-budget.test.ts \
   /tmp/oc-fossil-<sha>/src/channels/message/
cd /tmp/oc-fossil-<sha> && node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.abandonment-retry-budget.test.ts
```
