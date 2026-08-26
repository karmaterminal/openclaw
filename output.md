# R-CD-2 originating typed-tool span cure

Status: **complete; focused-only successor ready for runtime-composite integration
and a single R-CD-2 live refire**.

Bound issue: `karmaterminal/openclaw#1251` remains open.

Code successor before this report-only commit:
`cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3`.

## Named-ref contract

The safe lane was published unchanged at the rejected base before any evidence
was credited. The final code successor was then pushed and checked equal across
local, tracking, and server refs.

| Category | Named ref | Local SHA | Tracking SHA | Server SHA | Equality |
|---|---|---|---|---|---|
| Product/base | `karmaterminal/openclaw@2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | N/A (immutable commit) | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | local = server |
| Safe lane, initially published | `karmaterminal/openclaw:codeagent/129388-typed-tool-span-live-cure` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | local = tracking = server |
| Safe lane, final code | `karmaterminal/openclaw:codeagent/129388-typed-tool-span-live-cure` | `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` | `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` | `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` | local = tracking = server |
| CI/workflow | Focused-only owner proof; Mode-B N/A by workorder | N/A | N/A | N/A | N/A |
| Presentation | `karmaterminal/openclaw:codeagent/85651-upstream-1ba243c8-gates` | `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` | `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` | `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` | local = tracking = server; read-only |
| Docs/proof | `karmaterminal/karmaterminal-openclaw-docs@dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | local = tracking = server; read-only |

This report commit changes no product, presentation, workflow, proof-corpus, or
runtime-composite bytes. The branch-tip equality check is repeated after the
report commit and recorded in the mandatory COMPLETE receipt.

## Steward safety interrupt and direct rerun

A steward safety interrupt arrived after three Explore workers had been
launched and while an exact GitNexus index was still building. The index was
stopped rather than awaited indefinitely. All three delegated scopes were
invalidated: they produced zero credited turns, their outputs are treated as
nonexistent, and no delegated claim appears in this verdict.

Every consequential source trace, hypothesis, history check, regression,
four-way control, test selection, static gate, failure classification, and final
review was rerun directly in the lead GPT-5.6 session after the interrupt. No
Explore, task, code-review, Opus, or other AI subagent contributed to the
successor. The repository's ordinary autoreview agent gate was explicitly
opted out by the steward's no-AI-subagent instruction; the complete final diff
was reviewed directly instead.

## Frozen live evidence

Read-only evidence:

- failure handoff
  `karmaterminal/karmaterminal-openclaw-docs@dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed:output.md`;
- Project-81 run `32981265676`, artifact `9612027467`;
- product predecessor cure
  `codeagent/129388-typed-trace-cure@90259305e86c24e3e9d7a1cea2e13c98c300168c`;
- convergence handoff from the exact `2f9b9b7a...` convergence worktree;
- live issue `karmaterminal/openclaw#1251`.

The artifact was downloaded read-only and contained 122 files. The signed
R-CD-2 authority remained:

```text
verdict=PARTIAL-candidate
failureCategory=missing-continuation-topology
integrity=hmac-sha256-gateway-token-v1
```

The trace collector repeatedly received one reason-bound trace after initial
settlement. Its exact terminal error was:

```text
Tempo trace did not reach valid continuation topology before timeout:
matched trace lacks the originating continue_delegate tool span
```

The collector contract requires the typed `openclaw.tool.execution`, accepted
`continuation.delegate.dispatch`, and `continuation.delegate.fire` spans to
share one trace. Backend `totalBlocks` remained unavailable, so
`countAuthority=false` and backend status stayed honestly `partial`; that is
independent of the missing topology.

No live row was fired in this lane.

## GitNexus disclosure

Only the installed prebuilt fork was used:

| Item | Identity |
|---|---|
| Fork | `karmaterminal/GitNexus` |
| Version | `1.6.5` |
| Executing source | `/home/figs/src/gitnexus/gitnexus` |
| Fork SHA | `3c1e686edfc1acaac882927cada121ddd7c47bcc` |
| Wrapper | `/home/figs/.local/bin/gitnexus` |
| Wrapper SHA-256 | `8309aeb6858023f5cb3ff4ae8416b64c1989e4fe04d82dd822964127ed1355ca` |
| Built CLI SHA-256 | `00f67e34c0ef3a7ea5f1665247699f47e7e2eab2dc233a504fe95d9aa11d8590` |

