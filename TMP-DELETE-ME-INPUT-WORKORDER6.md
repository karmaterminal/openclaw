# WORKORDER6-codex54.md — Post-Integration Continuation Corrections

## Purpose

This work order describes how to address the three concrete defects currently blocking a clean upstream PR for the continuation feature after integration testing surfaced the issues captured in `FINDINGS.md`.

It is intended as a coordination artifact for multiple machine actors working in parallel. Treat it as an anchor document: use it to stay aligned on scope, invariants, implementation order, and acceptance criteria.

This work order assumes:

- `FINDINGS.md` is the operational evidence set from Swim 6 / integration testing.
- `docs/design/continue-work-signal-v2.md` is the architectural reference.
- The stale changelog/journal tail at the end of the RFC is not authoritative implementation guidance.

## Objective Clarification

The core objective is broader than "fix three bugs."

The system we are trying to preserve and harden is:

- agents can schedule future work across turn boundaries
- agents can dispatch delegate work that returns into later turns
- delegate-origin work can itself continue and fan out further delegates
- the main session stays free to handle other live work while shards run in the background
- deployment operators can tune safety rails live, without restart-bound behavior

This matters for at least three concrete workload shapes already implied by the RFC:

- long-form decomposition
  - example: digesting a 10k-line document with parallel shard passes, then synthesizing later
- autonomous background enrichment
  - example: silent or silent-wake delegates that keep warming the parent invisibly
- wide sensor / mast-cell fan-out
  - example: many small shards probing narrow questions in parallel and returning alarms up their tree

The architectural consequence is:

- depth and width are separate concerns
- `maxChainLength` bounds depth
- `maxDelegatesPerTurn` bounds width
- neither should be implemented in a way that forces work back through the main session just to preserve safety accounting

The fixes in this branch are therefore not just correctness patches. They restore the intended contract that continuation policy is enforced at the point where work is actually scheduled or dispatched.

## Current Branch State

This branch now contains the code changes for the three defects in scope:

- bracket-origin continuation children now carry canonical `[continuation:chain-hop:N]` metadata
- delayed delegate timers now read live `generationGuardTolerance` at timer fire time, including announce-side chain hops
- `continue_delegate` now reads live `maxDelegatesPerTurn` at `execute()` time, and runner-side consumption defensively enforces the live cap
- the runtime/comment default for `maxDelegatesPerTurn` is aligned to `5`

Local validation completed on this branch:

- targeted continuation regression tests passed
- `pnpm build` passed

Remaining validation is operational:

- rerun the Swim scenarios that originally exposed the regressions
- decide whether the current default width cap is too conservative for fan-out-heavy deployments

## Upstream PR Hygiene

Some artifacts in this branch are for local anchoring and multi-actor alignment, not for the eventual upstream PR.

Do not include these in an upstream PR unless they are converted into stable, product-facing coverage:

- `WORKORDER6-codex54.md`
- prompt-wording tests whose purpose is to lock internal framing/prose for local coordination
- ad hoc machine-actor coordination notes or temporary validation scaffolding

Upstream-worthy tests:

- behavioral regression tests that prove runtime correctness
- chain-hop, timer, and live-config enforcement tests
- prompt tests only when they guard stable product behavior rather than local wording preference

## Source Documents

- RFC: `docs/design/continue-work-signal-v2.md`
- Integration findings: `FINDINGS.md`
- Prior work order: `WORKORDER5.md`

## RFC Alignment Verdict

Broad architectural alignment should remain:

- Bracket chain-hops use task-prefix encoding (`[continuation:chain-hop:N]`) as the canonical source of per-hop position.
- `CONTINUE_WORK`, bracket `[[CONTINUE_DELEGATE: ...]]`, and `continue_delegate` are "two doors, one room": different ingress surfaces, same safety rails.
- The system is allowed to create autonomous delegate subtrees. The parent session must not be forced to relay every hop just to keep the chain valid.
- Safety rails remain: `maxChainLength`, `costCapTokens`, delay clamping, interruptibility, and explicit opt-in.
- Width control (`maxDelegatesPerTurn`) is an operational tuning knob, not a compile-time constant.
- `continue_delegate` remains discoverable, typed, and denied for sub-agents.
- Hot-reload-sensitive continuation config should take effect without gateway restart where the RFC already claims or implies live behavior.
- Structured wake classification (`continuationTrigger`) remains authoritative. Do not regress to old prompt-visible/system-event heuristics for delegate wake detection.

