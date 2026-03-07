# PR Review Task

You are reviewing a PR candidate for the openclaw/openclaw upstream repository.

## Branch

- Source: `feature/context-pressure-squashed` (this branch)
- Target: `main`

## What the PR adds

1. **Context-pressure detection** — pre-run injection when context window approaches capacity
2. **Agent self-elected continuation** — `CONTINUE_WORK` signal for multi-turn tasks
3. **`continue_delegate` tool** — agent-dispatched sub-agents with timed dispatch, silent returns, wake-on-return, and chain tracking (cost caps, depth limits)
4. **Sub-agent chain hops** — bracket-parsed continuation from sub-agent findings
5. **Post-compaction lifecycle dispatch** — `| post-compaction` mode that fires delegates after context compaction
6. **172 tests** covering all continuation features

## Your job

Review the code changes ONLY. Do not modify any files. Write your review to a file.

Focus on:

1. **Correctness** — Are there bugs, race conditions, or edge cases?
2. **Security** — Can agents abuse continuation to run away with cost? Are chain tracking bounds enforced?
3. **Integration risk** — Does this break existing functionality? Are there coupling concerns?
4. **Code quality** — Naming, structure, duplication, error handling
5. **Test coverage** — Are the 172 tests covering the right things? Any gaps?
6. **RFC quality** — Is the design doc at `docs/design/continue-work-signal-v2.md` clear and complete?

## How to review

Run: `git diff main..feature-context-pressure-squashed -- src/ docs/` to see the changes.
Or look at the key files:

- `src/agent-runtime/continuation/` — core continuation logic
- `src/agent-runtime/tools/continue-delegate.ts` — the tool
- `src/agent-runtime/tools/continue-delegate-store.ts` — pending delegate storage
- `src/agent-runtime/context-pressure.ts` — pressure detection
- `src/agent-runtime/agent-runner.ts` — post-run signal processing
- `src/agent-runtime/get-reply-run.ts` — pre-run injection
- `docs/design/continue-work-signal-v2.md` — RFC

## Output

Write your review to ONE of these files (based on which agent you are):

- `pr-review/review-codex.md`
- `pr-review/review-claude.md`
- `pr-review/review-copilot.md`

Format: markdown with sections matching the focus areas above. Be specific — cite file paths and line numbers. Flag severity (critical/major/minor/nit).