The exact-lane index did not complete before the steward interrupt and was
stopped. Query, context, and Cypher navigation were rerun against the available
fork index `openclaw-continuation-current-upstream-absorb@09b553e5fc7c2b3a26954046c1d9f52c55af4b40`;
that stale index received no verdict credit. Exact source at
`2f9b9b7a90988190a149208cbbad68558d1d7daa`, exact history, tests, and frozen
artifact bytes are the authority. No stock `npx`/npm GitNexus or graph package
was used.

## Root cause

### Invariant

When the common tool executor emits `tool.execution.started`, the logical child
context naming that exact tool span must remain active for the tool
implementation. Runtime-owned child work can then resolve the exporter-owned
`openclaw.tool.execution` span. Hooks and approval policy remain on the
enclosing run scope.

### Owning composition boundary

`src/agents/agent-tools.before-tool-call.wrapper.ts:326` creates the logical
tool child and `src/agents/agent-tools.before-tool-call.wrapper.ts:528` emits
the trusted start event. Diagnostics-otel synchronously prepares and registers
the concrete tool span before implementation launch.

Before this cure, `src/agents/agent-tools.before-tool-call.wrapper.ts:537`
invoked the implementation without installing that child context. The active
scope therefore remained the enclosing harness scope. The three typed
continuation tools correctly read the active context through
`formatCurrentSpanContinuationTraceparent()`, but the active fact was the wrong
owner:

- `src/agents/tools/continue-delegate-tool.ts:485`;
- `src/agents/tools/continue-work-tool.ts:68`;
- `src/agents/tools/request-compaction-tool.ts:189`.

The deterministic rejected control proved the exact producer error: a real
`continue_work` call through agent-core persisted the exported harness span ID,
bypassing the separately exported tool span.

### Four investigated failure classes

| Hypothesis | Verdict | Direct proof |
|---|---|---|
| Tool span is never created | Rejected | The production event bus, propagation bridge, tool recorders, and in-memory OTLP boundary export two distinct `openclaw.tool.execution` spans. |
| Tool span is created under a different active context/topology | **Confirmed** | The test-only rejected commit persists the active harness span while the real tool span is a child of the current run. |
| Exporter filtering or lifetime drops it | Rejected | The unchanged production diagnostics handler starts, ends, and exports both tool spans; provider shutdown and diagnostic draining are clean. |
| Only another executor/tool class creates spans | Rejected for the reported path | The failure reproduces through the real agent-core tool executor and private execution preparer. The wrapper/adapter/code-mode owner suite remains green. |

## Canonical fix

`src/agents/agent-tools.before-tool-call.wrapper.ts:538` now builds the exact
implementation call and `src/agents/agent-tools.before-tool-call.wrapper.ts:546`
installs the already-created logical tool context only around that call.
AsyncLocalStorage restores the enclosing scope on resolve or rejection.

Consequences:

- typed continuation capture resolves the concrete tool span, not the harness
  or run span;
- delayed TaskFlow dispatch/fire spans inherit the tool span after SQLite
  restart;
- consecutive turns retain distinct run and tool identities;
- hooks, validation, approvals, source guards, and terminal recording preserve
  their existing ordering;
- background/media stable-parent behavior remains unchanged because
  `formatActiveContinuationTraceparent()` still deliberately selects the active
  tool context's parent.

No proof nonce, row name, seat name, content capture, sampling default, config,
protocol, schema, persistence shape, plugin SDK surface, generic fleet
telemetry, or stable-parent media policy changed.

## Regression controls

### Exact rejected base plus new test: RED

Test-only commit:
`2fdc26199425112dd5670bb4dc6dba02d3f84691`; its parent is exactly
`2f9b9b7a90988190a149208cbbad68558d1d7daa`.

