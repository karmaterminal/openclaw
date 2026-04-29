# FINAL-STATUS — #334 Slice 3 OTEL adapter

**Status:** ✅ Done. PR open against `cael/325-canonical2`.

## PR

- **#422** — https://github.com/karmaterminal/openclaw/pull/422
- Branch: `silas/334-slice3-otel-adapter` → base `cael/325-canonical2`
- Commit: `26bcce7e69` (silas-dandelion-cult <silas.dandelion.cult@hotmail.com>)
- Title: `feat(diagnostics-otel,continuation-tracer): wire OTEL adapter into setContinuationTracer (#334 Slice 3, F-37-010)`

## Files changed (5, +446 / -1)

- **new** `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts`
  Adapter: `createContinuationOtelTracerAdapter()`; uses dedicated `openclaw.continuation` tracer scope; W3C `traceparent` parent-stitch via `parseDiagnosticTraceparent`; idempotent `end()`; `Error` / non-`Error` recordException paths.
- **new** `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`
  10 unit tests — forwarding, traceparent stitch (sampled+unsampled), malformed-traceparent fallback, status-code mapping, idempotent end.
- **mod** `src/plugin-sdk/diagnostics-otel.ts`
  Re-exports `noopTracer`, `getContinuationTracer`, `setContinuationTracer`, `resetContinuationTracer` and continuation `Span` / `Tracer` / `SpanAttributes` / etc. types.
- **mod** `extensions/diagnostics-otel/src/service.ts`
  `start()` (when `tracesEnabled`): `setContinuationTracer(createContinuationOtelTracerAdapter())`.
  `stopStarted()`: `resetContinuationTracer()` as the first lifecycle step.
- **mod** `extensions/diagnostics-otel/src/service.test.ts`
  +2 lifecycle tests under new describe block "continuation-tracer install/uninstall (#334 Slice 3)" — install-on-start, no-install-when-traces-disabled, reset-on-stop.

## Tests

All green:

| Suite                                                                 | Result                        |
| --------------------------------------------------------------------- | ----------------------------- |
| `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts` | 10 / 10                       |
| `extensions/diagnostics-otel/src/service.test.ts`                     | 23 / 23 (incl. 2 new)         |
| `extensions/diagnostics-otel` (full)                                  | 33 / 33                       |
| `src/infra/continuation-tracer.test.ts`                               | 71 / 71 (no regression)       |
| `src/infra/system-events.test.ts`                                     | 31 / 31 (consumer unaffected) |

## Gates

- `pnpm install --frozen-lockfile` — clean (lockfile up to date; 1270 pkgs)
- `pnpm tsgo` (core prod) — clean
- `pnpm tsgo:extensions` — clean
- `pnpm check:test-types` (`tsgo:core:test` + `tsgo:extensions:test`) — clean
- `pnpm build` — clean (incl. `build:plugin-sdk:dts`, `check-plugin-sdk-exports`)
- `pnpm plugin-sdk:api:check` — baseline unchanged
- `pnpm check:changed` — N/A (no merge-base between this branch and `origin/main`; targeted gates above run instead)

## Deviations from workorder

1. **Adapter location.** Workorder said `src/infra/continuation-tracer-otel-adapter.ts`. Existing untracked file already lived at `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts` — kept there because the extensions-boundary CLAUDE.md explicitly forbids extensions importing from `src/infra/...` and prefers OTEL deps stay inside the diagnostics-otel package. Functionally equivalent; the plugin-sdk re-export covers the boundary that the workorder's `src/infra/` placement was trying to solve.
2. **Test placement.** Adapter unit tests live next to the adapter (`extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`) rather than `src/infra/continuation-tracer-otel-adapter.test.ts`.
3. **`getContinuationTracer` re-export.** Added to `src/plugin-sdk/diagnostics-otel.ts` (matches workorder spec; was missing in the initial pre-staged diff).
4. **End-to-end "emit-helper through registry → OTEL" test.** Not added in the extension test — `src/infra/continuation-tracer.test.ts` already covers `setContinuationTracer` + helper-flow against a hand-rolled tracer fake. Service-level lifecycle test (registry-after-start asserts adapter installed) is in `service.test.ts`.

## Deferred

- **Local `cael/325-canonical2` ref drift.** The local branch points at `96d1304…`, but `origin/cael/325-canonical2` is `29e556e…` (the workorder-cited tip). The PR was opened against the correct origin ref; no action required for this PR, but the local ref is stale and should be either fast-forwarded or pruned by whoever owns it.
- **First `gh pr create` attempt failed** with a misleading "No commits between" GraphQL error despite both refs existing. The REST-API path (`gh api -X POST /repos/.../pulls`) succeeded on the first try with identical inputs. Likely a transient gh-CLI-side issue, not a repo-state issue.

## Journal

- `journal-20260428-183959.log` — full command output (install, tests, typecheck, build, commit, push, PR create).
