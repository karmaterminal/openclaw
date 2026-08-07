# Empty-response recovery / duplicate visible reply investigation

## Scope and refs

- Issue: https://github.com/karmaterminal/openclaw/issues/1227
- Related ingress issue: https://github.com/karmaterminal/openclaw/issues/787
- Assigned lane base: `e0248fc11f1a5275753c92d66f21159ae6a1cfb9`
- Authoritative ref examined in fresh `/tmp/oc-empty-visible-retry` worktree:
  `ab4761f3fc9a903646a6ac7346ae1091745de79a` (`origin/main`, fetched 2026-08-07)
- Note: the assigned lane and fetched `origin/main` have no merge base. Investigation uses
  the fetched authoritative ref; this journal is committed only to the assigned reporting lane.

## Checkpoint: source trace

The current source does evaluate empty/reasoning retry eligibility before it consumes the
generic terminal tool presentation, but a normal successful `message(send)` does not rely on
that presentation:

1. `src/agents/embedded-agent-subscribe.handlers.tools.ts` classifies `message(send)` as
   replay-unsafe and merges `hadPotentialSideEffects: true` into sticky replay state when the
   invocation executes.
2. A successful send also commits text/media/target evidence into the embedded subscription.
3. `src/agents/embedded-agent-runner/run/attempt-result.ts` projects both the sticky replay state
   and committed message evidence into `EmbeddedRunAttemptResult`.
4. `src/agents/embedded-agent-runner/run/incomplete-turn.ts` rejects reasoning-only and empty
   retries when `attempt.replayMetadata.hadPotentialSideEffects` is true.
5. `src/agents/embedded-agent-runner/run/terminal-resolution.ts` computes retry instructions
   before reading the generic terminal presentation, but those instructions are already null
   when committed message delivery evidence reached the attempt contract.

Compaction clears per-attempt presentation arrays, but sticky replay state is retained. Existing
coverage proves source-reply rendering stays suppressed across compaction; exact end-to-end
coverage for `message(send)` + compaction + empty terminal stop + one visible emission is absent.

## Commands so far

```text
git fetch origin --prune
git worktree add --detach /tmp/oc-empty-visible-retry origin/main
gh issue view 1227 --repo karmaterminal/openclaw --json ...
gh issue view 787 --repo karmaterminal/openclaw --json ...
gitcrawl doctor --json
gitcrawl threads openclaw/openclaw --numbers 1227,787 --include-closed --json
```

The local gitcrawl archive was fresh to 2026-08-06 but did not contain these fork-local issues,
so attribution uses the live `gh issue view` payloads.
