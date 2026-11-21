# CA-B: the reopened Gateway's first request re-registers agent `main` mid-discovery

**Red:** `src/gateway/server-methods/agent.visitor-access.test.ts` › "visitor access admitted caller
› reopens existing profiles and grants and repairs a missing Visitor model policy". CI shard
compact-large-2, sub-shard `agentic-gateway-methods-hosted-1` (project `gateway-methods-isolated`).
compact-large-2 is one of the six shards CA-3 kept from running at 9476c7aa.

CI's error: `SessionMutationFactsUnavailableError` from `prepareSessionMutationFacts`
(`src/gateway/session-sharing-preparation.ts`), caused by `AgentDatabaseRegistryChangedError:
Agent database registry changed during discovery; retry the read.`
(`src/state/openclaw-agent-db-registry-listing.ts` `assertCurrent`).

**Class:** candidate-attributable. It is deterministic and order-dependent, and the
fork-side file is **not isolated** (see "Gap").

## Proof

Every run used 1 worker, umask 0022, `FORCE_COLOR` unset, Node v26.12.1 and the isolation wrapper.
Rows are in `controls/summary.tsv`, and each raw log is in `controls/`.

| run                                                                                                                                           | ref                                                                          | result                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| paired control x2, whole file                                                                                                                 | 1129d4c0                                                                     | PASS 5/5, 5/5                        |
| paired control x2, whole file                                                                                                                 | 93a1e356                                                                     | RED 1/5, 1/5, CI's exact error chain |
| probe, whole file                                                                                                                             | 41bdde21 (same lock, same test bytes)                                        | PASS                                 |
| probe, whole file                                                                                                                             | `ddd0ec7a7a` (stage-2 merge of 41bdde21)                                     | RED                                  |
| probe, whole file                                                                                                                             | `dc11bf4d80` and `bd1e7f12d6` (either side of the 1129d4c0 absorb)           | RED                                  |
| probe-old, whole file                                                                                                                         | `bc7e568a54` (fork parent of the stage-2 merge, its own lock and test-utils) | PASS                                 |
| `-t` failing test alone                                                                                                                       | 93a1e356                                                                     | PASS                                 |
| `-t` any one preceding `it.each` case ("Visitor Access: admin", "writer", "revoked before commit", "revoked after commit") + the failing test | 93a1e356                                                                     | RED in each of the 4                 |
| `-t` "admin" + the failing test                                                                                                               | 1129d4c0                                                                     | PASS                                 |

The test file is byte-identical at every ref (`14025f3d`).

## Mechanism (observed)

These runs were instrumented in the scratch probe only, and each file was restored straight after
(`controls/probe-t-*reg*`). Each run logged:

- every `advanceRegisteredAgentDatabasesMemo` call, with its mutation sources;
- every registry witness capture;
- the witness throw.

| run                              | agent `main` registry upserts in the restarted test | after the first witness                                     |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 1129d4c0, "admin" + failing test | 2 (setup)                                           | none; 10 witnesses, no throw                                |
| 93a1e356, failing test alone     | 2 (setup)                                           | none; 10 witnesses, no throw                                |
| 93a1e356, "admin" + failing test | 2 (setup)                                           | **2 more**, inside the first `tools.invoke`; then the throw |

At the candidate, after a preceding case, the reopened Gateway's first request re-registers the
same agent database:

- the same identity `file:66306:…`;
- schema 44;
- kind `upsert`.

That registration comes from agent-execution admission. Its async stack, from top to bottom:

1. `authorizeNative`, `agent-registration-start`;
2. `openclaw-agent-execution-owner.ts` `runExisting`;
3. `session-entry-read-facts.ts:67`;
4. the registry reader `assertCurrent`;
5. `prepareSessionMutationFacts`;
6. `resolveSessionMutationAuthorizationAsync`;
7. `authorizeGatewayRequestPreDispatch`;
8. `dispatch`.

The registration commits after `prepareSessionMutationFacts` captured its registry witness, so the
witness refuses the read.

None of these chain files differs from 1129d4c0:

- `server-methods.ts`, `request-authorization.ts`;
- `session-sharing-authorization-async.ts`, `session-sharing-preparation.ts`;
- `session-entry-read-facts.ts`;
- `openclaw-agent-execution-{owner,native,preparation}.ts`, `openclaw-agent-execution.worker.ts`,
  `openclaw-agent-db-registry-listing.ts`;
- `sqlite-worker-operation-admission.ts`.

The fork changes the order-dependent state the preceding case leaves behind.

**Upstream half.** `03115b5ed6` (#201736, 2026-11-19, in 41bdde21) changed the preceding `it.each`
cases: an admitted renewal now completes (`fulfilled`, `ownerAfter: true`). Before that, they
rejected. The fork parent `bc7e568a54` predates that change.

## Ruled out (single-file or group revert at 93a1e356, failing order)

| revert                                                                                                                                                                                                      | result |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `src/config/sessions/session-accessor.lifecycle.ts` to 1129d4c0 bytes (CA-A's lazy boundary)                                                                                                                | RED    |
| `src/state/openclaw-state-db-contract.ts` (first-use `continuation_records`)                                                                                                                                | RED    |
| the 25 fork-modified files of the forwarded-compiler-args group (`node-compiler-args.ts`, `runtime-worker-url.ts`, `worker-cpu.ts`, update-cli and others; list in `controls/revert-o1-compiler-args.list`) | RED    |

Broad reverts cannot run. They break this config's runtime pretest build, because fork-added
files import reverted exports:

- `controls/revert-A-state-infra-config.list`, 84 files;
- `controls/revert-B-rest.list`, 228 files.

## Graph

Index `openclaw-absorb51ff-4b9f10dd@4b9f10dd11`, gnx cli 1.6.5. It is **STALE** for this chain's
scope, so its answers are leads only, and each was byte-verified.

The anchored 1-hop walk from the chain files gives 180 callees. Six of them are fork-modified:

- `src/config/sessions/session-transcript-worker.types.ts`;
- `src/config/sessions/types.ts`;
- `src/infra/runtime-worker-url.ts`;
- `src/state/openclaw-agent-db-lifecycle.ts`;
- `src/state/openclaw-agent-execution.ts`;
- `src/state/openclaw-state-db-contract.ts`.

`runtime-worker-url.ts` and `openclaw-state-db-contract.ts` were reverted above, and both stay RED.
The rest are untested:

- `openclaw-agent-db-lifecycle.ts` adds only a test-only async close;
- `openclaw-agent-execution.ts` adds `assertOpenClawAgentDatabaseExecutionAdmitted`, which the
  reset lifecycle uses. Reverting it breaks the build;
- the two `types.ts` files are type-only.

## Gap

The fork commit and file are **not isolated**. Every path the walk and the source reading ranked
was either ruled out above or cannot be reverted alone. The next step is a fork-side bisection of
the post-stage-2 chain with the upstream half held fixed. That means a probe at `ddd0ec7a7a` with
fork files reverted in buildable groups, or a merge of `bc7e568a54` with `03115b5ed6`'s test
change only. It was not run here.

## Product effect

**Not ruled out.** The error is a real pre-dispatch outcome: "Session access facts are
unavailable; retry after session storage is ready". It refuses the first `tools.invoke` after a
Gateway restart in the same process, when that request re-registers its agent database. In the
test, the trigger is state an earlier case left in the same process. An in-process Gateway restart
would be the production analogue, and that is unverified.
