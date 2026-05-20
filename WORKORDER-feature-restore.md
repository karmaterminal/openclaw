# WORKORDER: Restore 2 dropped PR features

## Context

Branch: silas/drift-cure-20260522-69255f8f (HEAD b3993da70b)
PR-head reference: 642a33df (has both features intact)

## Feature 1: Compaction-failure auto-recovery (RFC §5.2)

File: src/auto-reply/reply/agent-runner-execution.ts

What was dropped: Two recovery blocks that wrap compaction-failure errors with auto-reset logic.

- At ~line 2460 on PR-head: `if (!didResetAfterCompactionFailure && isContextOverflowError(...) && await params.resetSessionAfterCompactionFailure(...))`
- At ~line 2590 on PR-head: `if (isCompactionFailure && !didResetAfterCompactionFailure && await params.resetSessionAfterCompactionFailure(...))`

Both blocks: set `didResetAfterCompactionFailure = true`, call `replyOperation?.fail()`, return `kind: final` with `buildContextOverflowRecoveryText(...)`.

Steps:

1. Add `let didResetAfterCompactionFailure = false;` declaration (was removed during drift-cure)
2. Find the `isContextOverflowError` check site and wrap with the auto-recovery logic from PR-head
3. Find the `isCompactionFailure` check site and wrap with the auto-recovery logic from PR-head
4. Use `git show 642a33df:src/auto-reply/reply/agent-runner-execution.ts` to get exact code

## Feature 2: Force-owner-false propagation (security)

Files: src/auto-reply/reply/session-system-events.ts + src/auto-reply/reply/get-reply-run.ts

What was dropped: The function returns `FormattedSystemEventBlock = {text, forceSenderIsOwnerFalse}` instead of just `string`.

1. In session-system-events.ts: add `let forceSenderIsOwnerFalse = false;` in the drain function
2. Add `if (event.forceSenderIsOwnerFalse === true) { forceSenderIsOwnerFalse = true; }` in the event loop
3. Change return type to `FormattedSystemEventBlock | undefined` (return `{text, forceSenderIsOwnerFalse}`)
4. Add wrapper `drainFormattedSystemEvents` that returns just `.text` for legacy callers
5. In get-reply-run.ts: wire `forceSenderIsOwnerFalseFromSystemEvents` from the block return

Use `git show 642a33df:<file>` for exact implementation.

## Verification

After both features restored:

- NODE_OPTIONS=--max-old-space-size=8192 OPENCLAW_VITEST_MAX_WORKERS=1 npx vitest run src/gateway/server-methods/agent.test.ts src/agents/pi-embedded-runner/compact.hooks.test.ts --reporter=verbose
- These 2 test files should go from failing to passing (they test the dropped features)

## After verification

git add -A && git commit --amend --no-edit && git push origin silas/drift-cure-20260522-69255f8f --force

## Journal

Append findings to JOURNAL-feature-restore.md