```bash
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-misc.config.ts \
  --maxWorkers=1 \
  extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts \
  -t 'exports the typed-tool origin' \
  --reporter=verbose \
  --testTimeout=30000
```

Expected RED:

```text
typed continuation must not bypass its tool span through the harness scope
expected <harness-span-id> not to be <same-harness-span-id>
```

### Successor: GREEN

The identical test passed after applying the production patch:

```text
1 passed, 2 skipped
```

The complete file passed `3/3`.

### Patch-only revert: RED

The production patch was removed while the regression test remained unchanged.
The production source had zero diff from test-only commit `2fdc2619942`, and
the same command failed for the same harness-span bypass.

### Reapply: GREEN

Reapplying only the production patch made the unchanged regression pass again.
The committed fix is
`6a32ab7522d1d78c98ecffa14f981b682596af00`; final test-only typing cleanup
does not alter runtime or assertions.

## Focused validation

All Vitest commands used the repository runner and one worker.

| Surface | Result |
|---|---:|
| Production diagnostics adapter + actual executor + SQLite TaskFlow restart | 3 passed |
| Diagnostics adapter unit sibling | 16 passed |
| All three typed continuation tools + media stable-parent sibling | 118 passed |
| Common wrapper, private preparer, adapter, code-mode, abort/error E2E | 62 passed |
| Continuation tracer + diagnostic event bus | 74 passed |
| Diagnostic AsyncLocalStorage context | 14 passed |
| Delayed/restart trace propagation sibling | 1 passed |
| **Unique focused total** | **288 passed, 0 failed** |

Exact commands:

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-misc.config.ts --maxWorkers=1 \
  extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts \
  extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-tools.config.ts --maxWorkers=1 \
  src/agents/tools/continuation-tools.current-span-traceparent.test.ts \
  src/agents/tools/continue-delegate-tool.test.ts \
  src/agents/tools/continue-work-tool.test.ts \
  src/agents/tools/request-compaction-tool.test.ts \
  src/agents/tools/media-generate-background-shared.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.e2e.config.ts --maxWorkers=1 \
  src/agents/agent-tools.before-tool-call.integration.e2e.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.infra.config.ts --maxWorkers=1 \
  src/infra/continuation-tracer.test.ts \
  src/infra/diagnostic-events.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast.config.ts --maxWorkers=1 \
  src/infra/diagnostic-trace-context.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-core.config.ts --maxWorkers=1 \
  src/auto-reply/continuation/trace-context-propagation.integration.test.ts
```

The executor E2E preflight detected stale dist, ran the repository build, and
completed all 11 tsdown invocations, bundled plugin assets, runtime postbuild,
plugin control-plane load checks, and CLI build before its 62 tests passed.

Production/test type and static proof:

```bash
node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental \
  --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo
node scripts/run-tsgo.mjs -p tsconfig.extensions.json --incremental \
  --tsBuildInfoFile .artifacts/tsgo-cache/extensions.tsbuildinfo
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json --incremental \
  --tsBuildInfoFile .artifacts/tsgo-cache/extensions-test.tsbuildinfo
node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.core.json \
  src/agents/agent-tools.before-tool-call.wrapper.ts
node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.extensions.json \
  extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts
node_modules/.bin/oxfmt --check \
  src/agents/agent-tools.before-tool-call.wrapper.ts \
  extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts
