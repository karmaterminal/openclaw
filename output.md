# Empty-response recovery investigation

Examined OpenClaw SHA: `ab4761f3fc9a903646a6ac7346ae1091745de79a`

## What changed

No product code, configuration, service, gateway, Discord, issue state, or PR state was changed.
The durable investigation is in `journal-empty-visible-retry.md`.

The current runtime marks an executed `message(send)` replay-unsafe before terminal resolution and
preserves that state across compaction. Empty-response and reasoning-only continuation helpers
reject attempts with that side-effect state. The ordering cited in #1227 is real, but it is not
enough to permit a retry after a normally observed committed delivery.

No safe configuration mitigation exists. Group `silentReply: allow` exists, but interactive
visible turns still retry bare empty/provider-failure stops; `disallow` does not disable recovery.

The incident cannot be attributed without correlating inbound source id, run/attempt id, tool call,
outbound Discord receipt, replay metadata, compaction boundary, and retry event. One run containing
both the committed receipt and retry would prove a framework projection bug; separate runs for the
same inbound id would prove #787's ingress/replay path.

## Validation

```text
171 passed:
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents.config.ts --maxWorkers=1 \
  src/agents/embedded-agent-runner/run.incomplete-turn.test.ts

19 passed:
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.agents-embedded-subscribe.config.ts --maxWorkers=1 \
  src/agents/embedded-agent-subscribe.subscribe-embedded-agent-session.source-reply-suppression.test.ts

Full suite:
node scripts/test-projects.mjs
Result: 46/81 shards passed; 35/81 failed after 1275.36s. The failed-shard digest
included no-output terminations and unrelated broad-suite failures. The focused
190/190 retry/delivery tests above passed.
```

## Uncertainty

The historical log excerpts do not include the correlation bytes needed to distinguish a
same-run terminal retry from duplicate ingress or a combination. Current-source behavior is
high-confidence; historical incident attribution remains low-confidence.

VERDICT: inconclusive
