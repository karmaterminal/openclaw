# PR #129388 final product-cure convergence

Status: **complete; pure product successor ready for runtime-composite
integration and the three-row live refire**.

Code successor before this report-only commit:
`76d761251ee6e487ac7bfe6832ef9fd2c59c7375`.

No PR was opened. No runtime composite, presentation, docs/proof corpus, live
row, issue state, or upstream source was mutated.

## Named-ref contract

This table was declared before merge prediction or evidence. The unchanged safe
lane and savegame were published at the exact base first.

| Category                                     | Named ref                                                                           | Local SHA                                  | Tracking SHA                               | Server SHA                                 | Equality / use                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------ |
| Product/base                                 | `karmaterminal/openclaw@2f9b9b7a90988190a149208cbbad68558d1d7daa`                   | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | N/A (immutable commit)                     | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | local = server                       |
| Safe lane, initially published               | `karmaterminal/openclaw:codeagent/129388-final-cure-converge`                       | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | local = tracking = server            |
| Safe lane, code successor                    | `karmaterminal/openclaw:codeagent/129388-final-cure-converge`                       | `76d761251ee6e487ac7bfe6832ef9fd2c59c7375` | `76d761251ee6e487ac7bfe6832ef9fd2c59c7375` | `76d761251ee6e487ac7bfe6832ef9fd2c59c7375` | local = tracking = server            |
| Savegame                                     | `karmaterminal/openclaw:codeagent/129388-final-cure-converge-savegame`              | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | `2f9b9b7a90988190a149208cbbad68558d1d7daa` | local = tracking = server            |
| CI/workflow                                  | Combined focused-only owner proof; Mode-B N/A by workorder                          | N/A                                        | N/A                                        | N/A                                        | N/A                                  |
| Presentation                                 | `karmaterminal/openclaw:codeagent/85651-upstream-1ba243c8-gates`                    | `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` | `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` | `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` | local = tracking = server; read-only |
| Docs/proof harness                           | `karmaterminal/karmaterminal-openclaw-docs:codeagent/129388-depth-ack-harness-cure` | `85a783f4ef0352e64b37748f4164d5fdee96ceb4` | `85a783f4ef0352e64b37748f4164d5fdee96ceb4` | `85a783f4ef0352e64b37748f4164d5fdee96ceb4` | local = tracking = server; read-only |
| Docs/proof failed live handoff               | `karmaterminal/karmaterminal-openclaw-docs:codeagent/129388-cured-row-refire`       | `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | `dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` | local = tracking = server; read-only |
| Typed component authority                    | `karmaterminal/openclaw@cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3`                   | `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` | N/A (immutable code successor)             | `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` | local = server                       |
| Token component authority                    | `karmaterminal/openclaw@d44edf11308a5d26b0d57a38162f8e46fa8fbe34`                   | `d44edf11308a5d26b0d57a38162f8e46fa8fbe34` | N/A (immutable code successor)             | `d44edf11308a5d26b0d57a38162f8e46fa8fbe34` | local = server                       |
| Accepted runtime composite for the next lane | `karmaterminal/openclaw:codeagent/129388-runtime-composite-cured`                   | `a5db13ad6297721cbf43af445d5a4a9b9bb0ad67` | `a5db13ad6297721cbf43af445d5a4a9b9bb0ad67` | `a5db13ad6297721cbf43af445d5a4a9b9bb0ad67` | local = tracking = server; read-only |

The final report-only branch tip is resolved and equality-checked in the
mandatory COMPLETE receipt after this file is committed.

## Frozen component authority

Both complete component handoffs were read directly:

- typed-tool span:
  `openclaw-129388-typed-tool-span-live-cure/output.md`;
- token origin/trace/lifecycle:
  `openclaw-129388-token-origin-binding-cure/output.md`.

The convergence does not reinterpret either accepted repair.

Typed ownership remains:

- common tool implementation execution under the synchronously prepared
  diagnostic tool child;
- typed continuation tool span topology;
- stable-parent media/background preservation.

Token ownership remains:

- child-owned durable raw-token TaskFlow admission for all timing modes;
- immutable origin run and replay binding;
- no parallel immediate direct spawn;
- origin trace dispatch/fire continuity;
- disposable-origin cleanup while the exact descendant is unsettled;
- visible durable-admission failure with no spawn or drain.

## Required merge topology

The safe branch started at exact base
`2f9b9b7a90988190a149208cbbad68558d1d7daa`. The savegame ref points to that
same commit.

Before the merge:

| Receipt                           | Value                                      |
| --------------------------------- | ------------------------------------------ |
| Typed changed paths               | 2                                          |
| Token changed paths               | 14                                         |
| Path intersection                 | 0                                          |
| Combined changed paths            | 16                                         |
| Predicted merge tree              | `a39b352dc421806688edd1f6c82f95d2fa0b5f85` |
| Textual conflicts                 | none                                       |
| Unexpected semantic-owner overlap | none                                       |

The expected semantic connection is trace continuity: the typed component owns
the tool implementation scope, while the token component captures the current
run/origin scope at its later lifecycle boundary. AsyncLocalStorage restores
the enclosing scope when tool execution resolves or rejects, so raw-token
accounting cannot inherit a stale last-tool child.

The exact command was an explicit no-fast-forward octopus merge:

```text
git merge --no-ff --no-commit \
  cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3 \
  d44edf11308a5d26b0d57a38162f8e46fa8fbe34
