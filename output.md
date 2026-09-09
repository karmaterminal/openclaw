# Independent review: PASS

Candidate `95a1d14beeb5732f47fd63d3593ca0cb1056a0da` correctly repairs the
test-composition defect behind [karmaterminal/openclaw#1309](https://github.com/karmaterminal/openclaw/issues/1309).
It does not weaken the reported `turn/start` assertion or replace the production
dynamic-origin boundary with a mock.

By: frond scribe (@scribe-dandelion-cult, acct 2026-05-06) | OpenClaw:
3 PRs, 6 issues, 1 default-branch commit/12mo | GitHub contribution graph:
2466 commits, 1802 PRs, 393 issues, 41 reviews/12mo

## Named-ref contract

Identity was frozen before evidence collection.

| Category | Named ref | Full SHA | Local | Tracking | Server |
|---|---|---|---|---|---|
| Product/base ref | workorder base `b3a572cd3e` | `b3a572cd3ea0082679669baa80f0679332643cf8` | equal | N/A (immutable workorder SHA) | N/A (immutable workorder SHA) |
| Safe lane ref | `codeagent/review-1309-codex-origin` / `origin/codeagent/review-1309-codex-origin` | `95a1d14beeb5732f47fd63d3593ca0cb1056a0da` | equal | equal | equal |
| CI/workflow ref | N/A | N/A | N/A | N/A | N/A |
| Presentation ref | N/A | N/A | N/A | N/A | N/A |
| Docs/proof ref | N/A | N/A | N/A | N/A | N/A |

No Actions, PR, integration, presentation, or deployment workflow was used.
The acceptance path is focused-only, as required by the workorder.

## Finding and invariant

No blocking or non-blocking findings.

The invariant is that Codex dynamic tools are constructed by the admitted host
capability, advertised on the started thread, and then invoked only after the
client has issued `turn/start`. The owning composition boundary is
`extensions/codex/src/app-server/dynamic-tool-build.ts:434`, where the normal
path calls `hostCapabilities.createToolSurface` at line 446. That host method
constructs core tools with the admitted `operationalRunInstance` and authority
contexts in `src/agents/harness/host-capability.ts:518`.

The rejected test installed `dynamicToolBuildState.openClawCodingToolsFactory`
and directly called `createOpenClawCodingTools`. Although the resulting tools
were subsequently bound, their construction bypassed the host-owned production
factory and its admitted run authority. Startup therefore failed before the
mock client observed any app-server method. The candidate removes that
synthetic factory and its unrelated never-resolving timeout probe. Tool setup
now follows the production path, passes `toolBridge.specs` into startup at
`extensions/codex/src/app-server/run-attempt-start.ts:117`, and issues the
actual client request at
`extensions/codex/src/app-server/run-attempt-turn-request.ts:155`.

The retained integration test still:

- waits for and therefore proves an observed `turn/start`;
- sends `item/tool/call` through the registered app-server request handler;
- executes production-created `continue_delegate` and `continue_work` tools;
- checks a rejected invalid continuation call;
- verifies each originating tool span and continuation child span has the
  expected trace parent.

This is not a production behavior change. Production LOC is `+0/-0`; tests are
`+0/-56` (net `-56`).

## Codex protocol evidence

Sibling Codex checkout:
`../codex` at `400ee190c30d5e4a88549c070a2335311f0baa91`,
origin `https://github.com/openai/codex.git`.

Directly inspected:

- `../codex/codex-rs/app-server-protocol/src/protocol/v2/turn.rs:71` defines
  `TurnStartParams`; line 166 defines `TurnStartResponse`.
- `../codex/codex-rs/app-server/src/request_processors/turn_processor.rs:174`
  accepts `turn/start`; line 616 returns the started turn.
- `../codex/codex-rs/app-server-protocol/src/protocol/common.rs:1526` maps the
  client request name `item/tool/call`.
- `../codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:1529` defines
  the dynamic-tool request fields and line 1541 defines its response.
- `../codex/codex-rs/core/src/tools/handlers/dynamic.rs:171` registers and
  awaits the client-owned dynamic-tool response.
- `../codex/codex-rs/app-server/src/bespoke_event_handling.rs:973` projects a
  started dynamic-tool item into `DynamicToolCallParams`, and line 995 sends
  the client request.
- `../codex/codex-rs/app-server/src/dynamic_tools.rs:17` decodes the client
  response and submits `Op::DynamicToolResponse`.

These sources confirm the tested ordering and payload boundary: a started Codex
turn owns dynamic calls, Codex sends `item/tool/call` to the client, and the
client response is submitted back to the active turn.

## Deterministic regression proof

Dependencies were installed in the same-host ordinary clone
`source/openclaw-review-1309-deps` at the exact candidate manifest and lockfile
SHA, then linked into the review worktrees. Initial attempts using the stale
canonical dependency tree failed before collection and were not credited.

Negative control on exact base `b3a572cd3ea0082679669baa80f0679332643cf8`:

```text
OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=300000 node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-misc.config.ts --maxWorkers=1 \
  extensions/diagnostics-otel/src/codex-dynamic-tool-origin.integration.test.ts
```

Result: **1 failed**, at
`extensions/codex/src/app-server/run-attempt-test-harness.ts:574`, with the
expected reason:

```text
expected app-server method turn/start; saw ; mock saw
```

The same command on candidate
`95a1d14beeb5732f47fd63d3593ca0cb1056a0da` passed **1/1**. The retained
assertion observed `turn/start`; the test then completed all three dynamic
continuation calls and origin-span checks.

Nearest request-boundary sibling:

```text
OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=300000 node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-codex-app-server-attempt-extra.config.ts \
  --maxWorkers=1 extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts
```

Result: **15/15 passed**, including scheduled continuation, cancellation,
timeout provenance, request-boundary terminal diagnostics, and result hooks.

Construction and timeout-owner siblings:

```text
OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=300000 node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-codex-app-server-tools.config.ts \
  --maxWorkers=1 \
  codex/src/app-server/dynamic-tool-build.test.ts \
  codex/src/app-server/dynamic-tool-execution.test.ts \
  codex/src/app-server/dynamic-tool-execution.timeout-logging.test.ts
```

Result: **161/161 passed**. These owner tests retain stronger timeout execution,
fallback, provenance, logging, truncation, and post-terminal release coverage
than the removed cross-plugin timeout probe.

Independent autoreview of the exact base-to-candidate branch at P0-P2 was
`scoped-clean` and rated the patch correct with confidence `0.96`.

## Completeness and best-fix verdict

**Best-fix verdict: best.** The candidate removes the test-only construction
path that violated the production composition invariant instead of changing
production code or weakening the observable assertion.

**Alternatives considered:** Retaining the timeout probe while special-casing
host construction would preserve redundant cross-owner coverage and the wrong
factory seam; rejected. Moving timeout behavior into this diagnostics
integration test would duplicate the dedicated execution/timeout owner suites;
rejected. Changing production startup to tolerate tools built without admitted
host authority would weaken the lifecycle boundary; rejected.

**Partial failure and lifecycle coverage:** The retained invalid continuation
call proves a visible failed response. Dedicated siblings cover timeout,
cancellation, bridge rejection, terminal release, and diagnostic cleanup.
There is no persistence, schema, rollback, restart, or recovery behavior change;
base/candidate execution supplies the rollback control, while existing
run-attempt siblings retain lifecycle cleanup coverage.

**Current-main context:** `origin/main` was
`627b1e84acaac3943e7cdc6c53372edb986f1962` during review and has since diverged
substantially, including removal of this historical integration test. Per the
workorder, it was context only and was not substituted for the exact
`b3a572cd3e` to `95a1d14bee` decision boundary.

**Remaining uncertainty:** No broad CI, live Codex binary, or Actions run was
performed because the workorder explicitly forbids those paths. The focused
mock app-server test proves OpenClaw's production composition and exact request
method, while direct Codex source establishes the sibling protocol contract.

## Terminal verdict

**PASS**
