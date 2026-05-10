# OTel evidence regeneration journal

- 2026-05-10T16:44Z: Pushed `ronan/20260510/otel-evidence-regen` recovery checkpoint before analysis.
- 2026-05-10T16:45Z: Tracking issue #972 read through `gh` because GitHub issue MCP returned 404. Read PR #627 and #560 summaries, RFC observability §6.6-§6.8, continuation trace integration substrate, and diagnostics-otel adapter.
- 2026-05-10T16:47Z: Created and pushed OpenClaw sibling branch `ronan/20260510/otel-evidence-regen` off `origin/frond-scribe-copilot/20260510/otel-traceparent-surface`.
- 2026-05-10T16:50Z: Started local Jaeger all-in-one collector on `127.0.0.1:4318` / `127.0.0.1:16686`; verified `/api/services`.
- 2026-05-10T16:52Z: Refreshed OpenClaw dependencies with `pnpm install --frozen-lockfile` after the focused trace propagation test reported missing `@openclaw/fs-safe/config`.
- 2026-05-10T16:53Z: Generated final carrier-only Jaeger exports for A1, A0.2, B3, post-compaction-shard, and negative-control. Positive carrier rows prove the supplied trace-id reaches dispatch/work/compaction/drain spans. A1/A0.2 fire spans remain off-trace because `emitContinuationDelegateFireSpan` and `emitContinuationWorkFireSpan` do not accept `traceparent`.
- 2026-05-10T16:54Z: Wired bootstrap SWIM harness templates to accept optional `traceparent`, inject it into structured tool args with `jq`, and set `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` for local fire steps. Added B3 and post-compaction-shard harness configs.