Original misalignment addressed by this work:

1. Bracket-origin delegate spawns are not consistently carrying the chain-hop metadata that the announce-side guard depends on.
2. `generationGuardTolerance` is still captured too early in delayed timer callbacks.
3. `maxDelegatesPerTurn` is still captured too early, and one comment/default declaration is out of sync with runtime behavior.

## Non-Goals

- Do not rewrite the continuation architecture.
- Do not revisit cost-cap parity for bracket chain-hop accumulation in this work order unless a fix is required to keep tests coherent.
- Do not reintroduce model-visible `delegate-pending` queue markers as the primary wake-classification mechanism.
- Do not change public syntax (`CONTINUE_WORK`, `[[CONTINUE_DELEGATE: ...]]`, tool mode names).
- Do not silently raise defaults in this work order without explicit alignment. Correct live-read behavior first; tune width/depth defaults as an operational follow-up.
- Do not spend time editing stale RFC changelog history beyond noting follow-up doc sync tasks after code lands.

## Open Product Question After These Fixes

The current runtime default for `maxDelegatesPerTurn` remains `5`, which is consistent with the RFC and code after this branch. That may still be too low for the "sensor swarm / mast-cell" workload class.

The important distinction:

- this branch makes the cap predictable and live-tunable
- it does not yet assert that `5` is the right deployment default for every continuation-heavy environment

Follow-up tuning should be based on canary evidence, not guesswork. The likely next question is whether to keep `5` as the global default, raise it, or introduce profile guidance for fan-out-heavy agents/channels.

Current working hypothesis from fleet-style testing:

- `maxChainLength: 10` is probably already fine as the recursion guard
- `maxDelegatesPerTurn` is the likely bottleneck for mast-cell / sensor-swarm fan-out
- `costCapTokens` remains the real global leash
- fleet operators may want width closer to `20-50`, while upstream defaults stay conservative unless explicitly re-decided

## Defects In Scope

### 1. Missing/Non-Canonical Chain-Hop Metadata on Bracket-Origin Delegate Spawns

Observed in review after comparing the branch to `origin/main`.

Problem:

- The announce-side chain guard reconstructs hop position from `[continuation:chain-hop:N]` in the child task string.
- The top-level bracket DELEGATE path in `agent-runner.ts` still emits `[continuation] Delegated task ...` instead of the canonical chain-hop prefix.
- That means the announce handler is not receiving the same metadata shape from all continuation entry points.

Why this matters:

- The RFC's chain-tracking model explicitly says bracket chain-hops inherit position via task-prefix encoding.
- If the child task string is the canonical hop carrier, every child that may later re-chain must carry canonical hop metadata from the moment it is spawned.
- Without this, max-chain enforcement becomes path-dependent and autonomous delegate subtrees collapse back into a main-session relay model.

### 2. `generationGuardTolerance` Live-Read Bug

Observed in integration testing and documented in `FINDINGS.md`.

Problem:

- Delayed delegate timers capture `generationGuardTolerance` at schedule time.
- If config changes before the timer fires, the callback still uses stale tolerance.
- Review confirmed this still exists in `subagent-announce.ts`, even if an `agent-runner.ts`-only patch is prepared elsewhere.

Why this matters:

- The RFC already describes hot-reload behavior for continuation config elsewhere.
- This defect produces exactly the class of "config changed, gateway restart fixed it" behavior seen in Swim 6.
- For fan-out-heavy deployments, restart-bound safety knobs are operationally unacceptable. Width and cancellation behavior need to remain steerable while shards are already in flight.

### 3. `maxDelegatesPerTurn` Live-Read Bug and Default Drift

Observed in integration testing and documented in `FINDINGS.md`.

Problem:

- `maxDelegatesPerTurn` is passed into `createContinueDelegateTool()` as a scalar and enforced from that captured value.
- That means config changes made after tool construction do not affect the currently running tool.
- The RFC/tool docs say default `5`, but one type comment still says default `10`.

Why this matters:

- The RFC positions `continue_delegate` as a first-class, discoverable safety-bounded tool.
- If the limit is hot-reloadable in practice, the tool must read it at enforcement time, not construction time.
- Default drift is dangerous because future actors will "fix" code toward the wrong number.
- The broader product goal depends on width being tunable independently from depth. A frozen width cap defeats the intended use of delegate fan-out as background parallelism.

