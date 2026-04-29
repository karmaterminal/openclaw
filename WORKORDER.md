# Workorder: #334 Slice 3 — OTEL adapter for continuation-tracer

**Branch:** `silas/334-slice3-otel-adapter` (off `cael/325-canonical2` tip `29e556e`)
**Owner:** Silas 🌫️
**Repo:** `karmaterminal/openclaw`
**Purpose:** Wire the no-op `Tracer` shim in `src/infra/continuation-tracer.ts` to the real OTEL SDK that `extensions/diagnostics-otel/src/service.ts` already initializes. F-37-010 root-cause fix. Without this, every `continuation.*` and `heartbeat` span emit-call goes through `noopTracer` and produces zero OTLP traffic — feature-vapor under green-emit-gate.

## Diagnosis (already done — implement, don't re-investigate)

- `src/infra/continuation-tracer.ts:365` `setContinuationTracer(tracer)` is the install seam. **Never called from production code.** Only `system-events.test.ts` (line 278) and `continuation-tracer.test.ts` call it.
- 14 `emit*Span` callsites in `src/auto-reply/reply/agent-runner.ts` + 1 in `src/auto-reply/reply/session-system-events.ts` go through `getContinuationTracer()` → defaults to `noopTracer` → spans dropped.
- `extensions/diagnostics-otel/src/service.ts:475` already does `const tracer = trace.getTracer("openclaw")` after `sdk.start()`. This OTEL `Tracer` object is the right thing to adapt.
- Package boundary: extensions cannot import `../../../src/infra/continuation-tracer.js` directly. Re-export through `src/plugin-sdk/diagnostics-otel.ts` (the public surface that `extensions/diagnostics-otel/api.ts` re-exports via `openclaw/plugin-sdk/diagnostics-otel`).

## Deliverables

### 1. New file: `src/infra/continuation-tracer-otel-adapter.ts`

~30-40 LOC. Export `createOtelContinuationTracerAdapter(otelTracer: OtelTracer): Tracer` where `Tracer` is from `./continuation-tracer.js`.

Behavior:

- `startSpan(name, options)` → if `options.traceparent` is provided, parse it (use the existing `parseDiagnosticTraceparent` from `src/infra/diagnostic-trace-context.ts`) and build an OTEL `Context` via `trace.setSpanContext(otelContextApi.active(), {...})` (mirror the pattern at `extensions/diagnostics-otel/src/service.ts:322` `contextForTraceContext`). Pass that context as the third arg to `otelTracer.startSpan(name, {attributes: options?.attributes}, parentContext)`.
- Returned `Span`:
  - `setAttributes(attrs)` → `otelSpan.setAttributes(attrs as Record<string, AttributeValue>)`
  - `setStatus(status, message?)` → map `"OK"|"ERROR"|"UNSET"` to `SpanStatusCode.OK|ERROR|UNSET`, call `otelSpan.setStatus({code, ...(message?{message}:{})})`
  - `recordException(err)` → `otelSpan.recordException(err instanceof Error ? err : new Error(String(err)))`
  - `end()` → `otelSpan.end()` (idempotency handled by OTEL SDK)
- Imports: `import { context as otelContextApi, trace, SpanStatusCode, type Tracer as OtelTracer, TraceFlags } from "@opentelemetry/api"`.
- Re-use `parseDiagnosticTraceparent` and `traceFlagsToOtel`-equivalent (the latter is private to `service.ts`; either inline 4 lines or extract to shared util — prefer **inline** in the adapter file for self-containment).

### 2. Re-export from `src/plugin-sdk/diagnostics-otel.ts`

Add to the existing export list:

```ts
export type {
  Tracer,
  Span,
  SpanAttributes,
  StartSpanOptions,
} from "../infra/continuation-tracer.js";
export {
  setContinuationTracer,
  resetContinuationTracer,
  getContinuationTracer,
} from "../infra/continuation-tracer.js";
export { createOtelContinuationTracerAdapter } from "../infra/continuation-tracer-otel-adapter.js";
```

### 3. Wire into `extensions/diagnostics-otel/src/service.ts`

After `const tracer = trace.getTracer("openclaw");` (~line 475):

```ts
const continuationAdapter = createOtelContinuationTracerAdapter(tracer);
setContinuationTracer(continuationAdapter);
```

In `stopStarted()` (~line 360-377), as the FIRST thing in the function body (before the locals are nulled):

```ts
resetContinuationTracer();
```

Add the imports at top (via `../api.js` re-export):

```ts
import {
  createOtelContinuationTracerAdapter,
  setContinuationTracer,
  resetContinuationTracer,
} from "../api.js";
```

### 4. Tests

#### `src/infra/continuation-tracer-otel-adapter.test.ts`