```

The staged index tree equaled the prediction before commit. The committed merge:

| Field                 | Value                                      |
| --------------------- | ------------------------------------------ |
| Merge commit          | `76d761251ee6e487ac7bfe6832ef9fd2c59c7375` |
| Parent 1              | `2f9b9b7a90988190a149208cbbad68558d1d7daa` |
| Parent 2              | `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3` |
| Parent 3              | `d44edf11308a5d26b0d57a38162f8e46fa8fbe34` |
| Committed tree        | `a39b352dc421806688edd1f6c82f95d2fa0b5f85` |
| Predicted = committed | yes                                        |

Both exact component successors are merge parents and ancestors. No rebase,
squash, cherry-pick, force-push, manual conflict resolution, later upstream
merge, or generic product-observability overlay entered the successor.

The eight discarded overlay commits from
`307db50f3d9b043f0951ea85a4c69ffedb2bbc6e` through
`2a42f96a3e9579caf04a2c203ce2ffc27ffaa0b8` were checked individually; none is
an ancestor of the base, either component, or the merge commit.

## Component byte preservation

Per-component binary diff bytes are identical between the component successor
and the predicted/committed merge tree:

| Component | Component patch SHA-256                                            | Merge-projected patch SHA-256                                      | Binary paths |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -----------: |
| Typed     | `2122dd4dffd01ee9b591d8bd6386d992d2a33da77fdcec868769cd54e7f6f35b` | `2122dd4dffd01ee9b591d8bd6386d992d2a33da77fdcec868769cd54e7f6f35b` |            0 |
| Token     | `605e734ed8d44bf6b4fa930385593c169d8bc9293f43ec12f4952a4352b8d26d` | `605e734ed8d44bf6b4fa930385593c169d8bc9293f43ec12f4952a4352b8d26d` |            0 |

Every changed component blob is preserved exactly:

```text
extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts 0d1b058aa26b072c337dcbb2aabf5232a796565d
src/agents/agent-tools.before-tool-call.wrapper.ts a1fc98a499c48f30fa9ec5a18e82c309c6886002
src/agents/subagent-announce.continuation-drain.bracket-hedge.test.ts 7bb56d6f6ac4dd2bc5a3d738bc95a19dd56975cd
src/agents/subagent-announce.continuation-drain.chain-cost.test.ts 3e83dce64fbca7e37d950e2c2c9ba2b48ef928dc
src/agents/subagent-announce.continuation-drain.test.ts 5cb5f985b3c00bad17930de82e77542075b9d486
src/agents/subagent-announce.continuation-drain.tool-hop-order.test.ts 6973d91a4b33e4232398a6818f102daf8236568e
src/agents/subagent-announce.continuation.runtime.ts 7e12d7c29967ee59a3e5d5b2981dc172fa41ff6f
src/agents/subagent-announce.live-tree-chain-proof.test.ts b1b26ac8f24b4b0727aaa00719f8734de9b0c235
src/agents/subagents/announce/subagent-announce.ts 8d984dffa618ae6ecd064d34b7b5c0b41ed7ad9b
src/auto-reply/continuation/delegate-dispatch.contract.test.ts 3ad4f360fc778dbcd43b6427db9dcb44d9bd889f
src/auto-reply/continuation/delegate-dispatch.ts 3bcc5bfc55e899ecd756f289f0d3d5362c87835b
src/auto-reply/continuation/delegate-flow-store.ts 63934d64a8a43a6f464f3d2d21cd0c4fc0f85f83
src/auto-reply/continuation/delegate-store-post-compaction.ts 38ef4c93e52a6cc19b53f45ccecf3d740931b48e
src/auto-reply/continuation/types.ts fbc9089c34c00dee2630eb0f7a7123e52a391fd6
src/auto-reply/reply/agent-runner-result-accounting.test.ts 698961e8369d93e71f16b81d13f03576627239b2
src/auto-reply/reply/agent-runner-result-accounting.ts 7346c6f1f58362fd0662b69602a75976dc2008a6
```

The presentation and both docs/proof refs were re-read from their remote
branches and remain unchanged.

## Regression completeness

The component inversion receipts remain bound to their original predecessors
and successors. This lane does not claim that either negative control ran at
the merge SHA.

### Typed-tool span

Invariant: once `tool.execution.started` synchronously prepares the concrete
tool span, the common executor must run the implementation under that exact
logical child and restore the enclosing run scope afterward.

Owner boundary:
`src/agents/agent-tools.before-tool-call.wrapper.ts`.

Frozen inversion:

- exact-base test-only commit
  `2fdc26199425112dd5670bb4dc6dba02d3f84691`, parent
  `2f9b9b7a90988190a149208cbbad68558d1d7daa`;
- RED reason: persisted span id equaled the harness span, proving the
  implementation bypassed its tool child;
- production patch commit
  `6a32ab7522d1d78c98ecffa14f981b682596af00`;
- accepted code successor
  `cb55b8618c3aff2ec8e2aa491b8554fe1d63e7c3`;
- same production-composition regression GREEN on the successor.

Nearest siblings: all three typed continuation tools and the unchanged
stable-parent media/background path. Restart persistence is the existing
TaskFlow traceparent string; no schema or migration changed. Reverting the
scope install deterministically restores the harness-bypass RED.

### Token origin, trace, and lifecycle

Invariant: return targeting is payload policy; the session/run emitting the raw
final token owns durable admission, accepted-child binding, replay identity,
cleanup, and the default return.

Owner boundary:
`src/agents/subagent-announce.continuation.runtime.ts`,
`src/auto-reply/continuation/delegate-flow-store.ts`, and
`src/agents/subagents/announce/subagent-announce.ts`.

Frozen inversions:

- exact-base plus final regression RED log SHA-256
  `f435ee2e05ec6cc7ba2f83a806c5c9240242d9e8c97080385b4b16044ab19059`;
- final production-patch revert RED log SHA-256
  `83f689cd2c613780558b67cfc20c9db632ab1edda62d043e083d290b021acdcc`;
- RED reasons: root requester/controller substitution, split dispatch/fire
  traces, absent origin return, and legacy origin marker;
- re-applied production patch SHA-256
  `bc70a268248f8b9739911d4d76be036207473aecddb1455880ee492be63130cb`;
- accepted code successor
  `d44edf11308a5d26b0d57a38162f8e46fa8fbe34`;
- identical production-composition regression GREEN on the successor.

Nearest siblings include typed tool delegates, explicit targets, plural
targets, tree/all fanout, delayed hedges, post-compaction staging, cancellation,
admission reset, spawn rejection, and TaskFlow restart recovery.

Persistence and rollback:

- SQLite schema/version, tables, indexes, protocol, and config are unchanged;
- `originRunId` is optional JSON in the existing TaskFlow state;
- the new decoder still accepts pre-cure requester override fields but never
  projects them, so restart uses authoritative `ownerKey`;
- candidate reopen preserves owner, origin run, and accepted child;
- an old strict decoder can open the unchanged database but fails closed on an
  in-flight new-shape row; drain continuation delegates before binary rollback
  if preserving in-flight work matters.

Partial failure:

- failed durable create emits a trusted retry instruction;
- it starts no direct spawn and arms no drain;
- queued/running flow status keeps delete cleanup retryable;
- a succeeded flow keeps the disposable origin while its exact descendant is
  unsettled;
- lifecycle replay finds the same `originRunId` flow instead of spawning again.

## Combined focused acceptance

The linked worktree never ran install or dependency reconciliation. Its
same-host exact-lock normal clone is
`source/openclaw-129388-final-cure-converge-deps` at exact base
`2f9b9b7a90988190a149208cbbad68558d1d7daa`.

Install-input SHA-256 values match the candidate:

| Input                 | SHA-256                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `package.json`        | `f381882c5299390ea74a7d095a512e50b4914e7eb380bf26f0c6b5b28976899d` |
| `pnpm-lock.yaml`      | `688c9780ded8ee8c83d4f0375d25213c26c02e36b12f6e7659d6c594c3b554e6` |
| `pnpm-workspace.yaml` | `178d57f60d7a3fa7e679ef07be87d168570c1756557b367d6dc06d3445136b58` |

The root and UI importer `node_modules` links both point to that exact
same-architecture clone.

All Vitest commands used the repository runner and one worker. Result:
**40 files, 639 passed, 0 failed**.

| Owner lane                                                     | Files | Tests |
| -------------------------------------------------------------- | ----: | ----: |
| Diagnostics-otel adapter and typed-tool production composition |     2 |    19 |
| Typed tools and stable-parent media                            |     5 |   118 |
| Common tool executor                                           |     1 |    62 |
| Continuation tracer and diagnostic event bus                   |     4 |   129 |
| Diagnostic AsyncLocalStorage context                           |     1 |    14 |
| Durable restart trace                                          |     1 |     1 |
| Agent chain/cost/hedge/order and return paths                  |     8 |    57 |
| TaskFlow dispatch/recovery/post-compaction/accounting          |    16 |   216 |
| TaskFlow SQLite persistence/reopen                             |     2 |    23 |

Exact commands:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-misc.config.ts --maxWorkers=1 extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-tools.config.ts --maxWorkers=1 src/agents/tools/continuation-tools.current-span-traceparent.test.ts src/agents/tools/continue-delegate-tool.test.ts src/agents/tools/continue-work-tool.test.ts src/agents/tools/request-compaction-tool.test.ts src/agents/tools/media-generate-background-shared.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.e2e.config.ts --maxWorkers=1 src/agents/agent-tools.before-tool-call.integration.e2e.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.infra.config.ts --maxWorkers=1 src/infra/continuation-tracer.test.ts src/infra/continuation-tracer.emit-and-fire.test.ts src/infra/continuation-tracer.queue-and-compaction.test.ts src/infra/diagnostic-events.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast.config.ts --maxWorkers=1 src/infra/diagnostic-trace-context.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-core.config.ts --maxWorkers=1 src/auto-reply/continuation/trace-context-propagation.integration.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.agents.config.ts --maxWorkers=1 src/agents/subagent-announce.live-tree-chain-proof.test.ts src/agents/subagent-announce.continuation-drain.test.ts src/agents/subagent-announce.continuation-drain.chain-cost.test.ts src/agents/subagent-announce.continuation-drain.tool-hop-order.test.ts src/agents/subagent-announce.continuation-drain.bracket-hedge.test.ts src/agents/subagent-announce.continuation-tool-delegate-commit.test.ts src/agents/subagent-announce.crosssession-gate.test.ts src/agents/subagent-announce.targeted-return.integration.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply.config.ts --maxWorkers=1 src/auto-reply/continuation/delegate-dispatch.contract.test.ts src/auto-reply/continuation/delegate-dispatch.hedge-cleanup.test.ts src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts src/auto-reply/continuation/delegate-dispatch.spawn-failure-and-missing-target.test.ts src/auto-reply/continuation/delegate-dispatch.chain-depth-exhaustion.test.ts src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts src/auto-reply/continuation/delegate-dispatch.admission-reset-race.test.ts src/auto-reply/continuation/delegate-store.test.ts src/auto-reply/continuation/delegate-store-post-compaction.test.ts src/auto-reply/continuation/delegate-dispatch.post-compaction-recovery.test.ts src/auto-reply/continuation/post-compaction-durable-handoff.test.ts src/auto-reply/continuation/post-compaction-taskflow-rejection.test.ts src/auto-reply/continuation/post-compaction-chain-charge.test.ts src/auto-reply/continuation/types.mode-shape.test.ts src/auto-reply/reply/agent-runner-result-accounting.test.ts

node scripts/run-vitest.mjs run --config test/vitest/vitest.tasks.config.ts --maxWorkers=1 src/tasks/task-flow-registry.store.test.ts src/tasks/task-flow-registry.test.ts
```