## Implementation Strategy

Use one shared principle for all three fixes:

> Continuation safety checks that depend on current deployment policy must read normalized continuation config at the point of enforcement, not earlier.

That applies to:

- hop metadata attached to spawned children
- timer cancellation tolerance at callback fire time
- per-turn fan-out limits at tool execution and/or runner consumption time

## Recommended Code Shape

Introduce a small shared helper for continuation runtime config, rather than repeating `loadConfig()` + defaults inline across timer callbacks and tool execution.

Suggested new helper:

- `src/auto-reply/reply/continuation-runtime.ts`

Suggested API:

- `resolveContinuationRuntimeConfig(): { enabled, defaultDelayMs, minDelayMs, maxDelayMs, maxChainLength, costCapTokens, maxDelegatesPerTurn, generationGuardTolerance, contextPressureThreshold }`
- This helper should:
  - call `loadConfig()`
  - normalize defaults in one place
  - return the exact runtime values used by hot-reload-sensitive continuation logic

Why this helper is worth it:

- Fixes #2 and #3 with one normalization path
- Reduces the chance of diverging defaults
- Gives future actors one place to extend continuation runtime policy safely

Status on this branch:

- this helper now exists as `src/auto-reply/reply/continuation-runtime.ts`
- use it as the normalization authority unless a later refactor replaces it deliberately

If helper extraction becomes noisy, an inline helper inside `agent-runner.ts` plus a reused exported helper for `subagent-announce.ts` is acceptable. The important part is a single default-normalization authority.

## Workstreams

The implementation workstreams below are kept because other actors may need to audit, rebase, or extend the same areas. On this branch, the code changes for Workstreams B-D are already in place; the remaining value is shared understanding, validation, and any follow-on tuning.

### Workstream A — Lock the Intended Semantics in Tests First

Before changing runtime code, write or extend tests to pin the desired behavior.

Required behavior to pin:

- `maxChainLength: 10` means exactly 10 total continuation delegates/shards execute, and the 11th is rejected.
- The above must hold for:
  - tool-origin delegate chains
  - bracket-origin delegate chains
- Changing `generationGuardTolerance` between schedule and fire affects the timer that has not yet fired.
- Changing `maxDelegatesPerTurn` without restart affects the next enforcement point.
- Default `maxDelegatesPerTurn` is `5`, everywhere.

Do not start by editing production code and then trying to guess what broke. Use tests to force one invariant set.

### Workstream B — Canonicalize Chain-Hop Metadata End-to-End

Target files:

