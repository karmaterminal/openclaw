# WO-1417 step 5 — delegate-artifact SQL as shared-state worker ops

Bound issue: karmaterminal/openclaw#1417. Lane-owned report; not product code.

## Named refs

| class | ref | full SHA |
|---|---|---|
| product/base (lane base) | `scribe/20261001/p89-l7-absorb-6b229ad8` | `a3c5391b11621ea88654d763dcc2b673ca8d8c5a` |
| upstream base for ratchets | — | `6b229ad820eef2bb222c3b6aa5c79ee4dcc57059` |
| lane branch (code head) | `codeagent/1417-step5-delegate-artifacts-worker` | `40353e0116bb983465ce754ae517d559124e765b` (local = tracking = `ls-remote`) |
| CI / workflow | N/A (orchestrator dispatches Mode-B at the merged SHA) | — |
| presentation | N/A | — |
| docs / proof | N/A | — |

The commit that adds this file sits on top of `40353e0116`; it changes no code.

## Result

The ratchet total drops by exactly **−64** (2056 at the lane base → 1992). The five delegate-artifact files now contain no main-thread SQLite.

## What changed

- **Store split.** `delegate-artifact-store.ts` keeps the constants, row and projection types, zod schemas and pure validators, and contains no SQL.
  - `delegate-artifact-store.kernel.ts` now holds `artifactDb`, `claimRowsForFlow`, `projectionsForCompletedPolicy`, `auditOperation` and `resolveClaimForRecipient`.
  - `ensureDelegateArtifactsSchema` is now built with `createOpenClawStateSchemaEnsurer`, which takes the canonical schema SQL from `delegate_artifact_policies` through the `idx_delegate_artifact_audit_recipient` index.
  - I deleted `src/state/delegate-artifacts-schema.ts`. Its DDL was byte-identical to the canonical schema section (verified by diff). The schema test now names the 5 tables and 5 indexes explicitly.
- **16 worker ops**, contract in `delegate-artifacts.worker-contract.ts`:
  - `delegateArtifacts.publish`, `.finalize`;
  - `.createPolicy`, `.readPolicyState`, `.hasRecordedCompletion`, `.isReturnConfigured`, `.removeUnacceptedPolicy`, `.purgeExpired`;
  - `.listForRecipient`, `.inspectForRecipient`, `.readForMaterialization`, `.markMaterialized`, `.discardForRecipient`;
  - `.prepareDelivery`, `.markDeliveryUnavailable`, `.recordDeliveryBinding`.
- **Worker implementation.** Ops are implemented in `delegate-artifact-{lifecycle,policy-store,recipient,delivery}.worker.ts`. `delegate-artifacts.worker.ts` dispatches them, one state write transaction per command. They are registered in `openclaw-state-worker-contract.ts` and `openclaw-state-worker-runtime.ts`.
- **Host modules.** The host files keep their names and became thin async wrappers over `runDelegateArtifactOperation` (`delegate-artifact-operation.ts`). `recordDelegateArtifactDelivery` had no production caller and is deleted; tests use a `recordDelivery` helper instead.
- **Clock.** Every op takes `now` from the **host clock at call time**, as before the cutover. The worker never reads its own clock.
  - Found in testing: the existing suites mock `Date.now` on the host (for example the retention-expiry test), and a worker-side clock silently diverged from that.
- **Async call sites.** About 30 call sites gained `await`:
  - continue-delegate tool and `prepareDelegateArtifactPolicy`;
  - `delegate-dispatch` (including `removeRejectedArtifactPolicy`), the managed gates, accepted-children and post-compaction rejection;
  - post-compaction delivery, continuation runtime, announce (`isReturnConfigured`, finalize), continuation-return;
  - session-system-events, targeting, restart-sentinel delivery;
  - the tool.
  - `assertDelegateArtifactPolicyPrepared` keeps its order relative to the surrounding awaits: it is still checked before claim registration and spawn revalidation.
