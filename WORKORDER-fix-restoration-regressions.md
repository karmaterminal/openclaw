# WORKORDER: Fix 3 restoration-introduced test regressions

## Context

Feature restoration at bbecf0600c introduced new test failures in 3 files.
The restored production code is correct but test mocks/expectations need updating.

## Files to fix (in priority order)

1. **src/auto-reply/reply/get-reply-run.media-only.test.ts** (~20 failures)
   - Root cause: forceSenderIsOwnerFalse wiring changed the return type of drainFormattedSystemEvents
   - The function now returns {text, forceSenderIsOwnerFalse} instead of just string
   - Tests calling the old signature need updating to match new return shape

2. **src/auto-reply/reply/agent-runner-execution.test.ts** (2 failures)
   - "preserves the active session when embedded overflow recovery fails"
   - "when compaction failure is thrown before reply"
   - Root cause: compaction-recovery restoration added resetSessionAfterCompactionFailure
   - Tests need the mock for this param added (same pattern as the 64-site mock fix from earlier)

3. **src/config/sessions.cache.test.ts** (regression)
   - Was fixed earlier today -- check if restoration undid the TTL-based expiry fix

## Method

For each file:

1. Run vitest on just that file to see current failures
2. Identify what the restoration changed that broke the test expectations
3. Fix the test expectations to match the new (correct) production signatures
4. Verify vitest passes for that file
5. Run adjacent tests to confirm no spillover

## Verification

After all 3 fixed: run all 3 together + the 4 restoration-verification files (agent.test.ts + compact.hooks.test.ts). All must pass. Push when green.
