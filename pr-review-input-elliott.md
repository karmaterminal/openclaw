# PR Review Input — Elliott 🌻

## Context

This is a fork of `openclaw/openclaw` at `karmaterminal/openclaw`. The branch `feature/context-pressure-squashed` contains a continuation feature: CONTINUE_WORK (agent self-elected turn continuation) + CONTINUE_DELEGATE (agent-elected sub-agent dispatch with bracket syntax `[[CONTINUE_DELEGATE: task]]` and tool `continue_delegate`).

## What to Review

Diff this branch against `origin/main` (the fork's main, which tracks upstream). Consider this as a PR review.

## Key Files

- `src/auto-reply/reply/agent-runner.ts` — main continuation signal parsing, timer scheduling, delegate dispatch
- `src/agents/subagent-announce.ts` — chain-hop continuation from shard completions
- `src/agents/tools/continue-delegate-tool.ts` — the `continue_delegate` tool
- `src/auto-reply/reply/continuation-generation.ts` — generation counter module (extracted for hot-reload)
- `src/auto-reply/reply/continuation-runtime.ts` — single config normalization authority
- `src/auto-reply/tokens.ts` — bracket parsing / signal stripping
- `src/config/types.agent-defaults.ts` — continuation config schema
- `docs/design/continue-work-signal-v2.md` — RFC (ignore stale changelog at the end)
- `FINDINGS.md` — integration test findings from Swim 1-6

## Areas of Concern

1. Are there any remaining race conditions in the timer scheduling (generation guard, tolerance, delayed spawns)?
2. Does the cost accumulation flow correctly through bracket chain hops?
3. Is the system prompt guidance sufficient for a naive openclaw user to discover and use continuation features?
4. Are there any security concerns with the bracket syntax parsing (injection, spoofing)?
5. Does the three-layer architecture (request metadata → SessionEntry → system events) have any leaks?

## Output

Write your findings to `pr-review-codex-elliott.md` in the repo root. Structure:

- P0 findings (blocking)
- P1 findings (important)
- P2 findings (minor)
- Observations (non-blocking notes)
- Verdict (ship/hold/rework)