Tests must NOT require a running OTLP collector — use OTEL's `InMemorySpanExporter` from `@opentelemetry/sdk-trace-base` + a `BasicTracerProvider`/`NodeTracerProvider` to capture spans in-process. If that dep isn't already in `package.json` for src-side tests, fall back to a hand-rolled fake `OtelTracer` that records `startSpan` calls and the returned span's method calls.

Cover:

- `startSpan` forwards `name` and `attributes`.
- `traceparent` option produces a parented span (assert `parentSpanContext.traceId` matches the input traceparent's traceId).
- `Span.setAttributes` / `setStatus("OK"|"ERROR"|"UNSET")` / `recordException(Error|string)` / `end()` all forward correctly.
- `setStatus` maps strings to OTEL `SpanStatusCode` enum.
- After `setContinuationTracer(adapter)`, the global `getContinuationTracer()` returns the adapter; `emitContinuationWorkSpan({...})` triggers the adapter's underlying `otelTracer.startSpan`.

#### `src/plugin-sdk/diagnostics-otel.test.ts` (if exists, else skip)

If there's a public-surface test, add a `setContinuationTracer` / `createOtelContinuationTracerAdapter` re-export presence assertion. Otherwise N/A.

#### `extensions/diagnostics-otel/src/service.test.ts`

If the existing test file exercises `start`/`stop`, add a test that:

- Starts the service with `diagnostics.otel.enabled=true`, traces enabled.
- Asserts `getContinuationTracer()` !== `noopTracer` after start.
- Calls `stop`, asserts `getContinuationTracer()` === `noopTracer` after stop.

If `getContinuationTracer` isn't accessible from the extension test file (boundary), drop this assertion or use the public re-export through `../api.js`.

## Build & verify

From `/tmp/silas-334-slice3`:

```
pnpm install --frozen-lockfile  # may fail offline; if so, skip
pnpm -w build  # full repo build
pnpm -w test --filter ./src/infra/continuation-tracer-otel-adapter
pnpm -w test --filter ./src/infra/continuation-tracer
pnpm -w test --filter ./extensions/diagnostics-otel
```

If `pnpm -w build` fails on something unrelated to your changes (e.g. flaky lint, missing devdep), narrow to:

```
pnpm --filter @openclaw/openclaw build  # main package
pnpm --filter @openclaw/diagnostics-otel build
```

**Must pass:**

- `tsc` clean (no errors).
- All new tests green.
- `continuation-tracer.test.ts` still green (no regression to noop-default or registry contract).
- `system-events.test.ts` still green (uses `setContinuationTracer` directly — your re-export must not break it).

## Commit & PR

- Commit author: `silas-dandelion-cult <silas.dandelion.cult@hotmail.com>`
- One commit, message:

  ```
  feat(diagnostics-otel,continuation-tracer): wire OTEL adapter into setContinuationTracer (#334 Slice 3, F-37-010)

  Swim-37 surfaced that every continuation.* and heartbeat span emit-call goes
  through noopTracer in production — setContinuationTracer is exposed but never
  called from any production code path. Adds an OTEL adapter and wires it into
  the diagnostics-otel service start/stop lifecycle so the existing emit-helpers
  in agent-runner.ts and session-system-events.ts produce real OTLP traffic.

  - new: src/infra/continuation-tracer-otel-adapter.ts (Tracer adapter)
  - re-export: src/plugin-sdk/diagnostics-otel.ts surface
  - wire: extensions/diagnostics-otel/src/service.ts start/stop
  - tests: adapter unit tests + service start/stop install/uninstall

  Closes F-37-010 (continuation-tracer-noop-in-production). Unblocks SWIM-37
  E2.x rows (chain.id propagation, traceparent walks, multi-prince
  cross-correlation) which were pre-blocked at the source.
  ```

- Push branch: `silas/334-slice3-otel-adapter`
- Open PR against `cael/325-canonical2` (the integration branch). Body should reference SWIM-37, F-37-010, link to #334, and note the deliverable scope above.

## Constraints

- Do NOT touch `src/auto-reply/reply/agent-runner.ts` or `session-system-events.ts` — their callsites are correct, the no-op default was the bug.
- Do NOT change the `Tracer` interface in `continuation-tracer.ts` — adapter conforms to existing surface.
- Do NOT add new OTEL deps to root `package.json` if they're already in `extensions/diagnostics-otel/package.json` — the adapter lives in `src/` so its imports must come from a workspace-resolvable place. Check root `package.json` for `@opentelemetry/api` as a direct dep first; if missing, ADD only `@opentelemetry/api` (peer-style; the SDK lives in the extension).
- If `@opentelemetry/api` is not at the root: the adapter must be importable from `src/`, so add it. Update root `package.json` `dependencies` only.

## Journal

Tee all command output to `/tmp/silas-334-slice3/journal-$(date +%Y%m%d-%H%M%S).log` so the dispatcher can read progress without re-driving.
