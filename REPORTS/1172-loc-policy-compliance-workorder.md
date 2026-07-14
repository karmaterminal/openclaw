# #1182 Phase 2: LOC-policy compliance workorder

## Authorization boundary

This implementation lane is limited to five violation rows:

1. `extensions/codex/src/app-server/run-attempt.ts`;
2. `extensions/diagnostics-otel/src/service.ts`;
3. `src/gateway/server-methods/agent.ts`;
4. `src/agents/embedded-agent-runner/run/attempt.ts`;
5. `src/auto-reply/tokens.ts`.

The safe-set count is five: three current-upstream topology placements, one
safe same-host reduction, and one natural bounded extraction. The remaining 64
ledger rows are explicitly out of scope. Do not implement the qualified
120-line compaction-release move: it does not clear the +905 policy violation.

This workorder does not authorize weakening, bypassing, baselining, excluding,
or rewriting the upstream LOC policy. It does not authorize assembly,
PR-presentation, deploy, proofs, or PR #1180 changes.

## Required implementation base

Start from a clean exact implementation base derived from current upstream and
record its full SHA. It must contain decomposition snapshot
`cae29a079203a70461c87114b3a2e55d5d38a4a5` or a reviewed descendant that
preserves the owner boundaries below.

Before editing:

1. verify the exact base/head and a clean worktree;
2. verify commits `323a9fbe29b`, `6454b07b170`, `d1fff1afc6a`,
   `bab07e990a2`, `98f603c4c4f`, `4f60ab2e88f`, `3e5d8cdbf4a`, and
   `bc8a44bc416` remain ancestors or prove equivalent topology by exact bytes;
3. rerun the exact LOC checker against the implementation candidate;
4. rerun GitNexus `context` and upstream `impact` for every moved symbol;
5. stop if an owner has moved, a destination is now oversized, an import cycle
   appears, or any safe-set host still grows relative to the exact base.

Use current upstream files as the structural source of truth. Port #1172
behavior into those owners; do not take the old monolithic candidate file
wholesale.

## Work item 1: preserve the upstream Codex startup solution

Violation row: `extensions/codex/src/app-server/run-attempt.ts`, 3731 -> 3738.

Current upstream already implements the seven-line behavior in the startup
phase. Keep `run-attempt.ts` as the 81-line facade created by `323a9fbe29b`.
Verify that `extensions/codex/src/app-server/attempt-startup.ts` applies
`withMcpElicitationsApprovalPolicy` after fast-mode computer-use enablement.

Required result:

- do not port the candidate hunk into the facade;
- do not duplicate the behavior in startup;
- do not add a compatibility export or wrapper;
- exact diff should normally show no #1172 change for this path.

Acceptance:

- current behavior is present once;
- `run-attempt.ts` is equal to or smaller than the implementation base;
- focused Codex app-server fast-mode/computer-use approval tests pass.

## Work item 2: port diagnostics into extracted OTEL owners

Violation row: `extensions/diagnostics-otel/src/service.ts`, 3551 -> 3682.

Keep the 337-line current host created by `6454b07b170`. Port the exact #1172
responsibilities into the existing current-upstream decomposition:

1. Put remote `parentSpanIdSource` / `spanIdSource` normalization in
   `extensions/diagnostics-otel/src/service-trace-context.ts`.
2. Put trusted-root registration, direct/remote/logical parent resolution, and
   retained-span lookup in `extensions/diagnostics-otel/src/service-traces.ts`.
3. Put `diagnostic.continuation_queue.sample` handling in
   `extensions/diagnostics-otel/src/service-events.ts`.
4. Add the candidate 196-line
   `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts` as the
   bounded OTEL adapter owner, adjusting only imports required by current
   upstream contracts.
5. Keep adapter install/reset/drain lifecycle in the slim `service.ts` owner.
   Install only after the trusted-span substrate is ready; reset only if this
   service installed it; drain diagnostic events before shutdown teardown.
6. Retarget focused tests to the extracted owners. Do not reconstruct a second
   monolithic service or add forwarding shims.

Expected physical-line envelopes from the audited snapshot are approximately:

