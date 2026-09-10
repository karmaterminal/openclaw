# Review #1292 replay

## Named refs

| Category | Named ref | Full SHA | Equality / applicability |
|---|---|---|---|
| Product/base ref | candidate `8223339a86` / base `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | `8223339a868994a77a9616b5cfd63ff78a28c7aa` / `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | Both resolve locally; candidate is the reviewed product SHA. |
| Safe lane branch ref | `codeagent/review-1292-replay` | `8223339a868994a77a9616b5cfd63ff78a28c7aa` | Before evidence collection, local = tracking = server. |
| CI/workflow ref | N/A | N/A | Workorder forbids Actions and broad acceptance. |
| Presentation ref | N/A | N/A | Workorder forbids presentation. |
| Docs/proof ref | N/A | N/A | No separate docs/proof branch; this report is the only permitted write. |

## Verdict

**PASS**

Candidate `8223339a868994a77a9616b5cfd63ff78a28c7aa` is the stable accepted
test-fixture repair for [karmaterminal/openclaw#1292](https://github.com/karmaterminal/openclaw/issues/1292).
It changes one test file by `+3/-0`; production LOC is `+0/-0`.

By: frond scribe 🌿 (@scribe-dandelion-cult, account 2026-05-06) | OpenClaw:
3 PRs, 9 issues, 1 default-branch commit/12mo | GitHub contributions:
2466 commits, 1802 PRs, 401 issues, 41 reviews/12mo.

## Semantics verified

| Requirement | Evidence |
|---|---|
| Prepared model catalog | `createContinuationRun` now supplies the selected Anthropic text-only model in `thinkingCatalog`. `resolveRunModelHasVision` therefore consumes the prepared catalog instead of entering provider-scoped runtime discovery while fake timers are active. This matches the nearest `agent-runner.continuation-work-span.test.ts` fixture. |
| Dispatch timer/controller reset | `afterEach` calls `resetContinuationWorkDispatchForTests()` before `vi.useRealTimers()`. The owner reset clears work timers, idle-retry failure timers, idle-retry `AbortController`s, and dispatch claims. |
| Reservation child-token persistence | The owner-boundary regression remains unchanged: a simulated child commit adds 7 tokens during the second persistence call, the turn contributes 5 tokens, and the final session entry retains 22 tokens with count 2 and the original chain ID. The TaskFlow enqueue assertion also remains intact. |
| Fake-time cleanup | The candidate's explicit dispatch reset prevents lifecycle-owned fake timers/controllers from escaping the test, and cleanup occurs before restoring the real clock. |
| No production changes | `git diff --name-status` reports only `src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts`; production LOC is zero. |
| Stable accepted repair | The three semantic edits are the same repair previously accepted at `3407832ec39c896efde3b754b1d2801980b70796`, replayed over the requested base. |

## Regression completeness

- **Invariant and owner:** a fake-clock `runReplyAgent` integration fixture must
  carry the already-prepared model catalog and must release continuation dispatch
  lifecycle state through `work-dispatch.ts` before restoring real timers.
- **Negative control:** on exact base
  `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc`, the named child-token test fails
  with `Test timed out in 15000ms`; it remains in the frozen-clock discovery path
  for about 74 seconds before Vitest can report the timeout.
- **Positive control:** on candidate
  `8223339a868994a77a9616b5cfd63ff78a28c7aa`, the same named test and 15-second
  bound pass in 6.4 seconds.
- **Nearest sibling:** the continuation span sibling passes 9/9, including
  persistence failure, reservation rollback after hot disablement, live-limit
  changes, zero-slot concurrency, and hedge-fired recovery.
- **Dispatch owner:** `work-dispatch.test.ts` passes 14/14, including timer and
  controller lifecycle ownership, reset cancellation, claim fencing, rollover,
  retry cleanup, and partial-failure ordering.
- **Restart/recovery:** `work-dispatch.parent-lineage-and-restart.test.ts` passes
  17/17, including durable delivered-mark restart windows, reboot re-drive, and
  no duplicate consumption after durable commit.

## Validation

Focused-only acceptance was used as required; no Actions, Mode-B, presentation,
or deployment was run.

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 --testTimeout=15000 -t 'preserves child-token updates committed while a work reservation is active' src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts
base: FAIL (1 failed, 6 skipped; expected timeout)
candidate: PASS (1 passed, 6 skipped)

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts
candidate: PASS (7/7)

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/agent-runner.continuation-work-span.test.ts src/auto-reply/continuation/work-dispatch.test.ts
candidate: PASS (23/23)

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/continuation/work-dispatch.parent-lineage-and-restart.test.ts
candidate: PASS (17/17)

.agents/skills/autoreview/scripts/autoreview --mode branch --base 92ae08ae5b74aeca70fbd57cf260e5fb28e274fc --max-priority P2 ...
scoped-clean; patch correct confidence 0.99
```

**Best-fix verdict:** best. Seeding the already-prepared catalog repairs the
fixture contract without masking model discovery, and lifecycle-owner cleanup
is preferable to downstream timer manipulation. No production behavior,
compatibility surface, persistence schema, or fallback path changes.

**Remaining uncertainty:** none material. Without the explicit 15-second
negative-control bound, this host eventually completes the rejected fixture
after about 74 seconds; the bounded test still deterministically distinguishes
the frozen-clock regression from the 6.4-second repaired path.