Combined focused log SHA-256:
`45b6d67372537d9bac73d26d1b708b9294deb058b22f2befd0c795e2285f7875`.

## Types, lint, format, and static guards

Targeted production and touched-test types all pass:

```text
node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/final-cure-core.tsbuildinfo
node scripts/run-tsgo.mjs -p tsconfig.extensions.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/final-cure-extensions.tsbuildinfo
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.agents-root.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/final-cure-agents-root-test.tsbuildinfo
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.messaging.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/final-cure-messaging-test.tsbuildinfo
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/final-cure-extensions-test.tsbuildinfo
```

Targeted core/extension Oxlint with warnings denied, Oxfmt over all 16 paths,
and `git diff --check` pass. Targeted type log SHA-256 is
`9210926788e289bbc8aa3bc22cd5c2f8f75c585aac5360d7e545727b8f22e51a`;
targeted static log SHA-256 is
`78cb200dbd2c9fcc76b352f6bc5497745aa723757794dc9783923df9c620fc46`.

`node scripts/check-changed.mjs -- <16 paths>` passes:

- conflict markers, max-lines, assertion safety, attribution, doctor registry;
- wildcard exports, duplicate coverage, coercion helpers, dependency pins;
- format, deprecated APIs, plugin boundaries, wrapper shadowing, package patches;
- all three Knip dead-export scans with zero entries;
- core production, all core-test shards, and extension-test types;
- core and extension lint;
- native state schema v10, database-first, media helper, runtime sidecars;
- runtime import cycles, webhook body ordering, and pairing/auth guards.

