# Continuation fire-span timeout investigation

## Verdict

Mode-B run
[34419865749](https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/34419865749)
did not expose a TaskFlow liveness defect. The first fire-span test entered
`runReplyAgent`, discovered that its synthetic `FollowupRun` had no prepared
model-modality fact, and awaited a cold
`loadProviderScopedThinkingCatalog()` call before it could reach the mocked
embedded run and continuation scheduling. On the failed hosted job, that
fixture-only catalog work exhausted the 120-second test budget.

The smallest exact cure is to restore the fixture's already-established
prepared fact:

```ts
thinkingCatalog: [{ provider: "anthropic", id: "claude", input: ["text"] }],
```

Keep the durable session owner, fake timers, 120-second timeout, TaskFlow hedge,
and every assertion unchanged. Do not prewarm the continuation lazy barrel:
measured evidence places the delay in model catalog loading, not in the hedge
import or timer callback.

## Bound evidence

| Surface              | Identity / result                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product              | `8a4f89c11d3a90768ff6b641a84b77aa7e308820`                                                                                                                                                                            |
| Workflow             | `karmaterminal/openclaw-bootstrap@ad2f8d2fd5cb6be6775ac8fbd9ffc4e20e3fb816`                                                                                                                                           |
| Run                  | `34419865749`, attempt 1, failed                                                                                                                                                                                      |
| Failed job           | `102692889739`, hosted batch 033                                                                                                                                                                                      |
| Exact shard          | `auto-reply-reply-agent-runner`                                                                                                                                                                                       |
| Shard result         | 51 files; 1,027 passed, 1 failed, 1 todo                                                                                                                                                                              |
| Initial failure      | first fire-span case, reported at 149,674 ms with a 120,000 ms timeout                                                                                                                                                |
| Harness confirmation | fresh serial rerun of the file failed the same first case at 136,720 ms; the other eight cases passed in about 1.0-3.1 seconds                                                                                        |
| Issue                | [openclaw/openclaw#143480](https://github.com/openclaw/openclaw/issues/143480), closed as candidate-only validation work associated with [openclaw/openclaw#129388](https://github.com/openclaw/openclaw/pull/129388) |

Rune was not SSH-accessible and `/tmp/job102692889739.log` was not present on
this host. The GitHub aggregate artifact supplied the exact shard log and
`summary.json`; the direct job-log endpoint returned an empty body. This is
therefore GitHub artifact evidence, not a reconstructed log.

## Exact waiting phase and owner

The failed test calls `vi.useFakeTimers()` and then awaits `runDelegateTurn()` at
`src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts:371-398`.
That helper persists the source owner and enters `runReplyAgent` at
`src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts:338-367`.

The relevant runtime path is:

1. Embedded-run parameter preparation asks
   `resolveRunModelHasVision()` for the selected model's input capability.
2. The fixture has neither configured model input nor `run.thinkingCatalog`.
3. `resolveRunModelHasVision()` therefore takes its fallback at
   `src/auto-reply/reply/agent-runner-run-params.ts:73-107`.
4. That fallback awaits `loadProviderScopedThinkingCatalog()`, owned by
   `src/agents/prepared-model-catalog.ts:350-420`, which prepares manifest,
   plugin, harness, and provider-scoped metadata.
5. Only after this work does the mocked embedded result reach
   `scheduleReplyContinuation()` and the TaskFlow-backed hedge. The test does
   not advance the 1,000 ms fake timer until `runDelegateTurn()` returns.

A throwaway instrumented archive of the exact product source measured:

| Phase                                               |     Wall time |
| --------------------------------------------------- | ------------: |
| Durable `upsertSessionEntryCore()` fixture owner    |        170 ms |
| `runReplyAgent()` before catalog load               |      8,337 ms |
| Dynamic import of `model-catalog.runtime.js`        |        162 ms |
| `loadProviderScopedThinkingCatalog()`               | **80,405 ms** |
| Remaining `runReplyAgent()` work                    |         62 ms |
| `vi.advanceTimersByTimeAsync(1_000)` and hedge fire |         33 ms |
| Whole focused case                                  |     89,195 ms |

Adding only the prepared `thinkingCatalog` entry reduced the same focused case
to 8,788 ms; the upsert took 189 ms, `runReplyAgent()` took 8,562 ms, and timer
advancement took 15 ms. No production code, timeout, assertion, scheduling
logic, or persistence behavior changed.

Therefore:

- **Waiting owner:** model capability preparation,
  `loadProviderScopedThinkingCatalog()`.
- **Not the owner:** SQLite session persistence, TaskFlow row maturation,
  hedge timer advancement, continuation dispatch, or span emission.
- **Point at timeout:** the test is still awaiting `runReplyAgent()` before its
  explicit fake-time advance and before the asserted fire/dispatch spans.

## Classification

The 72.9-81.0 second isolated passes reported in #143480 identify deterministic
fixture cost, not health:

- The first case cold-loads provider/model metadata because its synthetic queued
  run omitted an admission-owned fact.
- Later cases are fast because the process has paid/warmed that metadata path.
- Hosted CPU, memory pressure, page faults, and shard neighbors amplify the
  wall time enough to cross 120 seconds, but they do not create the expensive
  path.
- The Mode-B harness's fresh serial confirmation re-red at 136,720 ms, ruling
  out sibling-test contamination as the primary cause.
- The test's TaskFlow assertions pass immediately once execution reaches the
  hedge. No observed evidence shows a stuck delegate, missed timer, failed
  dispatch, or product continuation liveness loss.

Classification: **deterministic test-fixture cold discovery with host-load
amplification**.

## Deterministic reproduction

From a clean checkout of the exact product with its lockfile installed:

```bash
OPENCLAW_VITEST_MAX_WORKERS=1 \
  node scripts/run-vitest.mjs \
  src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts \
  --config test/vitest/vitest.auto-reply-reply.config.ts \
  -t 'bracket-delayed delegate fires through TaskFlow hedge'
```

On a fast host, the test can pass after paying roughly 73-90 seconds; under the
same 2-vCPU hosted pressure as Mode-B it crosses 120 seconds. The deterministic
fault is the real catalog call, not whether a particular host crosses the
wall-clock threshold. To prove it without relying on host speed, temporarily
instrument or spy on `loadProviderScopedThinkingCatalog()` and assert that the
fire-span fixture calls it. Then add the prepared catalog entry and rerun: the
call disappears while the same TaskFlow fire and dispatch assertions pass.

Local read-only confirmation used a temporary, uncommitted archive of the exact
product source and the repository's existing installed dependency tree:

- Baseline full file: 9/9 passed; first case 83,628 ms.
- Instrumented focused baseline: passed in 89,195 ms; catalog load 80,405 ms.
- One-line prepared-catalog variant: passed in 8,788 ms.

No repository source was changed for those probes.

## Cure and sibling scope

For the exact failure, restore the one prepared text-only entry in
`createContinuationRun()` immediately after `model: "claude"` in
`src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts`.
This is a one-line test-fixture repair and zero production LOC.

The merge-safe workorder is:

1. Restore the prepared `thinkingCatalog` fact in the fire-span fixture.
2. Preserve the owner persistence added by
   `eab496cdf0c4b1d358991e126405242d83cbc2a3`; it is required by the newer
   source-owner admission boundary and measured at only 170-189 ms.
3. Apply the same fixture fact to the two invariant-sharing builders in
   `agent-runner.continuation-delegate-reject-obs.test.ts` and
   `agent-runner.continuation-span-uniformity.test.ts`. Product `8a4f89c` omits
   it in all three; #129388's current head repairs fire-span and reject-obs but
   still omits span-uniformity.
4. Run the three files in one fresh single-worker process, then run fire-span
   alone in a second fresh process. Require the first case to avoid
   `loadProviderScopedThinkingCatalog()` and preserve all existing assertions.
5. Run the owning `auto-reply-reply-agent-runner` shard. Do not increase
   `testTimeout`, weaken assertions, skip the hedge, move the test to real
   timers, or change production catalog/continuation code.

The alternate cure proposed in the closing issue comment—prewarming
`../continuation/lazy.runtime.js` in `beforeAll`—does not match the measured
owner. It may warm overlapping module work, but it leaves the synthetic run
missing its canonical prepared input fact and still permits real catalog
discovery. The prepared fact is both smaller and architecturally correct.

## Existing cure status

The exact one-line cure already exists in
`b16eb0c4a03eaa2c5f26e0642562183dacae0602`
(`test(continuation): restore delegate fixture model facts`). Its commit message
states the same invariant: supply the prepared model catalog so the full reply
boundary reaches TaskFlow scheduling rather than catalog discovery.

That cure was present in the earlier accepted-composite lineage
`f16aa2e0118b616d1a1c31bb64a56b7da756a224`, but the final product was assembled
through a separate scheduling-composition cherry-pick lineage and does not
contain it. The live #129388 head
`e76395810becd0ad0f2997cae8b4f777e6439d81` again contains the fire-span line,
but #129388 is open, non-accepted, conflicting, and has failing required checks.

**Answer:** an accepted predecessor contains the correct cure, but no accepted
descendant of product `8a4f89c` does. Reapply the one-line fixture fact rather
than inventing a new timeout or production workaround.