- trace context: 92 -> 98;
- traces: 417 -> 475;
- events: 238 -> 243;
- service lifecycle: 337 -> about 398;
- new adapter: 196.

Recalculate rather than hardcoding these estimates. Every new file must be
<=500, and no destination already over 500 may grow.

Behavioral invariants:

- remote W3C parents remain distinguishable from logical local parents;
- a direct trusted span wins, a remote carried span remains remote, and the
  first trusted span on the logical trace is the bounded fallback;
- root context registration uses the OpenClaw diagnostic trace id;
- continuation adapter registration and reset are process-lifecycle symmetric;
- continuation queue events satisfy exhaustiveness without creating a second
  OTEL event path.

Acceptance:

- the old `service.ts` candidate hunk is fully represented in the named owners;
- exact LOC comparison has no diagnostics violation;
- focused service, trace-context, trace, event, adapter, lifecycle, and
  continuation diagnostic tests pass;
- GitNexus finds current service callers and no duplicate adapter owner.

## Work item 3: port Gateway continuation ingress into extracted owners

Violation row: `src/gateway/server-methods/agent.ts`, 3485 -> 3518.

Keep the 11-line facade created by `d1fff1afc6a`. Place the candidate overlay as
follows:

1. Add the three internal-only fields—`drainsContinuationDelegateQueue`,
   `continuationTrigger`, and `traceparent`—to
   `src/gateway/server-methods/agent-request-types.ts`. Keep them out of the
   public generated schema as today.
2. Carry the loaded session continuation traceparent through the existing
   prepared-session result in
   `src/gateway/server-methods/agent-session-prepare.ts`, or read it from the
   already-passed authoritative `sessionEntry` in execution. Do not add a
   request-time reload.
3. Clear `continuationTraceparent` in the authoritative patch constructed at
   `src/gateway/server-methods/agent-session-persist.ts:225`, including the
   recovered `sessionStartedAt` branch. This is a one-shot handoff; do not add a
   runtime fallback reader or dual write.
4. In `src/gateway/server-methods/agent-run-execution-phase.ts`, consume the
   subagent traceparent handoff using the existing idempotency/session facts,
   establish trust from internal runtime handoff or consumed subagent handoff,
   choose inherited traceparent in the exact order internal request -> subagent
   handoff -> prepared session value, and pass the three trusted fields into
   `dispatchAgentRunFromGateway`.
5. Keep ordinary raw RPC clients unable to force continuation queue-drain or
   continuation-trigger semantics.

`src/gateway/server-methods/agent-run-handler.ts` is exactly 500 lines at the
audited snapshot. It must not grow. `startAgentRunExecution` already receives
the request, session entry, resolved keys, idempotency key, and internal trust
fact, so no handler bridge fields are needed.

Acceptance:

- `agent.ts` remains the unchanged facade;
- `agent-run-handler.ts` is equal to or smaller than the implementation base;
- all destination files remain policy-compliant;
- focused Gateway continuation handoff, raw-client trust, session persistence,
  idempotency, subagent handoff, and dispatch tests pass;
- a live Gateway scenario proves one-shot traceparent consumption and rejects
  untrusted continuation controls.

## Work item 4: make the embedded-attempt overlay non-growing

Violation row: `src/agents/embedded-agent-runner/run/attempt.ts`, 2529 -> 2553.

Work from the 1854-line current host after the five named phase extractions.
Do not add any line to this oversized host.

### Omit obsolete re-exports

Do not add the candidate's 21-line re-export block for the 14 symbols defined
in `attempt.thread-helpers.ts`, `attempt.prompt-helpers.ts`, and
`stream-resolution.ts`. Current callers import the defining modules directly.
Do not add aliases, shims, or a barrel solely for old internal imports.

### Bundle subscription trust through phase owners

In `src/agents/embedded-agent-runner/run/attempt-client-tools.ts`:

1. compute `trustedPluginLocalMediaToolNames` from plugin metadata;
2. compute `trustedLocalMediaToolNames` from trusted core media names plus
   trusted plugin names;
3. return one `subscriptionToolTrust` object containing
   `builtinToolNames`, `replaySafeToolNames`, and
   `trustedLocalMediaToolNames`, instead of two separate top-level return
   fields.