```

`check:changed` passed conflict, max-lines, assertion-safety, attribution,
doctor, wildcard-export, duplicate coverage, coercion, dependency pin, format,
deprecated API, plugin boundary, wrapper-shadowing, patch, dead-export, and
core-production type gates. Its later core-test type aggregate stopped on the
exact-base-identical `ui/vite.config.ts:8` missing-`pako` declaration.

The remaining selected guards were run directly and passed: native state
schema version, database-first, media helper, runtime sidecar, import cycles,
webhook body order, and all pairing/auth guards.

Exact-base classifications:

| Gate | Successor | Exact base `2f9b9b7a...` | Classification |
|---|---|---|---|
| Core test type aggregate | Missing `pako` declaration at `ui/vite.config.ts:8` | Identical error | Unchanged dependency/UI debt |
| Extension-test core-import guard | Reports the nine existing direct core imports in this diagnostics integration test | Same nine imports | Pre-existing test-boundary debt; this cure added no tenth core import |

No failing baseline/inventory/ignore file was edited or weakened.

## Persistence, restart, rollback, and partial failure

- The regression writes the continuation election through the real shared-state
  SQLite TaskFlow store.
- It clears in-memory timers and the TaskFlow registry without erasing SQLite,
  reloads both rows, advances their delay, claims them, and emits fire spans
  from the restored traceparent.
- The downstream turn intentionally encounters a missing test session after
  fire emission, exercising the existing non-success path without masking the
  trace invariant.
- Two consecutive turns under one harness produce two run spans, two tool
  spans, two persisted traceparents, and two independent chain IDs.
- Runtime rollback requires no migration: no state schema, record shape,
  protocol, or config changed. Removing the code patch deterministically
  restores the harness-bypass RED.

## Changed paths and LOC

| Surface | Added | Deleted | Net |
|---|---:|---:|---:|
| Production | 14 | 7 | +7 |
| Tests | 344 | 211 | +133 |
| Product + tests | 358 | 218 | +140 |

Changed product/test paths:

```text
src/agents/agent-tools.before-tool-call.wrapper.ts
extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts
```

The production growth is the smallest clear owner-boundary expression found:
one imported scope primitive, one named implementation closure, the
conditional scope install, and the required lifecycle comment. Removing the
closure or duplicating the tool call made the critical ordering less legible.
No new helper, file, fallback, or compatibility path was added.

The test replaces the earlier manually driven recorder/raw-tool proof. It does
not duplicate that proof: it closes the missing executor/context/event-bus
composition and adds real SQLite restart. No test-only production seam was
introduced.

## Direct review

Best-fix verdict: **the change repairs the owning composition boundary; no
accepted or actionable finding remains**.

Directly reviewed after the steward interrupt:

- complete wrapper preparation, policy, validation, source-guard,
  implementation, terminal, preparer, direct, adapter, code-mode, and abort
  paths;
- diagnostic context installation/restoration and every production active
  context consumer;
- diagnostics-otel event subscription, synchronous propagation bridge, trusted
  active/alias/retained registry, tool recorder start/end, provider lifetime,
  and continuation adapter;
- all three typed continuation tools;
- stable-parent background/media admission;
- durable work encode/decode, SQLite restore, claim, fire, retry/failure, and
  restart recovery;
- exact source history and original trusted tool-child contract;
- frozen Project-81 collector and artifact authority;
- final product and regression diffs.

Rejected alternatives:

- change `formatActiveContinuationTraceparent()` globally: breaks the preserved
  media/background stable-parent contract;
- patch only the three typed tools: they already request the current active
  fact; repairing consumers would duplicate producer ownership;
- add an ambient OTel fallback or exporter retention shim: masks the missing
  execution scope and is not restart authority;
- add proof-specific span fields, row identifiers, service names, content
  capture, or sampling changes: forbidden and not a product fix;
- globally replace harness/run scoping: much broader than the violated tool
  execution boundary.

## Exact refire handoff

This lane did not build or deploy a runtime composite, restart any gateway, or
fire live proof traffic.

The next runtime-composite owner should:

1. Integrate exact product successor
   `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` without moving presentation
   `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd`.
2. Rebuild and verify the isolated runtime identity.
3. Bind proof bytes to
   `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed`.
4. Refire **R-CD-2 only** for this cure.
5. Require one originating `openclaw.tool.execution` for
   `continue_delegate`, with its current `openclaw.run` parent, and the
   reason-bound dispatch/fire pair beneath the tool span on one trace/chain.
6. Keep backend count authority honest and independent; a partial count
   backend does not invalidate a repeatedly returned complete topology.
7. Update, but do not close, `karmaterminal/openclaw#1251` unless the live row
   passes its signed authority.

Acceptance path for this repair lane: **focused-only**. Mode-B, Gate 3g, live
proof, PR creation, issue closure, presentation mutation, docs mutation, proof
corpus mutation, and runtime-composite mutation were all intentionally absent.