Final changed-gate log SHA-256:
`1c4553910187cd728c3852ea469937792c348b43c7e16b2f7349c70c8bc3486b`.

The first common-executor attempt stopped before test collection because the
new exact-lock clone had not yet built workspace package outputs. Building that
same-architecture exact-base normal clone supplied
`packages/ai/dist/internal/retry-after.mjs`; the identical E2E command then
passed 62/62.

The first changed-gate attempt exposed a missing worktree importer link:
`ui/vite.config.ts` resolved root `pako` without the declaration supplied by
the exact-lock clone's `ui/node_modules`. The exact-base normal clone passed,
disproving a product or baseline red. Linking this worktree's ignored
`ui/node_modules` to that same-host importer made the targeted UI typecheck and
the complete changed gate pass. No tracked product byte changed for either
infrastructure correction.

The warning-only temp-directory report includes the accepted raw-token
composition test. That test explicitly closes both SQLite caches, removes its
isolated state directory, and asserts removal; the frozen component was not
rewritten in this composition lane.

Acceptance path: **focused-only**. Mode-B, Gate 3g, Crabbox, live proof, and
monolithic local full-suite execution are N/A by workorder.

## Direct review

No Explore, task, code-review, Opus, autoreview, or other AI subagent was used.
The direct-only workorder explicitly replaced the normal AI autoreview gate
with complete direct review.