- **Purge.** `purgeExpiredDelegateArtifacts` joins any purge already in flight for the same database (keyed by the admitted path). `startExpiredDelegateArtifactPurge()` runs it fire-and-forget with logging for the subagent-registry timer and boot sites. `server-maintenance` keeps its own loop guard and awaits the count.
- **R-B (finalize session IDs).**
  - `finalize` returns `needs-session-ids` (and commits nothing) until the host supplies incarnations for every recipient and the origin parent.
  - The host resolves them with the async `loadSessionEntryByKey` read. This replaces the synchronous `readSessionIdByKeySync`, and `subagent-announce-session-id.ts` is deleted.
  - After the receipt, the host re-resolves every available recipient. If an incarnation changed, it marks the recipient `delivery_terminal_reason = recipient-incarnation-changed` and drops it from the projections.
- **Finalize gate.** Finalize now runs only for `continuation-delegate-*` child runs. Policies exist only under `deriveContinuationDelegateChildRunId` IDs, so every other announce was already `not-configured`.
  - Without the gate, every ordinary announce paid a worker round trip, and in `subagent-announce.test.ts` the worker call made 9 announces return `retryable` (seen as red in caller batch 02, then fixed).
- **Inventory.** `scripts/database-worker-inventory.mjs` `workerModules` gains the kernel, with this importer evidence:
  - production importers are only `delegate-artifact-*.worker.ts`;
  - those are dispatched only from `delegate-artifacts.worker.ts`, which is imported only by `openclaw-state-worker-runtime.ts`;
  - the only other importer is the schema test.

  No ratchet baselines or scripts changed.
- **Tests.**
  - The delegate suites are converted to async and added to the database-worker lane.
  - New: `delegate-artifacts.worker-equivalence.test.ts` and `delegate-artifacts.worker-boundary.test.ts`.
  - `server-maintenance.telemetry.test.ts` (a worker-free fixture) now stubs `runDelegateArtifactGc`, as it already stubs the other worker-backed GCs.

## Equivalence receipts

"Control at base" means the identical `delegate-artifacts.worker-equivalence.test.ts` ran at `a3c5391b` against the synchronous main-thread store, in a scratch worktree that has since been removed. All 5 passed there, so the assertions describe the same behavior on both sides.

1. **Publish and finalize across a crash.** Head: PASS.
   - *Restart between publication and finalization* (equivalence): the claim converges to `available`. A second restart and replay returns an identical result, with 2 outcomes and 2 bindings and nothing doubled. Control at base: PASS.
   - *Lost receipt after the finalize commit* (boundary): the raw worker op commits and its receipt is discarded, then the DB restarts and the full finalize retries. It gets the identical result, with exactly 2 outcomes and 2 bindings. There is no pre-fix control: the receipt boundary did not exist before.
   - *Nothing commits until session IDs are supplied* (boundary): with a partial `sessionIds`, the result is `needs-session-ids` for both keys and the policy stays `active` with 0 outcomes.
2. **Duplicate completion.** Head: PASS; control at base: PASS. Two concurrent finalizes with different completion IDs produce exactly one `finalized` and one `completion-integrity-mismatch`. One `completion_id` is recorded, with 2 outcome rows. `hasRecordedCompletion` is true for the producer and false for another session key.
3. **Policy expiry.** Head: PASS; control at base: PASS.
   - A purge running concurrently with a publish, and then with a finalize, on a live policy returns 0 and the claim stays `available` with its backing.
   - Once a purge has expired the policy, a later publish is refused with `policy_expired` and the earlier claim stays `purged`.
   - *Overlapping purges join* (boundary): the second call returns the same promise, and a later call returns a new one. **Negative control:** removing the in-flight return makes it fail (`expected Promise{…} to be Promise{…}`), then restored.
