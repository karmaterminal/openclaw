# Seam rationale: src/logging/diagnostic.test.ts

Three-way basis:

- Base: v2026.5.3 diagnostic tests.
- v2026.5.4 side: tests for phase labels, widened work labels, recent phase summaries, and stale terminal-progress diagnostics.
- Feature side: continuation queue metrics provider tests, queue sample/event assertions, transient max-spike debug-only coverage, and depth-only queue-no-warn coverage.

Resolution:

- Kept both imports: `withDiagnosticPhase` from the v2026.5.4 side and `registerDiagnosticContinuationQueueMetricsProvider` from the feature side.
- Preserved v2026.5.4 widened work/phase expectation shape.
- Preserved continuation queue coverage and the depth-only/no-warn distinction.
- Preserved transient event-loop max spike coverage so p99 remains the sustained-delay warning seam.