Best-fix verdict: **the exact accepted owners compose without alteration; no
actionable convergence finding remains**.

Direct review covered:

- all 16 changed files and every changed test;
- complete common executor preparation, hooks, validation, source guard,
  implementation scope, terminal recording, rejection, and scope restoration;
- all three typed tools, diagnostic AsyncLocalStorage, current-span and
  stable-parent formatters, diagnostics-otel synchronous propagation bridge,
  tool recorder, adapter, provider lifetime, and TaskFlow restart carry;
- raw token extraction, immediate/delayed/post-compaction durable admission,
  origin replay lookup, owner-key encode/decode, deterministic child binding,
  dispatch/fire traceparent, caps, cancellation, hedges, restart recovery, and
  failed create/spawn/persist paths;
- default return to the emitting origin and explicit single/plural/tree/all
  target routing through the unchanged return router;
- subagent registry pending-descendant queries, retry scheduling, terminal
  cleanup, session deletion fencing, and exact origin retirement order;
- TaskFlow SQLite create, CAS update, reload, corrupt-row rejection, legacy
  decoder behavior, and rollback implications;
- component path intersection, merge topology, overlay exclusion, exact blobs,
  and binary patch identity.

Alternatives rejected:

- changing `formatActiveContinuationTraceparent()` globally: breaks the
  preserved stable-parent media contract;