4. **The 32 MB boundary.** Head: PASS; control at base: PASS.
   - Two 16 MiB candidates (exactly `MAX_TOTAL_BYTES`) publish; the stored `length(backing)` and `sha256` match.
   - One more byte is rejected with `policy_limit`.
   - A fresh policy with 16 MiB + 16 MiB + 1 gets `policy_limit`, and 16 MiB + 1 gets `invalid_candidate`.
   - 0 claims persist.
   - This also exercises the worker transport with a 32 MiB input. The broker already v8-serializes and frames inputs above 8 MiB (`SQLITE_WORKER_TRANSFER_FRAME_BYTES`); see uncertainty 1.
5. **Recipient actions through the tool.** The existing `src/agents/tools/delegate-artifacts-tool.test.ts` covers list, inspect, materialize and discard through the recipient binding only, plus publication refusal. It passes unchanged in assertions, now through the worker; it passed at base before the change too.
6. **Delivery binding.** All existing caller suites ran at the current source and passed. That includes session-system-events (drain), the server-restart-sentinel suites (`continuation-delivery`, notice and others), targeting, continuation-return (`delegate-artifacts`), announce, delegate-dispatch, post-compaction, continue-delegate tool, subagent-registry, server-maintenance (incl. `delegate-artifacts`) and the worker-free fixtures.
   - **R-B negative control** (boundary test *never leaves a recipient deliverable when its session rotates inside the read window*): with the post-receipt recheck removed, the rotated target stays in the projections (`expected ['agent:main:parent', 'agent:main:target'] to deeply equal ['agent:main:parent']`). With it restored, the test passes. A stale host view replayed later cannot prepare delivery: the result is `unavailable`.
7. **Ratchet and inventory.** See below.

## Ratchet

`node --import ./scripts/tsx.mjs scripts/check-database-worker-ratchet.mts --base 6b229ad820eef2bb222c3b6aa5c79ee4dcc57059`

- At the lane base `a3c5391b`: `Main-thread SQLite T1 total grew: 1973 -> 2056`.
- At head `40353e0116`:

```
Main-thread SQLite T1 total grew: 1973 -> 1992
  src/auto-reply/continuation/custody/custody-store.kernel.ts: 0 -> 4
  src/auto-reply/continuation/custody/legacy-taskflow-import.ts: 0 -> 4
  src/auto-reply/continuation/custody/legacy-taskflow-source.ts: 0 -> 5
  src/config/sessions/session-accessor.sqlite-recipient-authority.ts: 0 -> 6
```

No `delegate-artifact` file is listed. The remaining +19 is owned by #1417 steps 4 and 6 (custody legacy import, recipient authority), so the ratchet still exits 1 at this head. Tiers at head:

| file | tier | calls |
|---|---|---|
| `src/agents/delegate-artifact-delivery.worker.ts` | W | 9 |
| `src/agents/delegate-artifact-lifecycle.worker.ts` | W | 17 |
| `src/agents/delegate-artifact-policy-store.worker.ts` | W | 10 |
| `src/agents/delegate-artifact-recipient.worker.ts` | W | 4 |
| `src/agents/delegate-artifacts.worker.ts` | W | 1 |
| `src/agents/delegate-artifact-store.kernel.ts` | W (via `workerModules`) | 7 |

`node scripts/database-worker-inventory.mjs --check`:
- It was **already stale at base `a3c5391b`**.
- I regenerated it with `--write` (581 files, 2606 call expressions) and committed it; `--check` now prints `Current: docs/reference/database-schemas/worker-access-inventory.md`.

## Static gates at head

- **`node scripts/run-tsgo.mts`:** 385 errors at head and 385 at base `a3c5391b`, with **0 new** after path normalization. The listed `ui/src/components/session-group-defaults-dialog.ts:123` error is present. The other 384 are already at base: test-tier and `scripts/` declaration errors, e.g. `sessionFile` and `codexAttemptRuntime` in extensions tests, plus `.mjs` d.ts gaps. They are not caused by this lane.
- **Type-aware oxlint** (`node scripts/run-oxlint.mjs <changed files>`): exit 0, no findings.
- **Line-cap ratchet** with `--base 6b229ad8…`: `Line-cap ratchet OK: 928 changed source files; no new violations or over-cap growth.`
- **Unused exports:** a manual scan of the new modules (excluding `dist`) found one, `DelegateArtifactDeliveryUnavailableReason`, which is now unexported. I did not run Knip itself.