- `src/auto-reply/reply/agent-runner.ts`
- `src/agents/subagent-announce.ts`
- tests in `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
- tests in `src/agents/subagent-announce.format.e2e.test.ts` and/or a new focused subagent-announce continuation test

Concrete changes:

1. Audit every place that spawns a continuation child capable of later chaining.
2. Ensure every such spawn emits the canonical prefix shape the announce handler parses:
   - `[continuation:chain-hop:N] ...`
3. Normalize the meaning of `N` across all paths.

Recommended invariant:

- `N` should represent the spawned child's chain position under the same semantics everywhere.
- The announce handler should derive "next child would be position `N+1`" from the current child's task prefix.
- The combination of spawn prefix and guard operator must satisfy the behavioral acceptance test above, regardless of whether the chain started from:
  - bracket syntax in the parent agent reply
  - `continue_delegate`
  - a sub-agent continuing the chain at the announce boundary

Important:

- Do not assume the existing `>` vs `>=` history in stale RFC notes is authoritative.
- The only authoritative result is the pinned behavior test: 10 delegates allowed, 11th rejected.
- If current tool-path semantics and bracket-path semantics disagree, change both until they agree.

Likely implementation steps:

1. Add a failing unit test proving the bracket-origin spawn task currently lacks the canonical prefix.
2. Add a failing announce-side regression test showing bracket-origin and tool-origin chains do not currently share the same hop-metadata contract.
3. Update the bracket DELEGATE spawn path in `agent-runner.ts` to emit canonical hop metadata.
4. Re-run the max-chain tests for both origins.
5. If the new prefix introduces an off-by-one on one path, adjust the shared hop semantics rather than special-casing one path.

Acceptance criteria:

- Both continuation entry points produce child task strings that the announce handler can interpret identically.
- `maxChainLength` behavior is identical for bracket-origin and tool-origin chains.
- Delegate-origin continuation can proceed without bouncing control back through the main session.
- No existing continuation tests regress.

### Workstream C — Move `generationGuardTolerance` Reads to Timer Fire Time

Target files:

- `src/auto-reply/reply/agent-runner.ts`
- `src/agents/subagent-announce.ts`
- optionally `src/auto-reply/reply/continuation-runtime.ts`

Concrete changes:

1. Identify every continuation timer callback that uses `generationGuardTolerance`.
2. Remove captured `continuationCfg` / `genTolerance` / `tolerance` values from outside the callback.
3. Inside the callback, resolve live continuation config and read `generationGuardTolerance` there.

Expected coverage points:

- bracket DELEGATE delayed spawn in `agent-runner.ts`
- tool DELEGATE delayed spawn in `agent-runner.ts`
- subagent-chain delayed spawn in `subagent-announce.ts`

Do not change:

- `CONTINUE_WORK` timer semantics, unless a failing test proves that tolerance should apply there too. This work order is specifically about delegate timers.

Preferred pattern:

1. Capture only immutable scheduling context outside the callback:
   - `sessionKey`
   - `storedGeneration`
   - `delayMs`
   - task payload
2. Resolve live config inside the callback:
   - `const { generationGuardTolerance } = resolveContinuationRuntimeConfig()`
3. Compute drift against the live tolerance
4. Either cancel or dispatch

Acceptance criteria:

- A config change between schedule and fire is observed by the timer callback without restart.
- This holds for both parent-side delayed delegates and announce-side chain-hop delays.
- Existing DM/strict-tolerance behavior remains unchanged when the config is unchanged.

### Workstream D — Move `maxDelegatesPerTurn` Enforcement to Live Read Time

Target files:

- `src/agents/tools/continue-delegate-tool.ts`
- `src/agents/openclaw-tools.ts`
- optionally `src/auto-reply/reply/agent-runner.ts`
- optionally `src/auto-reply/reply/continuation-runtime.ts`
- `src/config/types.agent-defaults.ts`

Concrete changes:

1. Stop passing `maxDelegatesPerTurn` into `createContinueDelegateTool()` as a captured scalar.
2. Make the tool resolve the live limit when `execute()` runs.
3. Keep the runtime default at `5`.
4. Fix comments/docs/type declarations that still say `10`.

Recommended enforcement layering:

- Primary enforcement:
  - inside `continue_delegate` tool `execute()`
  - live-read `maxDelegatesPerTurn`
  - compare against current queued + staged delegate count
- Secondary defensive enforcement:
  - in `agent-runner.ts` when consuming pending delegates
  - if queued delegates already exceed the live cap, reject excess with a clear system event/log

Why add the second layer:

- Protects against stale queued delegates from older code
- Protects against future races or alternate enqueue paths
- Makes the safety limit robust even if tool behavior changes again later

Additional default-alignment tasks:

- Fix `src/config/types.agent-defaults.ts` comment to say default `5`
- Grep for any other stale `10` references tied specifically to `maxDelegatesPerTurn`
- Do not change unrelated `maxChainLength: 10` references

Acceptance criteria:

- Config changes to `maxDelegatesPerTurn` are honored without restart at the next enforcement point.
- Default behavior is consistently `5` in runtime and comments.
- A queued delegate set larger than the live cap is bounded safely, not blindly dispatched.

## Test Plan

### Must-Add or Must-Update Tests

1. `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
   - bracket DELEGATE spawn includes canonical `[continuation:chain-hop:N]` prefix
   - tool DELEGATE and bracket DELEGATE share the same chain-cap behavior
   - config change between schedule and fire updates `generationGuardTolerance`
   - config change between tool creation and execute updates `maxDelegatesPerTurn`

2. `src/agents/subagent-announce.format.e2e.test.ts`
   - announce-side parsing accepts the canonical task prefix from bracket-origin children
   - delayed chain-hop timer uses live `generationGuardTolerance`
   - identical max-chain behavior regardless of origin path

3. Add a new focused continuation announce test if needed
   - If the existing format test file gets too noisy, create a dedicated continuation-specific announce test file rather than burying this logic in formatting tests.

