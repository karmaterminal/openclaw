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

## Final analysis

### Terminal ordering and committed delivery

At authoritative SHA `ab4761f3fc9a903646a6ac7346ae1091745de79a`, the inspected chain is:

1. `src/agents/tool-mutation.ts:336-386` treats `message(action=send)` as mutating and
   replay-unsafe.
2. `src/agents/embedded-agent-subscribe.handlers.tools.ts:1451-1519` records
   `hadPotentialSideEffects: true` as soon as the invocation executed. The same handler records
   successful text/media/target delivery at
   `src/agents/embedded-agent-subscribe.handlers.tools.ts:1521-1573`.
3. `src/agents/embedded-agent-runner/run/attempt-result.ts:276-299` merges those facts into
   `attempt.replayMetadata`.
4. `src/agents/embedded-agent-runner/run/incomplete-turn.ts:652-668` rejects all non-visible-turn
   retries when `attempt.replayMetadata.hadPotentialSideEffects` is true.
5. `src/agents/embedded-agent-runner/run/terminal-resolution.ts:220-307` calculates retry
   instructions before `readTerminalToolPresentation()`, but a normally observed committed send
   has already made both retry instructions null.

Therefore the ordering called out in #1227 is real but is not, by itself, an executable duplicate
path. A continuation after a committed send requires the send to have bypassed or lost the replay
state/delivery projection, or the log lines to belong to different runs/source events.

Compaction does not establish that bypass. In
`src/agents/embedded-agent-subscribe.ts:1325-1377`, reset clears presentation arrays but preserves
attempt-wide side-effect truth. `message(send)` has already marked the replay state before its
result is projected. A tool-only terminal response is likewise guarded by the same replay metadata.

### Group silent-empty policy

`src/auto-reply/reply/get-reply-run-context.ts:143-182` classifies Discord group/channel turns and
sets `allowEmptyAssistantReplyAsSilent` when the resolved group policy is `allow`.
`src/shared/silent-reply-policy.ts:10-13` defaults group silence to `allow`; the supported config
surfaces are `agents.defaults.silentReply.group` and `surfaces.<id>.silentReply.group`.

This is not a safe mitigation for the reported interactive turn. In
`src/agents/embedded-agent-runner/run/incomplete-turn.ts:671-713`, a visible interactive turn still
owes a reply unless the model explicitly emitted `NO_REPLY`; bare empty and reasoning-only stops
remain provider failures. Setting the policy to `disallow` also does not disable continuation.
There is no supported configuration option for the empty-response retry limit. No verified
configuration mitigation exists.

### Classification and relationship to #787

The two quoted log lines are insufficient to correlate the duplicate:

- `empty response detected ... visible-answer continuation` identifies a retrying run, but the
  excerpt does not show the source Discord message id, tool call id, or outbound receipt.
- `visible channel turn dispatched with no queued reply payloads` is emitted by
  `src/channels/turn/execution.ts:84-117` when the dispatch result has neither queued payloads nor
  an observed delivery signal. It does not prove that the same run previously committed a send.

The byte evidence needed to discriminate is:

- inbound Discord event/message id, account, channel, and thread;
- OpenClaw run id, attempt id, and session key;
- `message(send)` tool-call id and committed outbound Discord message id/receipt;
- the attempt's `messagingToolSentTexts`, `messagingToolSentMediaUrls`,
  `messagingToolSentTargets`, `didSendViaMessagingTool`, and
  `replayMetadata.hadPotentialSideEffects`;
- compaction reset boundaries and the retry warning;
- all inbound admission records for the source id.

One source id and one run containing both the committed outbound receipt and later retry proves a
terminal/projection bug. Two runs admitted for the same source id prove the ingress/replay path
tracked by #787. Two source admissions plus an intra-run retry prove a combination. On the current
record, ingress/replay is at least as plausible as terminal retry, and neither is proven.
Confidence is high that the normal current-source `message(send)` path cannot request this retry;
confidence in the historical incident's cause is low without the correlation bytes.

### Minimal durable repair and regression coverage

No product change is justified until a failing trace or regression test shows where committed
delivery evidence is lost. The first durable change should be the missing regression:

1. Add `does not retry an empty terminal turn after committed messaging delivery` beside the
   reasoning-only case in `src/agents/embedded-agent-runner/run.incomplete-turn.test.ts`. Return a
   successful committed `message(send)` projection followed by an empty terminal assistant and
   assert one embedded attempt, no continuation prompt, and no queued fallback payload.
2. Add a compaction variant in
   `src/agents/embedded-agent-runner/run.overflow-compaction.loop.test.ts` proving the sticky
   `hadPotentialSideEffects` bit survives reset and still suppresses empty recovery.
3. Add a source-event integration in
   `src/auto-reply/reply/agent-runner.runreplyagent.e2e.test.ts`: one Discord group source event,
   one successful `message(send)`, then an empty terminal stop; assert exactly one outbound visible
   delivery and no second model attempt.

If that integration fails, repair the projection boundary that drops the fact: carry an explicit
sticky `committedPublicDelivery` state from the successful tool receipt through compaction into
`EmbeddedRunAttemptResult`, and have `resolveEmbeddedRunTerminal()` short-circuit reasoning-only,
missing-assistant, empty-response, and settled-tool continuation before activating any retry
prompt. Do not use generic terminal presentation as a proxy for delivery.

Instrumentation should put source message id, run id, attempt id, tool-call id, outbound receipt
id, retry reason, silent-empty decision, and committed-public-delivery/replay state in one
correlatable event.

## Validation and command log

```text
git fetch origin --prune
git worktree add --detach /tmp/oc-empty-visible-retry origin/main
gh issue view 1227 --repo karmaterminal/openclaw --json ...
gh issue view 787 --repo karmaterminal/openclaw --json ...
gitcrawl doctor --json
gitcrawl threads openclaw/openclaw --numbers 1227,787 --include-closed --json
pnpm install
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents.config.ts --maxWorkers=1 \
  src/agents/embedded-agent-runner/run.incomplete-turn.test.ts
  Result: 171 passed.
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.agents-embedded-subscribe.config.ts --maxWorkers=1 \
  src/agents/embedded-agent-subscribe.subscribe-embedded-agent-session.source-reply-suppression.test.ts
  Result: 19 passed.
node scripts/test-projects.mjs
  Result: 46/81 shards passed; 35/81 failed after 1275.36s. The failed-shard digest
  included no-output terminations and unrelated broad-suite failures. The focused
  190/190 retry/delivery tests above passed.
```

The local gitcrawl archive was fresh to 2026-08-06 but did not contain these fork-local issues,
so attribution uses the live `gh issue view` payloads.

VERDICT: inconclusive
