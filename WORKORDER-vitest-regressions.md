# WORKORDER: Fix 5 drift-cure vitest regressions

## Context

Branch: silas/drift-cure-20260522-69255f8f (HEAD 647e82fda6)
This is a rebase of PR #79925 continuation feature onto upstream/main.
22 conflict files resolved. ~9500 tests pass. These 5 files fail due to conflict resolution decisions.

## Files to fix (in priority order)

### 1. src/agents/subagent-registry.announce-loop-guard.test.ts

- 2 failed / 8 passed
- Test: "announce rejection resets cleanupHandled so retries can resume"
- Error: expected true to be false (cleanupHandled not reset after rejection)
- Root cause NOT readSessionEntry mock (already tried). Timer/promise interaction with vi.useFakeTimers.
- Compare against: git show 642a33df:src/agents/subagent-registry.ts (PR-head)
- Check what upstream changed in announce-rejection flow re cleanupHandled reset

### 2. src/agents/agent-command.live-model-switch.test.ts

- Untriaged. Run, get error, compare with git show 642a33df:<file>

### 3. src/auto-reply/reply/get-reply-run.media-only.test.ts

- Untriaged. Run, get error, compare with git show 642a33df:<file>

### 4. src/auto-reply/inbound.test.ts

- Untriaged. Run, get error, compare with git show 642a33df:<file>

### 5. extensions/telegram/src/bot.create-telegram-bot.test.ts

- Passes on upstream/main, fails on drift-cure branch
- I did "take HEAD" on this file (kept upstream 304 lines of test content)
- Something PR-side is expected by another part of the test infrastructure

## Method

1. Run: NODE_OPTIONS="--max-old-space-size=8192" OPENCLAW_VITEST_MAX_WORKERS=1 npx vitest run <file> --reporter=verbose
2. Get exact error
3. Compare with PR-head: git show 642a33df:<file>
4. Find missing import/mock/declaration/signature change
5. Fix minimally
6. Re-run to verify green
7. Move to next file

## After all fixes

git add -A && git commit --amend --no-edit && git push origin silas/drift-cure-20260522-69255f8f --force

## Journal

Append findings to /tmp/silas-drift-20260522/JOURNAL-vitest-fixes.md
