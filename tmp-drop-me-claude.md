# Lane Journal: spiderweb-tests-nonexistent-target

**Issue**: karmaterminal/openclaw#697
**Owner**: 🌊 Ronan
**Branch**: ronan/spiderweb-tests-nonexistent-target-20260517/claude
**Base**: df502943c2
**Dispatch**: claude*session*\* model=opus (claude-opus-4-6), bypassPermissions, 444m budget
**Started**: 2026-05-17 ~09:27 PDT

## Checkpoints (post to issue + cohort webhook at each)

- [x] §1 reads complete (call-sites + reachability)
- [ ] First test green
- [ ] All tests green
- [ ] 7-gates green
- [ ] DECLARE-DONE

## §1 Byte-walk findings

### Files walked

1. `src/auto-reply/continuation/targeting-pure.ts` (66 LOC)
2. `src/auto-reply/continuation/targeting.ts` (157 LOC)
3. `src/auto-reply/continuation/delegate-dispatch.ts` (494 LOC)
4. `src/auto-reply/continuation/delegate-store.ts` (707 LOC)
5. `src/agents/subagent-announce.ts` (~L540-560, L1290-1350)
6. `src/agents/subagent-spawn.ts` (~L159-166, L1320-1332)
7. `src/agents/openclaw-tools.ts` (~L494-554)
8. `src/infra/session-delivery-queue-storage.ts` (417 LOC)
9. `src/infra/system-events.ts` (L72-98, L154+)
10. `src/infra/heartbeat-wake.ts` (L348-365)
11. `src/shared/string-coerce.ts` (L1-15)
12. `src/auto-reply/reply/agent-runner-execution.ts` (grep: targetSessionKey, activeSession, resolveSession)

### Existing test coverage walked

- `src/auto-reply/continuation/cross-session-targeting.test.ts` (477 LOC)
- `src/auto-reply/continuation/delegate-dispatch.test.ts` (600 LOC)

### Surface A: Pure normalization pre-guard (`targeting-pure.ts`)

`normalizeContinuationTargetKey(value)` → delegates to `normalizeOptionalString()` → returns `undefined` for `undefined`, `null`, `""`, and whitespace-only. `normalizeContinuationTargetKeys(values)` filters any key that normalizes to `undefined` and dedupes.

**Finding A1**: `undefined` / empty-string / whitespace `targetSessionKey` is normalized to `undefined` → `hasContinuationDelegateTargeting()` returns `false` → no cross-session behavior. This is the **pre-guard**. A valid-but-nonexistent key (e.g. `"agent:main:ghost"`) passes normalization unchanged.

### Surface B: Return delivery resolution (`targeting.ts`)

`resolveContinuationReturnTargetSessionKeys()` resolves keys from params. **No session-store existence check.** If explicit `targetSessionKey` normalizes to a valid string, it's returned regardless of whether that session exists. Fallback to `defaultSessionKey` (the requester/dispatching session) only triggers when ALL explicit keys normalize to nothing.

`enqueueContinuationReturnDeliveries()` iterates resolved keys. For each:

1. `enqueueSessionDelivery()` — writes durable JSON file to `<state-dir>/session-delivery-queue/<id>.json`
2. `enqueueSystemEvent()` — pushes to in-memory `globalThis` Map keyed by sessionKey (creates new queue entry if none exists; no existence check)
3. `requestHeartbeatNow()` — queues a wake reason + schedules (no existence check)

**Finding B1**: NO existence validation against any session store at return-delivery time. Nonexistent target key → durable queue file persists on disk, in-memory event queued, heartbeat requested. ALL three are fire-and-forget. This is BY DESIGN per comment at `targeting.ts:127-132` — recipients may be in a different process or not yet started. Durable files persist until recipient consumption or overflow cap (`DEFAULT_QUEUE_DIR_MAX_FILES=10000`).

**Finding B2**: Empty `targetSessionKeys` array → loop body never executes → returns `{enqueued: 0, delivered: 0, deliveryIds: []}`. Graceful no-op.

### Surface C: Dispatch-side (`delegate-dispatch.ts`)

`dispatchToolDelegates()` consumes pending delegates and calls `spawnSubagentDirect()` with targeting params passed through verbatim. Cross-session policy check at L231 only gates on `crossSessionTargeting === "disabled"` (policy toggle), NOT on target existence.

`dispatchStagedPostCompactionDelegates()` — identical pattern: targeting passed through to spawn.

**Finding C1**: No session-store existence validation at dispatch time. Targeting is pass-through to `spawnSubagentDirect()`. The spawn creates a child carrying the targeting info; existence is irrelevant until the child completes and the return path (Surface B) delivers.

### Surface D: Return-time announcement (`subagent-announce.ts:1306-1348`)