`src/agents/embedded-agent-runner/run/attempt-session.ts` already passes the
residual client-tool runtime through; keep one canonical object. Update
`src/agents/embedded-agent-runner/run/attempt-stream-prepare.ts` to accept that
object and spread it into the subscription input.

In the host, replace the two destructured trust-set names with
`subscriptionToolTrust`, and replace the two stream properties with one spread.
The host shrinks by two physical lines while carrying the third set.

### Replace catalog-applied state at equal line count

In the host, make same-line substitutions:

1. replace `let toolSearchCatalogApplied = false` with an optional
   `ReturnType<typeof prepareEmbeddedAttemptToolCatalog>` variable;
2. assign the prepared catalog to that variable instead of a new `const`;
3. guard early cleanup on the object's presence;
4. clear the object variable after catalog cleanup.

This preserves the invariant that cleanup runs only after successful catalog
application, without adding the candidate's one assignment line.

Acceptance:

- host physical LOC is at least two lines below the implementation base;
- no obsolete re-export remains;
- client-tools and stream-prepare remain <=500;
- focused catalog early-exit, client-tool trust, plugin local-media trust,
  replay safety, stream subscription, and embedded attempt tests pass;
- GitNexus direct callers target defining modules and no cycle is introduced.

## Work item 5: move continuation parsing to its natural owner

Violation row: `src/auto-reply/tokens.ts`, 332 -> 644.

Move the complete 312-line continuation parser/stripper family into existing
candidate owner `src/auto-reply/continuation/signal.ts`:

- `CONTINUE_WORK_TOKEN`;
- `ContinuationSignal` and its exact required type dependencies;
- directive/parser state and helpers;
- `parseContinuationSignal`;
- `stripContinuationSignal`.

Required edits:

1. Keep upstream silent/heartbeat token behavior in `tokens.ts`.
2. Retarget every production and test consumer to
   `continuation/signal.ts`; rediscover callers at the implementation SHA.
3. Merge the moved type surface with the canonical continuation types; do not
   leave competing definitions.
4. Delete the moved implementation and feature-only imports from `tokens.ts`.
5. Do not re-export from `tokens.ts`; do not add an alias, compatibility shim,
   lazy fallback, or duplicate test-only implementation.
6. Consolidate parser tests under the continuation owner while retaining
   silent/heartbeat token tests with `tokens.ts`.

Behavioral invariants:

- directive grammar and precedence;
- target/fanout exclusion;
- `model=default` handling;
- 4096-character delegate truncation;
- traceparent consumption;
- exact stripping and marker-only behavior;
- RFC continuation signal contract.

Expected shape is the 332-line upstream host and approximately 457 lines in
`continuation/signal.ts`; recalculate on the implementation base.

Acceptance:

- exact LOC comparison clears the crossed-limit row;
- one implementation and one import path remain;
- no import cycle exists; the audited move should remove the former
  `continuation/signal.ts -> tokens.ts` edge;
- focused signal/parser, RFC, no-op guard, announce, attempt, followup,
  execution, and streaming tests pass.

## Required proof for the five-path lane

Use `$openclaw-testing` and the sanctioned remote backend selected for the
implementation source trust. Run focused tests first, then the relevant changed
gate. Run a fresh `$autoreview` until no accepted/actionable findings remain.

Minimum policy proof:

```bash
node --import tsx scripts/check-ts-max-loc.ts \
  --base <exact-current-upstream-implementation-base> \
  --head <exact-implementation-head>
```

Acceptance requires zero LOC violations introduced by the implementation. Also
prove:

- every safe-set shared host is equal to or smaller than its exact base;
- every new production TypeScript file is <=500;
- no already-oversized destination grows;
- no compatibility export, duplicate implementation, fallback reader, or
  fork-only shared topology was added;
- GitNexus `context`, upstream `impact`, and restricted
  `CALLS|IMPORTS|ACCESSES` walks match the final source;
- tests cover the named behavior rather than only file shape.

Stop the lane if any of the five rows remains a violation. Do not compensate by
splitting or trimming one of the 64 blocker rows, changing exclusions, or
rewriting the policy.
