# Seam rationale: src/logging/diagnostic.ts

Three-way basis:

- Base: v2026.5.3 diagnostic heartbeat and liveness warning path.
- v2026.5.4 side: widened diagnostic work snapshot, phase/recent phase fields, richer work labels, cron/session-context formatting, terminal-progress handling.
- Feature side: continuation queue metrics provider, queue sample event, continuation queue log suffix, motion-vs-presence warn split.

Resolution:

- Kept the v2026.5.4 `DiagnosticWorkSnapshot` shape with active/waiting/queued counts plus bounded work labels.
- Kept v2026.5.4 phase and recent-phase collection in `emitDiagnosticLivenessWarning`.
- Threaded feature `DiagnosticContinuationQueueMetrics` through the v2026.5.4 warning event payload and heartbeat sampling path.
- Preserved the cosigned warn predicate: `hasBlockingWork || (hasOpenDiagnosticWork(work) && hasSustainedEventLoopDelay) || hasContinuationQueueWarn`.
- Preserved sustained delay as p99-only and kept continuation queue depth-only activity debug/event-only; warn escalation uses queue motion only.