4. `src/config/zod-schema.continuation.test.ts`
   - no schema change required unless config surface changes
   - keep as regression safety if helper extraction touches config normalization assumptions

### Behavioral Regression Matrix

These scenarios must be green before handoff:

- Quiet channel, bracket-origin chain, `maxChainLength: 3`
- Quiet channel, tool-origin chain, `maxChainLength: 3`
- Noisy multi-agent channel, delayed delegates, tolerance changed live before fire
- `maxDelegatesPerTurn` changed `5 -> 10` without restart
- `maxDelegatesPerTurn` changed `10 -> 3` without restart
- Default config with limit omitted still behaves as `5`
- Delegate-origin fan-out chain continues without requiring the main session to re-dispatch every hop
- Parent session remains free to process unrelated work while delayed delegates are pending

## Validation Commands

From repo root:

```bash
pnpm test -- src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts src/agents/subagent-announce.continuation.test.ts src/agents/tools/continue-delegate-tool.test.ts src/config/zod-schema.continuation.test.ts src/auto-reply/continuation-delegate-store.test.ts
pnpm build
```

Note:

- the repo's default `pnpm test` wrapper excludes `*.e2e.test.ts`
- use the focused continuation announce test above for default validation
- run announce-format e2e coverage separately only if you intentionally want to exercise the excluded e2e surface

## Manual / Canary Validation

Re-run the Swim 6 scenarios that actually exposed the defects:

1. `6-2` tolerance hot-reload
   - set `generationGuardTolerance` low
   - schedule delayed delegate
   - hot-reload config to high value before timer fires
   - confirm the callback uses the new value

2. `6-7a` fan-out cap
   - change `maxDelegatesPerTurn` without restart
   - confirm live limit is enforced on the next tool execution / consumption

3. `6-7b` chain length
   - verify exactly 10 total delegates/shards execute
   - confirm 11th is rejected
   - run this once for tool-origin and once for bracket-origin chains

4. fan-out utility sanity check
   - choose a workload that benefits from width rather than depth
   - verify the parent can keep responding while delegates are pending
   - confirm that widening `maxDelegatesPerTurn` live changes the next turn's dispatch capacity without restart

## Suggested Implementation Order

1. Pin the semantics with failing tests.
2. Canonicalize chain-hop metadata and make bracket/tool origins agree.
3. Add the shared live continuation config resolver.
4. Move tolerance reads into timer callbacks.
5. Move `maxDelegatesPerTurn` reads to enforcement time and align defaults.
6. Re-run targeted tests.
7. Run `pnpm build`.
8. Re-run Swim scenarios 6-2, 6-7a, 6-7b.
9. Update `FINDINGS.md` / PR notes only after code is verified.

## Handoff Notes for Other Machine Actors

- Use the RFC for architectural intent, not for stale historical guard/operator notes.
- Use `FINDINGS.md` for observed failures, not as proof that every prepared patch is still correct against current HEAD.
- Do not assume a patch that fixes `agent-runner.ts` also fixes `subagent-announce.ts`; review confirmed the hot-reload bug still exists there.
- Do not special-case tool-path and bracket-path chain semantics independently. Force them through one behavioral test expectation.
- Keep the product goal in view: delegate trees exist so the main session can stay available while shards do work elsewhere. If a fix preserves a guardrail but reintroduces main-session relay coupling, it is the wrong fix.
- Treat width and depth as different levers. A swarm-style workload may need higher width without deeper chains.
- If you discover that one of the prepared external patches conflicts with the canonical hop semantics above, prefer the tests and RFC invariants over the old patch.

## Definition of Done

This work order is complete only when all of the following are true:

- bracket-origin and tool-origin continuation chains share one canonical hop-metadata contract
- `maxChainLength` behavior matches the pinned acceptance test across both paths
- delayed delegate timers read live `generationGuardTolerance` at fire time
- `continue_delegate` enforces live `maxDelegatesPerTurn`
- default `maxDelegatesPerTurn` is consistently `5`
- targeted tests pass
- `pnpm build` passes
- Swim scenarios `6-2`, `6-7a`, and `6-7b` are re-verified without gateway restart workarounds
- the work order still reads correctly when the question changes from "did we patch the bug?" to "can this system support autonomous background fan-out without tying up the main session?"
