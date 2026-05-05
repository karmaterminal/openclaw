# Seam rationale: src/agents/openclaw-tools.ts

Three-way basis:

- Base: v2026.5.3 OpenClaw tool registration.
- v2026.5.4 side: live session-tool config through `getRuntimeConfig`, refreshed session tool wiring, and update-plan registration refinements.
- Feature side: continuation tools `continue_work`, `continue_delegate`, and `request_compaction` plus continuation-aware factory options.

Resolution:

- Kept v2026.5.4 `sessionToolConfig` and applied it to session tools while preserving `runSessionKey` for `session_status`.
- Kept v2026.5.4 update-plan inclusion logic.
- Preserved feature continuation option shape: `drainsContinuationDelegateQueue`, `continueWorkOpts`, and `requestCompactionOpts`.
- Registered `continue_work`, `continue_delegate`, and `request_compaction` only when continuation is enabled, preserving the feature's gating and the v2026.5.4 tool ordering.