On subagent completion with continuation targeting:

1. Checks `hasContinuationTargeting` (just presence-of-params)
2. Calls `resolveContinuationReturnTargetSessionKeys()` → Surface B
3. Calls `enqueueContinuationReturnDeliveries()` → Surface B
4. **No session-store existence check** at any point

**Finding D1**: Return-time delivery is fire-and-forget. Nonexistent keys get durable deliveries that sit on disk and in-memory events that sit in Map entries. No throw, no infinite loop, no orphaned promise.

### Surface E: Compaction release (`agent-runner-execution.ts:149-207`)

`releaseQueuedCompactionCompletion()` checks `params.activeSessionStore` and `params.sessionKey` but only for the dispatching session's OWN entry, not for delegate targets.

**Finding E1**: Compaction release guards are about the running session, not the delegate target. Not relevant to nonexistent-target surface.

### Reachability analysis

| Scenario                                            | Reachable?                      | Behavior                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `targetSessionKey` is `undefined`                   | Yes (tool omits field)          | Pre-guarded: normalized away, no cross-session targeting. Falls to self-session default.                                                                                 |
| `targetSessionKey` is `""`                          | Yes (tool passes empty)         | Pre-guarded: same as undefined.                                                                                                                                          |
| `targetSessionKey` is whitespace-only               | Yes (unlikely but possible)     | Pre-guarded: same as undefined.                                                                                                                                          |
| `targetSessionKey` is valid but never existed       | Yes (model picks arbitrary key) | **Not guarded**: passes normalization, dispatch, spawn, and return delivery. Durable file + in-memory event + heartbeat fire. No existence check. No warn-class logging. |
| `targetSessionKey` existed then was removed (stale) | Yes (session ended mid-flight)  | Same as never-existed. No difference in code path.                                                                                                                       |

### Warn-class logging

**Finding W1**: No warn-class logging fires for nonexistent target delivery. The delivery succeeds silently (info-level log at `targeting.ts` via `subagent-announce.ts:1343-1344` says "Delivered to <keys>" regardless of whether recipients exist). This may be a code-shape observation for cohort — but is NOT a bug, it's the designed fire-and-forget durable delivery model.

### Parent obligation completion

**Finding P1**: `enqueueContinuationReturnDeliveries()` returns `{enqueued, delivered, deliveryIds}` regardless of target existence. The calling code in `subagent-announce.ts:1331-1348` sets `didAnnounce=true` and `shouldDeleteChildSession` based on `params.cleanup`, independent of delivery success. The parent chain (announce → cleanup → return) completes normally. No orphaned promises, no dangling lease.

**Finding P2**: `dispatchToolDelegates()` returns `{dispatched, rejected, chainState}` with properly advanced `currentChainCount`. TaskFlow records are finished/failed. The hedge timer re-arm logic at L188-198 clears correctly. Parent obligations are fully met.

### Test surface identified

The testable gap is in the **nonexistent-but-valid target key** path:

1. **`targeting-pure.ts`**: Verify undefined/empty/whitespace → no targeting (partial existing coverage, can extend)
2. **`targeting.ts` → `resolveContinuationReturnTargetSessionKeys`**: Verify nonexistent key passes through unchanged
3. **`targeting.ts` → `enqueueContinuationReturnDeliveries`**: Verify delivery to nonexistent key completes gracefully, writes durable file, enqueues system event, returns valid counts
4. **`delegate-dispatch.ts` → `dispatchToolDelegates`**: Verify dispatch with nonexistent-target delegate completes, passes targeting to spawn, chain state advances

### Code-shape observations (not-a-bug, for cohort follow-up)

- **CS1**: No warn-class logging when delivering to a nonexistent target session. The system silently queues durable files. If a target never exists, files accumulate until overflow cap. This is consistent with the durable-delivery design but means orphaned deliveries are invisible to operators until `openclaw status --deep` or disk pressure.
- **CS2**: The `subagent-announce.ts:1306` file mentioned in the workorder as LOC references (L253-284, L868, L941-952, L1083, L1125-1126, L1134-1148) does exist but at `src/agents/subagent-announce.ts`, not `src/auto-reply/reply/subagent-announce.ts`. The workorder path was stale.

## Log

- 2026-05-17T16:27Z: lane init, worktree+branch+journal created per Pattern A
- 2026-05-17T16:XX Z: §1 byte-walk complete. 12 files walked, 5 surfaces identified. Key finding: targetSessionKey is NEVER resolved against active-session-store in any delivery path. Fire-and-forget durable delivery by design. Nonexistent target = durable queue file persists, in-memory event queued, heartbeat requested, no throw/loop/orphan. Pre-guard normalizes empty/undefined away. Valid-but-nonexistent passes through all code paths silently.
