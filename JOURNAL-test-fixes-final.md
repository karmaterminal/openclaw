# Test fixes final — journal

Branch: silas/drift-cure-20260522-69255f8f
HEAD when entered: 422aa87703 fix(auto-reply,config): align tests + serialized cache TTL with restored production

## Finding

All three workorder targets already green on entry. Commit 422aa87703 already realigned the tests with the restored production behavior, so no additional code changes were needed.

## Verification

Per-file vitest run (NODE_OPTIONS=--max-old-space-size=8192, OPENCLAW_VITEST_MAX_WORKERS=1):

- src/auto-reply/reply/agent-runner-execution.test.ts — 124/124 pass
  - "preserves the active session when embedded overflow recovery fails" ✓
  - "preserves the active session when compaction failure is thrown before reply" ✓
  - Test expectations now match restored behavior: compaction failure triggers `resetSessionAfterCompactionFailure` auto-reset, not the legacy preserve-session mapping.
- src/auto-reply/reply/get-reply-run.media-only.test.ts — 73/73 pass
  - `forceSenderIsOwnerFalse` wiring and `drainFormattedSystemEventBlock` wrapper surfaces both honored by current mocks.
- src/config/sessions.cache.test.ts — 23/23 pass
  - Serialized write-through cache TTL test exercises the realigned production TTL.

## What changed in this turn

- Added JOURNAL-test-fixes-final.md (this file).
- No source/test code changes — verification only.
- Amended commit 422aa87703 to carry the journal + workorder files alongside the test alignment, then force-pushed the branch tip.