- patching only typed tools: duplicates producer policy and leaves the common
  implementation scope wrong;
- retaining immediate raw-token direct spawn: preserves two lifecycle owners
  and no canonical durable admission;
- keeping requester override fields active: lets payload return policy replace
  authoritative lifecycle ownership;
- downstream trace repair or fallback: occurs after the durable owner fact is
  already wrong;
- sequential cherry-pick, rebase, squash, or manual integration: violates the
  required topology and loses component ancestry.

Test-audit verdict:

- both new production-composition regressions have deterministic predecessor
  REDs and successor GREENs;
- the tool executor/OTel test and raw lifecycle test protect distinct real
  composition boundaries;
- adjacent unit tests cover policy branches without replacing the boundary
  regressions;
- no new test-only production seam was added.

## Changed paths and LOC

Relative to exact base:

| Class      | Files | Added | Deleted |    Net |
| ---------- | ----: | ----: | ------: | -----: |
| Production |     8 |   179 |     178 | **+1** |
| Tests      |     8 |   794 |     451 |   +343 |
| Total      |    16 |   973 |     629 |   +344 |

The combined production delta is typed `+7` plus token `-6`. The one-line net
growth buys the explicit tool-scope owner boundary while the token repair
removes the parallel direct-spawn path. No config, protocol, SQLite schema,
dependency, plugin SDK, migration, or compatibility surface changed.

## Exact downstream handoff

### 1. Merge into the accepted runtime composite

Start from the clean, server-equal accepted runtime composite:

```text
karmaterminal/openclaw:codeagent/129388-runtime-composite-cured
a5db13ad6297721cbf43af445d5a4a9b9bb0ad67
```

Publish an unchanged safe lane and savegame, then merge exact **code**
successor `76d761251ee6e487ac7bfe6832ef9fd2c59c7375` once with an explicit
no-fast-forward merge. Do not merge this report-only commit, rebase, squash,
cherry-pick, absorb current upstream, or move presentation. Predict the tree,
prove component/runtime path preservation, and rerun the combined runtime plus
continuation owner matrix on the resulting composite SHA.

### 2. Refire only the three cured rows

After deploying that exact runtime-composite SHA and observing the matching
runtime identity, bind proof execution to reviewed harness:

```text
karmaterminal/karmaterminal-openclaw-docs@85a783f4ef0352e64b37748f4164d5fdee96ceb4
```

Preserve failed live handoff
`dc6bffc8f55692a9fc6131d67c77a4e9b116a4ed` and refire only:

- `R-CD-2`;
- `R-CD-CHAINED-DEPTH-2`;
- `R-CD-TOKEN`.

Do not refire `R-CW-6`, backend disposition, or any corpus-wide row in this
closure step. Require exact product/runtime/harness identity before traffic,
then record each row's signed terminal authority without relabeling the frozen
component inversion receipts.

### 3. Perform one current-upstream GATES absorb after proof closure

The latest accepted historical GATES chain is
`codeagent/129388-upstream-df9b7a5f-gates@c7131791a6d33ab83d1a820c7cdb81c1b1384931`;
it contains prior gate head
`2ffc7ca0615f5917acf809d1ccba82b0ef5b2d5a`. It is process context, not the
future merge source.

Only after all three cured rows close:

1. resolve the then-current canonical upstream `main` to one full SHA;
2. freeze and publish the post-proof runtime composite plus savegame;
3. perform exactly one explicit no-fast-forward upstream merge;
4. run the GATES preservation/acceptance plan against that exact tuple;
5. keep presentation
   `4737afdf7dcc5cca53f8dd1bdaaeaa122ce17bbd` separate until the GATES verdict.

Do not pre-absorb `df9b7a5f`, `c7131791`, or any moving upstream ref before the
three-row proof closure.

## Remaining work and uncertainty

There is no unresolved local product finding. Intentionally absent:

- runtime-composite merge and deployment;
- live three-row refire;
- proof-corpus fold;
- later single current-upstream GATES absorb;
- presentation movement;
- Mode-B or Gate 3g broad acceptance.

Those omissions are the exact next-lane boundaries, not substitutes for this
lane's focused product-cure convergence.
