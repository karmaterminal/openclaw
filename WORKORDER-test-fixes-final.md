# Fix remaining test failures (feature-restoration test-expectation updates)

Branch: silas/drift-cure-20260522-69255f8f (HEAD bbecf0600c)

## Files to fix

1. src/auto-reply/reply/agent-runner-execution.test.ts (2 failures)
   - "preserves active session when embedded overflow recovery fails"
   - "preserves active session when compaction failure is thrown before reply"
   - OLD behavior: compaction failure = hard fail (preserve session mapping)
   - NEW behavior (restored): compaction failure = auto-reset + retry via resetSessionAfterCompactionFailure
   - Fix: update test expectations to expect session-reset behavior, not preserve behavior

2. src/auto-reply/reply/get-reply-run.media-only.test.ts
   - Failures from forceSenderIsOwnerFalse wiring change
   - drainFormattedSystemEvents now returns via drainFormattedSystemEventBlock wrapper
   - Tests may need mock updates for the new function surface
   - Compare: git show 642a33df:src/auto-reply/reply/get-reply-run.media-only.test.ts

3. src/config/sessions.cache.test.ts (check if failing - may be green already)

## Method

Run each: NODE_OPTIONS="--max-old-space-size=8192" OPENCLAW_VITEST_MAX_WORKERS=1 npx vitest run <file> --reporter=verbose 2>&1 | tail -60
Fix expectations. Verify green.
Then: git add -A && git commit --amend --no-edit && git push origin silas/drift-cure-20260522-69255f8f --force
