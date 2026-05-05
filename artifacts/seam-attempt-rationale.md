# Seam rationale: src/agents/pi-embedded-runner/run/attempt.ts

Three-way basis:

- Base: v2026.5.3 embedded attempt construction.
- v2026.5.4 side: widened attempt tool-run context helper, sandbox spawn workspace routing, live session key plumbing, and provider system-prompt transform helper.
- Feature side: continuation-aware attempt diagnostics and continuation option threading into OpenClaw coding tools.

Resolution:

- Kept v2026.5.4 `buildEmbeddedAttemptToolRunContext({ ...params, trace: runTrace })`, sandbox spawn workspace routing, and live `runSessionKey` behavior.
- Added feature `continueWorkOpts`, `requestCompactionOpts`, and `drainsContinuationDelegateQueue` to `createOpenClawCodingTools`.
- Kept v2026.5.4 system prompt construction and added feature `continuationEnabled` to the prompt input.
- Preserved v2026.5.4 provider transform context instead of reverting to the older direct prompt assembly shape.
