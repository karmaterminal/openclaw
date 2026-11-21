# CA-A: a second budget kick-state after the lazy lifecycle import

**Red:** `src/config/sessions/disk-budget.physical-usage.test.ts` › "physical session disk usage ›
joins real SDK mutation maintenance before native fixture drainage". CI shard compact-large-19,
sub-shard `core-runtime-infra-storage-state-hosted-30` (infra config). CI's error:
`expected 2 to be 1` at `:295` (`expect(scans).toBe(1)`).

**Class:** candidate-attributable. It is deterministic at both refs, and one fork file decides it.

## What the test pins

The test runs one SDK upsert and then one SDK delete on the same store. The upsert's
disk-budget kick starts a scan, and the test holds that scan open. The delete then commits and
sends a forced kick. That kick must find the first pass still `running` and leave a
`pendingForce` behind it. So the body ends with exactly 1 scan, and the follow-up pass makes 2
after release.

Kick state is per store: `getBudgetKickState(storePath)` in
`src/config/sessions/session-history-budget-state.ts` reads a module-level
`budgetKickStateByStore` map, keyed by `sessionHistoryBudgetStoreKey(storePath)`.

## Mechanism

The earlier test in the same file, "loads database ownership inspection only for multi-store
scans", calls `vi.resetModules()` twice. Upstream added it in `d8eca04bb3` (#197801, 2026-11-13),
and it is already in 41bdde21.

- **Upstream 1129d4c0.** `session-accessor.lifecycle.ts` statically re-exports
  `deleteSessionEntryLifecycle` from `./session-accessor.sqlite-lifecycle.js`. The whole delete
  path is bound when the test file loads, before any reset. Upsert and delete share one
  `budgetKickStateByStore`.
- **Candidate.** Fork commit `68984b99d2` (2026-09-17, "fix(sessions): give the SQLite lifecycle
  owner a real lazy boundary") replaced that re-export with a wrapper. The wrapper does
  `createLazyRuntimeModule(() => import("./session-accessor.sqlite-lifecycle.js"))` and awaits it
  on first call. The first call happens inside the failing test, after the earlier test's
  `vi.resetModules()`. So the dynamic import builds a fresh module graph, with a second
  `session-history-eviction.ts` and a second `session-history-budget-state.ts`.
- **Result.** The delete's forced kick, from `withCommittedHistoryMaintenance`, reads a fresh map:
  `running=false` and `lastCheckAt=-Infinity`. It starts a second scan while the first is held.

## Proof

Every run used 1 worker, umask 0022, `FORCE_COLOR` unset, Node v26.12.1 and the isolation wrapper.
Rows are in `controls/summary.tsv`, and each raw log is in `controls/`.

| run                                           | ref                                                                  | result                               |
| --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| paired control x2                             | 1129d4c0                                                             | PASS 13/13, 13/13                    |
| paired control x2                             | 93a1e356                                                             | RED 1/13, 1/13, CI's exact assertion |
| probe                                         | 41bdde21 (same lock, same test bytes)                                | PASS 13/13                           |
| probe                                         | `ddd0ec7a7a` (stage-2 merge of 41bdde21)                             | RED                                  |
| probe                                         | `9476c7aa` (prior Mode-B head)                                       | RED                                  |
| probe                                         | `dc11bf4d80` (fork side of the 1129d4c0 merge)                       | RED                                  |
| probe                                         | `bd1e7f12d6` (the 1129d4c0 absorb merge)                             | RED                                  |
| revert proof x2                               | 93a1e356 with only `session-accessor.lifecycle.ts` at 1129d4c0 bytes | PASS 13/13, 13/13                    |
| `-t` "joins real SDK mutation maintenance" x2 | 93a1e356 (no reset ran first)                                        | PASS 1/1, 1/1                        |
| `-t` reset test + failing test                | 93a1e356                                                             | RED (1 failed, 1 passed)             |
| `-t` reset test + failing test                | 1129d4c0                                                             | PASS 2/2                             |

The instrumented probe runs at 93a1e356 had `console.error` lines added in the scratch probe
worktree only, and each file was restored with `git checkout` straight after. They are:

- `-stack-1`: the stack of each scan;
- `-kick-1`: each kick and each maintenance run, with stacks;
- `-evt-1`: an ordered event log. The delete's kick logs `running=false` and `lastCheck=-Infinity`
  right after the upsert's run started;
- `-inst-1`: a per-instance marker in `session-history-budget-state.ts`. Two instances, `6sndo5`
  and `oid5pz`, log the same `import.meta.url` and the same key.

## Fork commit and file

- `68984b99d2` (ronan, 2026-09-17), `src/config/sessions/session-accessor.lifecycle.ts`. The
  lazy wrappers cover `deleteSessionEntryLifecycle`, `resetSessionEntryLifecycle` and both
  rollbacks.
- The same commit also made `legacy-main-session-migration-operations.ts` lazy.
- It met upstream's reset test at the stage-2 merge `ddd0ec7a7a`. The fork parent `bc7e568a54`
  has the lazy wrapper but not the reset test (different test bytes and lock, so not probed).

## Graph

- Index `openclaw-absorb51ff-4b9f10dd@4b9f10dd11`, gnx cli 1.6.5 (karmaterminal/GitNexus fork).
- Verdict FRESH-FOR-SCOPE for 93a1e356 over the lifecycle facade, the sqlite lifecycle, eviction,
  budget-state, the test and `plugin-sdk/session-store-runtime.ts`.
- Anchored 1-hop walk: `gitnexus/lifecycle-facade-1hop.md`. The test reaches
  `session-store-runtime.ts` (`upsertSessionEntry`, `deleteSessionEntry`) and
  `session-history-eviction.ts` (`kickSessionHistoryDiskBudgetMaintenance`).
  `session-store-runtime.ts` calls the facade's `deleteSessionEntryLifecycle`.
- 105 test files consume the facade in one hop. Only one other calls `vi.resetModules()`:
  `src/gateway/server-restart-sentinel.continuation-delivery.test.ts`, which is not red in this
  run.

## Siblings and product effect

- **Siblings.** The reset and rollback wrappers share the lazy loader, so a test that resets
  modules before its first reset or rollback call would see the same split. No such red appears
  in this run.
- **Prior run.** Run 44733879344 at 9476c7aa does not list the test. 9476c7aa reproduces it
  locally, and that run's CA-3 unrun shards included `core-runtime-infra-storage-state` sources.
- **Product effect: none expected; reasoned, not measured.** A Node process has one module
  registry, so outside `vi.resetModules()` the lazy import returns the instances the static graph
  already holds. The bundled `dist/` chunk layout was not checked.

## Repair shape (recorded only; this lane is read-only)

At the candidate, restoring upstream's static re-export passes this test (the revert proof above).
Whether `68984b99d2`'s reasons still hold at 1129d4c0 is unverified here:

- tsdown's `[INEFFECTIVE_DYNAMIC_IMPORT]`;
- `session-history-budget-owner.test.ts`'s cold-loader premise.

Upstream 1129d4c0 itself carries a static importer (the facade) beside a dynamic one
(`session-history-eviction.ts:681`).

The other option keeps the lazy boundary and makes the test-visible state survive a module reset.
That choice belongs to the chain owner.