## Focused proof (CI path: focused-only; Mode-B left to the orchestrator)

All runs used `NO_COLOR=1 FORCE_COLOR=0 node scripts/run-vitest.mjs run --maxWorkers=1 <paths>`.

- **Delegate core, at head `40353e0116`:** 9 files, 39 tests, all pass, 51 s. Files:
  - `delegate-artifacts{,.delivery,.projection,.retention,.worker-equivalence,.worker-boundary}.test.ts`
  - `delegate-artifact-policy.integration.test.ts`
  - `tools/delegate-artifacts-tool.test.ts`
  - `state/openclaw-state-db.delegate-artifacts-schema.test.ts`
- **Caller suites:** 169 files in 9 foreground batches of at most 20, all pass at the source of `88c500bbdb`. Head `40353e0116` differs from it only in a type-only contract change and the regenerated doc.
  - The file set is every test mentioning delegate artifacts, plus the session-system-events, restart-sentinel, targeting, delegate-dispatch, post-compaction, continue-delegate, server-maintenance, announce, continuation-return and subagent-registry suites, the worker-free fixtures, and `send.test` and `private-completion.test`.
  - `subagent-announce.format.e2e.test.ts` is excluded; it needs E2E runtime preparation.
- **Cost of the new tests:** `worker-equivalence` ≈ 4.2 s of test time (5 tests; the 32 MiB case ≈ 1.5 s) and `worker-boundary` ≈ 3.0 s (4 tests). No timers, sleeps or polling; both are in the database-worker lane.

## Uncertainties and deviations

1. **R-E transferables.** `SqliteWorkerStore.execute` exposes no transfer list; the broker snapshots inputs with v8 `serialize` and frames them in 8 MiB chunks. So publish copies the bytes once rather than transferring them, and the caller's buffers are never detached. The size bounds and rejections are unchanged (receipt 4). Adding a transfer-list API would be a broker contract change, which is outside this lane.
2. **R-B window.** Session IDs are now read before BEGIN instead of inside the transaction. The agent database was never atomic with the state transaction, so a rotation just after commit was always possible.
   - The post-receipt recheck closes the stale-delivery path.
   - Downstream `prepareDelegateArtifactDelivery` still checks `currentRecipientSessionId`.
   - Origin-parent continuity changing after the pre-resolve is treated like the existing post-commit case: no extra global failure.
   - The bounded `needs-session-ids` loop throws after 3 tries. That would only happen if accepted recipients changed between the attempts, which policy immutability forbids.
3. **Targeting attempt order.** `targeting.ts` records the `attempt` binding after the in-memory enqueue, now with an await between them. A concurrent drain may record `attempt` first; recording is idempotent (a second `attempt` is a no-op and is skipped once acknowledged). Recipient authority and managed delivery are mutually exclusive, and the restart sentinel rechecks authority synchronously at enqueue.
4. **Dependency setup.** The shared `source/openclaw` `node_modules` is at a different lockfile, and `run-tsgo` refuses symlinked installs outside the checkout. So the worktree uses hardlinked copies (`cp -al`) of the exact-lock install in `WORKTREES/openclaw-p89-l7-absorb-6b229ad8`, which is at the same SHA `a3c5391b`. I ran no `pnpm install`. One caller run was invalidated by my own hardlinking (`Source changed during compiled subprocess invocation`) and rerun; it was not a product failure.
5. **Ratchet exit code.** It still fails overall (+19) because of steps 4 and 6, as expected for this step.
