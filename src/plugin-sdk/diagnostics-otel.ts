// Narrow plugin-sdk surface for the bundled diagnostics-otel plugin.
// Keep this list additive and scoped to the bundled diagnostics-otel surface.

export type { DiagnosticEventPayload } from "../infra/diagnostic-events.js";
export type { DiagnosticTraceContext } from "../infra/diagnostic-trace-context.js";
export {
  emitDiagnosticEvent,
  onDiagnosticEvent,
  onInternalDiagnosticEvent,
} from "../infra/diagnostic-events.js";
export {
  createChildDiagnosticTraceContext,
  createDiagnosticTraceContext,
  formatDiagnosticTraceparent,
  isValidDiagnosticSpanId,
  isValidDiagnosticTraceFlags,
  isValidDiagnosticTraceId,
  parseDiagnosticTraceparent,
} from "../infra/diagnostic-trace-context.js";
export { redactSensitiveText } from "../logging/redact.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
// Continuation-tracer surface so the diagnostics-otel plugin can install a
// real OTEL adapter against the noop default after sdk.start().
export {
  getContinuationTracer,
  noopTracer,
  resetContinuationTracer,
  setContinuationTracer,
} from "../infra/continuation-tracer.js";
export type {
  Span as ContinuationSpan,
  SpanAttributes as ContinuationSpanAttributes,
  SpanAttributeValue as ContinuationSpanAttributeValue,
  SpanStatus as ContinuationSpanStatus,
  StartSpanOptions as ContinuationStartSpanOptions,
  Tracer as ContinuationTracer,
} from "../infra/continuation-tracer.js";
export type {
  OpenClawPluginApi,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
} from "../plugins/types.js";
