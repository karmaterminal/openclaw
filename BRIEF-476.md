# Fix #476 — write tool clobbers memory/day-file paths

## YOUR JOB

Implement and ship a complete, tested, mergeable fix-PR for openclaw#476.

You are NOT done until:

1. `wrapToolMemoryDayFileWriteGuard` is implemented in `src/agents/pi-tools.read.ts` (or sibling file) and exported
2. New `append` tool op is implemented and registered alongside `write`
3. `pnpm tsgo:core:test` passes
4. `pnpm vitest run src/agents/pi-tools.write.guard src/agents/pi-tools.append src/agents/pi-tools.write.message-truthfulness` passes
5. `git commit` made with descriptive message
6. `gh pr create --base elliott/c5-repair-symlink-escape --head fix/476-write-clobber-memory-paths --title "fix(#476): refuse write to memory/day-file paths without explicit overwrite + first-class append op" --body-file PR-BODY-476.md` opens the PR

**TEST-ONLY SCAFFOLDING IS NOT ENOUGH.** A previous session wrote tests then died. Don't repeat that. Implement source first, then tests, then verify, then PR.

## Source-walk verdict

- **Flush wrapper is correct**: `wrapToolMemoryFlushAppendOnlyWrite` in `src/agents/pi-tools.read.ts` (~line 537+) properly appends via `appendMemoryFlushContent` (~line 480+).
- **Bug lives in the unwrapped `write` tool** used outside flush context. No path-shape check; direct overwrite.
- 🌫 reproduced 3× on urudyne (non-flush regular-mode, `path: memory/2026-04-30.md` exact match, no `overwrite` flag, gateway returned text shape `"Appended content to memory/2026-04-30.md."` — but upstream tool returns `"Successfully wrote N bytes to PATH"`, so the misleading "Appended" wording must come from a wrapper or template; check).

## Branch + base (CRITICAL)

- Branch: `fix/476-write-clobber-memory-paths` (already created, currently at `origin/elliott/c5-repair-symlink-escape`)
- Worktree: `/tmp/elliott-476-fix`
- **PR base must be `elliott/c5-repair-symlink-escape`** (NOT `main`) — to match #478/#479 lane topology per cohort decision
- This means your work stacks on top of `0a960498dc` (the SUT SHA), same as the other repair-PRs

## Fix scope (locked)

### 1. Path-shape predicate at unwrapped `write` wrapper

Add a guard wrapper `wrapToolMemoryDayFileWriteGuard` that:

- Detects memory/day-file shape paths (default pattern: `^memory/\d{4}-\d{2}-\d{2}\.md$`; configurable via wrapper options for additional sovereign-file globs)
- If matched AND no explicit `overwrite: true` arg → refuse with structured error pointing to the new `append` op (error message: `"Refusing to overwrite memory/day-file path 'PATH' without explicit overwrite:true. Use the 'append' tool to add content, or pass overwrite:true to confirm intentional clobber."`)
- If matched AND `overwrite: true` is passed → allow with warning prefix in tool result (`"WARNING: Overwrote memory/day-file path 'PATH' (N bytes). Previous content lost."`)
- Non-matching paths pass through unchanged

Place wrapper near `wrapToolMemoryFlushAppendOnlyWrite` in `src/agents/pi-tools.read.ts`. Apply it in the tool registration path (look at how `wrapToolMemoryFlushAppendOnlyWrite` is used in `src/agents/pi-tools.ts` and apply `wrapToolMemoryDayFileWriteGuard` symmetrically — but for the non-flush registration path, NOT inside the flush wrapper).

### 2. First-class `append` op exposed in tool registry

Currently `appendFileWithinRoot` (or similar internal append helper) exists. Surface it as a new tool:

- Tool name: `append`
- Description: `"Append content to an existing file (or create if missing). Use this for memory/day-files and other append-only logs. Returns truthful 'Appended N bytes to PATH' message."`
- Args: `path` (string, required), `content` (string, required)
- Behavior: append content to file (create if missing); workspace-root guard like `write`
- Tool result message: `"Appended N bytes to PATH"` (truthful — actual append happened)
- Register in `src/agents/pi-tools.ts` next to `write`

### 3. Tool-result truthfulness

- Confirm regular `write` tool result message says "Wrote" / "Successfully wrote" / "Created", NEVER "Appended"
- If you find any wrapper that rebrands write → "Appended", remove that bug
- The flush wrapper's "Appended content to {path}." is correct (it appends). Don't break that.

### 4. Tests

The previous session wrote `src/agents/pi-tools.write.guard.test.ts`, `src/agents/pi-tools.append.test.ts`, `src/agents/pi-tools.write.message-truthfulness.test.ts` — but they were lost in a rebase. Re-write them. Suggested cases:

- `wrapToolMemoryDayFileWriteGuard` refuses `memory/2026-04-30.md` without `overwrite`, returns structured error
- `wrapToolMemoryDayFileWriteGuard` allows `memory/2026-04-30.md` with `overwrite:true`, emits warning prefix
- `wrapToolMemoryDayFileWriteGuard` passes through non-matching paths (`README.md`, `src/foo.ts`)
- `wrapToolMemoryDayFileWriteGuard` accepts custom globs via options
- `append` tool creates file if missing, appends to existing file, returns truthful message
- `append` tool respects workspace-root guard
- regular `write` tool returns "Wrote" / "Successfully wrote", NOT "Appended"

## Verification before PR

```bash
cd /tmp/elliott-476-fix
pnpm install  # if needed
pnpm tsgo:core:test
pnpm vitest run src/agents/pi-tools.write.guard src/agents/pi-tools.append src/agents/pi-tools.write.message-truthfulness
```

All green required. Then commit + PR.

## PR body template (write to PR-BODY-476.md before `gh pr create`)

```markdown
## Summary

Fixes #476 — `write` tool clobbers `memory/YYYY-MM-DD.md` paths non-deterministically.

## Root cause

Source-walk (🌻) confirmed:

- `wrapToolMemoryFlushAppendOnlyWrite` in flush context is correct (it appends).
- Bug lives in **unwrapped `write`** path used outside flush context: no path-shape check, direct overwrite.
- 🌫 reproduced 3× on urudyne (non-flush regular-mode, exact `memory/2026-04-30.md` match).

## Fix

1. **`wrapToolMemoryDayFileWriteGuard`** (new) — refuses overwrite of `memory/YYYY-MM-DD.md`-shape paths without explicit `overwrite:true`; suggests `append` op in error message; applied to non-flush write registration.
2. **`append` tool** (new) — first-class append op, callable in non-flush AND filtered-flush sessions; truthful "Appended N bytes" message.
3. **Tests** — guard refusal, guard allow-with-overwrite, append create/extend, write-truthful-message.

## Verification

- [x] `pnpm tsgo:core:test` green
- [x] `pnpm vitest run src/agents/pi-tools.write.guard src/agents/pi-tools.append src/agents/pi-tools.write.message-truthfulness` green

## Lane

- Base: `elliott/c5-repair-symlink-escape` (matches #478/#479 stack)
- Owner: Elliott 🌻 + Silas 🌫 pair (state-vector data)
- Pair receipt: <link to 🌫 emit-site discord msg or comment>

## SWIM-39 row

OV-8 (#837) verifies post-fix surface.

Refs: #476, #478, #479
```

## DO NOT STOP UNTIL PR IS OPEN

If you hit blockers, document them in a comment on #476 with `gh issue comment 476 --repo karmaterminal/openclaw --body "..."` AND in this brief. But don't punt — solve the blocker.

## Cost

Irrelevant. figs's directive: coding-agents are FREE. Use freely.
