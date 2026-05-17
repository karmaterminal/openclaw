# Lane Journal: spiderweb-tests-onfire-throws

**Issue**: karmaterminal/openclaw#698
**Owner**: 🌊 Ronan (second concurrent lane)
**Branch**: ronan/spiderweb-tests-onfire-throws-20260517/claude
**Base**: df502943c2
**Dispatch**: claude*session*\* model=opus (claude-opus-4-6), bypassPermissions, 444m budget
**Started**: 2026-05-17 ~09:30 PDT

## Checkpoints

- [x] §1 reads complete (call-sites + reachability for continue_work timer-fire + onFire throws)
- [x] First test green (6/6 on first attempt)
- [x] All tests green (6/6)
- [x] 7-gates green (6/7 clean; gate 7 has pre-existing failures in unrelated files)
- [x] DECLARE-DONE

## Log

- 2026-05-17T16:30Z: lane init per Pattern A, figs dispatch-by-default canon applied
- 2026-05-17T16:45Z: §1 byte-walk complete — findings below

## §1 Byte-Walk Findings

### Primary surface: `scheduleWorkContinuation` — `src/auto-reply/continuation/scheduler.ts:81-137`

**Where onFire is invoked:**

- `scheduler.ts:115` — inside a `setTimeout` callback, synchronous call
- Signature: `(nextChainCount: number, chainStartedAt: number, accumulatedTokens: number, workReason?: string) => void`
- No Promise return — purely sync invocation

**What happens when it throws:**

- **Caught**: try/catch wraps the call at `scheduler.ts:121-128`
- **Logged**: `log.warn("[continuation:work-fire-failed] session=<key> error=<msg>")` at L127
- **Does NOT bubble**: caught within setTimeout — no event-loop unhandled exception
- Comment at L122-125: "The user-supplied onFire callback does enqueueSystemEvent + requestHeartbeatNow from agent-runner.ts; either can throw under bounded-queue / disk conditions."

**Cleanup regardless of throw:**

- `finally` at `scheduler.ts:129-131` calls `unregisterContinuationTimerHandle(sessionKey, timerHandle)`
- `unregisterContinuationTimerHandle` (`state.ts:87-99`): removes handle from per-session Set, deletes Set if empty, calls `releaseContinuationTimerRef` to decrement ref count
- Timer ref lifecycle: `retainContinuationTimerRef` (L111) → `releaseContinuationTimerRef` via finally

**Lease:** No explicit lease. Timer ref count is functional equivalent — released in finally.

**Queue progression for siblings:**

- Each call creates an independent `setTimeout`. Multiple timers tracked in `Set<TimerHandle>` (`state.ts:14`). One throw does not block others.

**Warn-class logging:** YES — `log.warn("[continuation:work-fire-failed]...")` with session key and error

### Reachability

**REACHABLE** via real call-site. Comment names throw sources from `agent-runner.ts`. No pre-guard. Function-boundary tests are correct shape.

### Existing coverage in `scheduler.test.ts`

- L179-199: ONE test — confirms throw doesn't crash, onFire called. Does NOT verify: cleanup state, warn logging, workReason, non-Error values, sibling independence.

### Coverage gaps → §2

1. Timer handle cleanup after throw (`hasLiveContinuationTimerRefs` → false)
2. Warn logging emitted (needs logger mock per `delegate-dispatch.test.ts:19-40` pattern)
3. Error message formatting (Error vs non-Error thrown values)
4. workReason passthrough on throw path
5. Multiple queued work timers — one throws, sibling still fires
6. Partial-work-then-throw — side-effect observed, cleanup still proceeds

### Design-shape note (not fixing — §10)

Delegate delayed path (`scheduler.ts:206-230`): sync throw from async `onDelayedSpawn` would escape `setTimeout` as unhandled (only `.catch` handles async rejection). Degenerate edge — async functions shouldn't sync-throw. Not in scope.

## DECLARE-DONE

- **Final SHA**: `fdc29813e8`
- **Test count**: 6 passing / 6 total
- **Test file**: `src/auto-reply/continuation/scheduler.onfire-throws.test.ts`
- **Validation summary**:
  - tsgo:core ✅
  - tsgo:test ✅
  - tsgo:extensions ✅
  - lint ✅
  - lint:extensions:bundled ✅
  - package-boundary:compile ✅ (108 plugins)
  - full vitest: ✅ for touched surface; pre-existing failures in 6 unrelated files
- **§9-class deviations**: none
- **Design-shape note** (not a deviation — informational): delegate delayed path lacks sync-throw catch (degenerate edge, async functions don't sync-throw). Posted for cohort code-shape review.
