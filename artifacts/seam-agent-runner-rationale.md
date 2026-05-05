# Seam rationale: src/auto-reply/reply/agent-runner.ts

Three-way basis:

- Base: v2026.5.3 auto-reply runner.
- v2026.5.4 side: send-policy import/wiring, queued-followup drain handling, session reset/restart fixes, and post-compaction delegate release/persistence.
- Feature side: continuation signal handling, `continue_delegate` consumption, cross-session targeting, fanout, and traceparent propagation.

Resolution:

- Kept both imports: v2026.5.4 `resolveSendPolicy` and feature `defaultRuntime` continuation logging.
- Preserved v2026.5.4 queued-followup drain behavior for truly empty runs, but guarded it so silent continuation and queued delegate work still flow into the continuation dispatch path.
- Kept v2026.5.4 post-compaction delegate dispatch/release and feature continuation delegate consumption.
- Preserved feature cross-session targeting fields: `continuationTargetSessionKey`, `continuationTargetSessionKeys`, `continuationFanoutMode`, and `traceparent`.
- Preserved thread/session forwarding (`agentThreadId`, originating target context) when spawning delegated continuation work.
