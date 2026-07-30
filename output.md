# Independent triage — OpenClaw #1203 (R-CW-6) and #1204 (R-CW-5)

Read-only root-cause classification of the two authoritative single-fire
continuation fixture failures. No fixture was re-fired. No product or harness
code was modified.

- Candidate under review: `374ad60c6d34d3c710ddab3a13ce2189e1fd09fb`
- Reviewed harness: `karmaterminal-openclaw-docs@a566100da92a87a7fa61d5d742a745f5964d4dbf`
- Retained receipts: R-CW-5 `ff114ae9f93a53948b4501524269d749623fede9`,
  R-CW-6 `3386484adcdf16fcbae9a66dcbc4e9d298224c42`
- Triage branch: `codeagent/1203-1204-fixture-triage`

---

## 1. Headline verdict

Both issues are **one** defect, and it is **not** in the candidate.

| Issue | Row | Classification | Confidence |
|---|---|---|---|
| [#1204](https://github.com/karmaterminal/openclaw/issues/1204) | R-CW-5 | **(3) candidate/harness API-shape drift requiring a proof-harness update** — plus a secondary **(2) harness receipt-wiring defect** that misnamed the failure | Very high |
| [#1203](https://github.com/karmaterminal/openclaw/issues/1203) | R-CW-6 | **(3) candidate/harness API-shape drift requiring a proof-harness update** — plus a secondary **(2) harness receipt-wiring defect** that split one failure into three | Very high |

**Shared root cause (single):** both failing fixture templates import three
symbols from `src/config/sessions.js` that **do not exist** at the candidate.
They were retired six days before the reviewed harness commit by
`c440ae3e866` *refactor(sessions): collapse legacy JSON store (#113075)*
(2026-07-23). The templates were last authored 2026-07-17 and were never
refreshed.

| Imported by harness | State at candidate `374ad60` |
|---|---|
| `saveSessionStore` | **gone** → `saveLegacySessionStore`, `src/infra/state-migrations.legacy-session-store.ts:432` |
| `loadSessionStore` | **gone** → `loadLegacySessionStore`, `src/infra/state-migrations.legacy-session-store.ts:260` |
| `clearSessionStoreCacheForTest` | **not on the facade** → `src/config/sessions/store-writer-state.ts:14` |

`src/config/sessions.ts` exports 118 symbols at the candidate; none of the
three. Every other symbol both templates import resolves correctly (see §6).

Neither fixture ever reached continuation product code. **Both fixtures
produced zero evidence about the candidate's continuation runtime** — the
failures are pre-product, inside `beforeEach`.

---

## 2. Exact first failing surface

### #1204 / R-CW-5 — `tools/k6-proofs/fixtures/r-cw-5/cost-cap-tool-surface.test.ts`

- Import site: line 10
  `import { clearSessionStoreCacheForTest, saveSessionStore, type SessionEntry } from "../../src/config/sessions.js";`
- **First failure: line 70**, inside `beforeEach`, *before any product call*:
  `await saveSessionStore(storePath, { [sessionKey]: sessionEntry }, { skipMaintenance: true });`
  → `saveSessionStore` resolves to `undefined` → `TypeError: ... is not a function`.

The three reviewed contract assertions (lines 118–122) — zero durable
TaskFlow rows, token counter unchanged at over-cap, `2 of 2 ... elections were
not scheduled` cap notice — **were never evaluated**.

Why the retained receipt looks the way it does
(`tools/k6-proofs/scripts/run-cost-cap-fixture.mjs:537-545`):

```js
passed: test.ok && /1 passed/u.test(test.stdout),
asserted: {
  typedToolCaptured:      /disposable typed tool surface/u.test(test.stdout),
  overCapRejected:        /rejects exhausted typed-tool elections/u.test(test.stdout),
  rejectedHopNoDurableWork: /1 passed/u.test(test.stdout),
},
```

- `typedToolCaptured` / `overCapRejected` are **describe/it name greps**. Vitest's
  verbose reporter prints those names for a *failed* test too, so both read
  `true` on a total failure.
- `rejectedHopNoDurableWork` is **literally `/1 passed/`** — byte-identical to
  the aggregate `passed`. It is not an assertion on durable work at all.

That mislabel is what produced #1204's title and its "fails no-durable-work
contract" framing. The receipt named a product contract it never measured.

### #1203 / R-CW-6 — `tools/k6-proofs/fixtures/r-cw-6/max-chain-tool-surface.test.ts`

- Import site: lines 10–15 (`clearSessionStoreCacheForTest`, `loadSessionStore`,
  `saveSessionStore`, `type SessionEntry`).
- **First failure: line 114**, inside `beforeEach`, earlier still:
  `clearSessionStoreCacheForTest();` → `TypeError: ... is not a function`.

Both `it` blocks share that hook, so both fail; vitest reports `2 failed`,
exit 1.

Why **three** receipts read FAIL from **one** event
(`tools/k6-proofs/scripts/run-max-chain-fixture.mjs:660-661`):

```js
const runtimeReceipt = test.ok ? readJsonIfValid(rawRuntimeReceiptPath) : null;
const typedReceipt   = test.ok ? readJsonIfValid(rawTypedReceiptPath)   : null;
```

With `test.ok === false` both are `null`. Downstream
(`run-max-chain-fixture.mjs:818-878`) `structuredReceiptPassed`,
`durableRecoveryPassed` and `typedSurfacePassed` all evaluate `null?.x` →
`false`, and the emitted receipts are `{ ...null, passed: false, ...provenance }`.

That is exactly the retained artifact shape: `runtime-boundary.json`,
`durable-state-recovery.json` and `typed-tool-surface.json` at
`3386484` contain **only** `passed:false` plus the dependency-provenance block —
no `structuredRejection`, no `noSpawn`, no `durableState`, and
`runtime-boundary.json` has no `schema` key at all (`{...null}`). No product
measurement is present in any of them.

So #1203's "runtime scheduler **and** durable recovery **and** typed-tool
surface all fail" is one all-or-nothing gate reported three times.

---

## 3. Product-vs-harness causality

**Harness.** The correlation is exact and leaves no unexplained residue:

| Surface | Imports retired `src/config/sessions.js` symbols | Fixture result |
|---|---|---|
| `fixtures/r-cw-5/cost-cap-tool-surface.test.ts` | yes (2) | **FAIL** |
| `fixtures/r-cw-6/max-chain-tool-surface.test.ts` | yes (3) | **FAIL** (both tests) |
| `fixtures/r-cw-6/max-chain-delegate-boundary.test.ts` | **no** | PASS |
| in-repo `delegate-dispatch.cost-cap-exhaustion.test.ts` | **no** | PASS |
| in-repo `delegate-dispatch.chain-depth-exhaustion.test.ts` | **no** | PASS |
| `matrixEval` tsx probe (`scheduler.ts` only) | **no** | PASS |

Every failing surface imports the retired API. Every passing surface does not.

### Why the module still loaded instead of erroring at import

This is the detail that made the receipts look like product failures rather
than a broken import. Vite only validates named exports for **externalized**
modules — `node_modules/vite/dist/node/module-runner.js:1143`:

```js
processImport(exports, fetchResult, metadata) {
  if (!("externalize" in fetchResult)) return exports;   // ← source modules exit here
  ...analyzeImportedModDifference(exports, url, type, metadata)
}
```

`src/config/sessions.ts` is a Vite-transformed **source** module, so
`analyzeImportedModDifference` (`module-runner.js:524`) never runs. The missing
bindings become `undefined` property reads, the test module evaluates
normally, `describe`/`it` register and print, and the failure only surfaces at
first *call*, inside `beforeEach`. Vite 8.1.5 / Vitest 4.1.10 at the candidate.

That single behaviour explains both receipt shapes: R-CW-5's name-greps read
`true` while `/1 passed/` reads `false`, and R-CW-6's raw receipts were never
written.

### Is the candidate's API change itself the defect?

No. `c440ae3e866` collapses a legacy JSON session store into the canonical
SQLite path and relocates the test-only cache-clear helper. That is the
repo's stated architecture ("State/storage migrations are database-first…
Old file stores, sidecars, aliases, and fallback readers belong in
`openclaw doctor --fix` migration code only"). Every in-repo consumer was
migrated in the same change — e.g.
`src/config/sessions/disk-budget.test.ts:7` and
`src/agents/subagent-announce.self-continuation.test.ts:81` now import
`saveLegacySessionStore as saveSessionStore` from the migration module. Only
the out-of-tree proof harness was left behind.

---

## 4. Continuation-domain blast radius

**Product blast radius: none identified.** The fixtures never executed
`runAgentAttempt`, `scheduleContinuationWorkBatch`, `scheduleContinuationWork`,
`checkContinuationBudget`, or `createOpenClawContinuationTools`.

Existing owner coverage for the same contracts is green at the candidate
(§5). Source trace of the four contested surfaces, for the record:

- **Typed `continue_work` tool path** — `src/agents/tools/continue-work-tool.ts:37-92`
  (`execute(_toolCallId, args)`; the signature the R-CW-6 template calls is
  correct), registered once via `src/agents/openclaw-tools.continuation.ts:66-73`.
- **Durable attempt creation / election capture** —
  `src/agents/command/attempt-execution.ts:991-998` (`continueWorkOpts` capture)
  → `:1227-1305` (post-turn extraction) → `scheduleSpawnInitContinueWorkWake`
  `:1324-1422`.
- **Scheduler / chain-cap event shape** —
  `src/auto-reply/continuation/scheduler.ts:18-41` returns the closed union
  `"chain-capped" | "cost-capped" | null`;
  `src/auto-reply/continuation/work-dispatch.ts:610-620` logs
  `[continuation:work-rejected] chain-capped …` and returns
  `{ scheduled:false, capped:true }` **before** `enqueuePendingWork`
  (`:684`) — i.e. the rejected hop cannot create a durable row.
- **No-durable-work invariant / cap notice** —
  `scheduleContinuationWorkBatch` `src/auto-reply/continuation/work-dispatch.ts:762-784`
  returns `cappedCount = requests.length - scheduledCount` and ends the batch on
  first cap; `attempt-execution.ts:1381-1389` emits the multi-election notice
  **above** the `scheduledCount === 0` early return, then skips persistence, so
  an all-capped turn leaves chain count and token counter untouched.
- **Durable recovery** — `loadContinuationChainState`
  (`src/auto-reply/continuation/state.ts:155-165`) /
  `persistContinuationChainState` (`src/auto-reply/continuation/state.ts:172-193`).

All of that matches what the two fixtures intended to assert. It is **not** a
substitute for the fixture: it is source reading plus owner unit coverage, at
unit granularity, not the reviewed isolated-fixture granularity.

**Harness blast radius:** any other proof row whose template imports
`src/config/sessions.js` store helpers is equally dead. At `a566100` only the
two tool-surface templates do.

---

## 5. Validation performed

All commands run in the candidate worktree at `374ad60`, read-only, no fixture
fired.

### 5.1 Export probe (the decisive evidence)

`node node_modules/.bin/tsx` importing the candidate's own modules and listing
namespace keys:

```
src/config/sessions.ts            → 118 exports
  clearSessionStoreCacheForTest   MISSING
  saveSessionStore                MISSING
  loadSessionStore                MISSING
src/infra/state-migrations.legacy-session-store.ts
  loadLegacySessionStore          OK
  saveLegacySessionStore          OK
src/config/sessions/store-writer-state.ts
  clearSessionStoreCacheForTest   OK
```

Every other symbol imported by either template resolves — `config/config.ts`
(`set/clearRuntimeConfigSnapshot`), `infra/system-events.ts`
(`peekSystemEvents`, `resetSystemEventsForTest`),
`agents/command/attempt-execution.ts` (`runAgentAttempt`),
`agents/openclaw-tools.continuation.ts` (`createOpenClawContinuationTools`),
`auto-reply/continuation/{scheduler,work-dispatch,state}.ts` (all 6 symbols),
`tasks/task-flow-registry.ts` (`listTaskFlowsForOwnerKey`),
`tasks/task-runtime.test-helpers.ts` (`resetTaskFlowRegistryForTests`), and all
five `vi.mock` targets.

### 5.2 Targeted existing owner tests

Pre-existing tests only; no fixture recreated.

```
node scripts/test-projects.mjs \
  src/agents/command/attempt-execution.continue-work-opts.test.ts \
  src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts \
  src/auto-reply/continuation/delegate-dispatch.chain-depth-exhaustion.test.ts \
  src/auto-reply/continuation/work-dispatch.classification-and-cap.test.ts \
  src/auto-reply/continuation/scheduler.test.ts \
  src/auto-reply/continuation/state.test.ts \
  src/auto-reply/continuation/work-dispatch.test.ts \
  -- --maxWorkers=1
```

Result: **3 shards, 7 files, 69 tests, all passed** in 36.29s. Notably green:

- `emits the cap-notice on spawn-init when a multi continue_work batch schedules nothing at the cap`
- `stays silent for a single capped continue_work election on spawn-init`
- `schedules every same-turn continue_work tool election with independent delays`
- `does NOT tag the spawn-init continue_work flow with parentRunId`
- the two delegate-boundary suites the fixtures already reported PASS

### 5.3 Full suite

See §9 for the recorded tally.

---

## 6. Does candidate proof promotion remain blocked?

**Yes — R-CW-5 and R-CW-6 must stay honestly FAIL/PARTIAL, but for
"insufficient evidence", not for a product regression.**

- The single-fire budget was spent on a harness that could not reach the
  product. Zero bits of information about the continuation contract were
  obtained.
- Promoting either row to PASS on the strength of this triage would be
  dishonest: unit-level owner coverage is *corroborating*, not the reviewed
  isolated-fixture proof the row demands.
- Both rows become promotable only after the harness is repaired and the
  fixture is re-fired against the candidate under a fresh single-fire budget.

**Recommended issue disposition** (maintainer decision; not executed here):
reclassify #1203 and #1204 from OpenClaw product bugs to reviewed-harness
defects and move them to the harness repo, or close them with this evidence and
open one harness issue covering both. Their current framing attributes a
harness import break to the candidate's continuation runtime.

---

## 7. Turnkey follow-up workorder (harness repo)

**Repo:** `karmaterminal/karmaterminal-openclaw-docs`
**Base:** `a566100da92a87a7fa61d5d742a745f5964d4dbf`
**Scope:** proof-harness only. No OpenClaw product change is justified.

### W1 — Retarget the retired session-store API (required, unblocks both rows)

Preferred form: mirror what the candidate's own owner test does
(`src/agents/command/attempt-execution.continue-work-opts.test.ts:17-24`),
which exercises the canonical SQLite-backed accessor rather than the
migration-owned legacy JSON store. Note that
`saveLegacySessionStore`/`loadLegacySessionStore` write and read a JSON5 file,
while the production path under test persists through
`patchSessionEntry`; aliasing the legacy helpers clears the `TypeError` but is
**not** guaranteed to satisfy R-CW-6's `finalPersistedCount` assertion. Use the
accessor.

`tools/k6-proofs/fixtures/r-cw-5/cost-cap-tool-surface.test.ts` — replace line 10:

```ts
import type { SessionEntry } from "../../src/config/sessions.js";
import {
  loadSessionEntry,
  replaceSessionEntrySync,
} from "../../src/config/sessions/session-accessor.js";
import { clearSessionStoreCacheForTest } from "../../src/config/sessions/store-writer-state.js";
import { closeOpenClawAgentDatabasesForTest } from "../../src/state/openclaw-agent-db.js";
```

then replace the `saveSessionStore(storePath, {...}, { skipMaintenance: true })`
seeding at line 70 with `replaceSessionEntrySync({ storePath, sessionKey }, sessionEntry)`,
and add `closeOpenClawAgentDatabasesForTest()` to `afterEach` before the
`fs.rm`.

`tools/k6-proofs/fixtures/r-cw-6/max-chain-tool-surface.test.ts` — same import
block; replace the three `saveSessionStore(...)` seeds (lines 144, 185, 277)
with `replaceSessionEntrySync`, and the two
`loadSessionStore(storePath, { skipCache: true })` reads (lines 187, 326) with
`loadSessionEntry({ storePath, sessionKey })`, adjusting
`recoveredStore[sessionKey]` / `persisted[sessionKey]?.continuationChainCount`
to the single-entry return. All five `vi.mock` targets and every other import
in both templates are already correct at the candidate and must not be touched.

Verified present at `374ad60`: `loadSessionEntry`, `replaceSessionEntrySync`,
`replaceSessionEntry`, `patchSessionEntry`, `listSessionEntries` on
`src/config/sessions/session-accessor.js`; `closeOpenClawAgentDatabasesForTest`
on `src/state/openclaw-agent-db.js`; `SessionEntry` still on the
`src/config/sessions.js` facade.

### W2 — Make the templates fail loudly, cheaply, and *before* the single fire (required)

The templates are `.ts` files living in a docs repo with no `tsconfig.json`,
no `package.json` and no lint config; the only self-tests
(`tools/k6-proofs/scripts/__tests__/{cost-cap,max-chain}-fixture.test.mjs`) are
`node:test` suites over the `.mjs` driver (arg parsing, artifact-dir safety,
pnpm pinning). Nothing proves a template still compiles against a candidate.
That gap is what let a six-day-old API break consume an authoritative
single-fire budget.

Add a pre-flight gate inside both drivers, after the frozen-lockfile install
and before the authoritative vitest run: run the candidate's own type checker
over the rendered template in the disposable worktree, and abort with a
distinct `FAIL-harness` verdict (separate from `FAIL-fixture`) on failure, so a
harness break can never again be recorded as a candidate regression and never
consumes the row's single fire.

### W3 — Stop receipts overclaiming (required)

- `run-cost-cap-fixture.mjs:543` — `rejectedHopNoDurableWork: /1 passed/` is a
  duplicate of the aggregate wearing a product-contract name. Either delete the
  key, or make the template emit a real receipt (as R-CW-6 already does via
  `RCW6_*_RECEIPT_PATH`) and assert the actual durable-flow count. The current
  field cannot distinguish "no durable work created" from "the file failed to
  import".
- `run-max-chain-fixture.mjs:660-661` — when `test.ok` is false, emit an
  explicit `{ passed:false, reason:"runtime-surface-process-failed",
  exitCode }` receipt instead of `{ ...null }`. A provenance-only receipt is
  indistinguishable from three independent product failures, which is precisely
  how #1203 was mis-scoped.
- Both drivers: retain the failing vitest run's first error line
  (public-safe: message only, no paths, no payloads) in the receipt. Every
  minute of this triage was spent reconstructing an error the fixture already
  had in hand.

### W4 — Re-fire (after W1–W3 land and are reviewed)

Re-run both fixtures against the same candidate `374ad60` under a fresh
single-fire budget, using the exact commands in #1203 and #1204, and update the
proof rows from the new receipts.

---

## 8. Remaining uncertainty

Stated plainly, because the fixtures produced no product evidence:

1. **The candidate's continuation runtime is unproven at fixture granularity.**
   §4 is source trace + green owner unit tests. It is entirely possible that a
   repaired fixture still fails on a real product issue. This triage does
   **not** clear the candidate; it explains why the evidence is void.
2. **Exact error text not recovered.** The retained receipts keep no stderr, and
   re-firing is prohibited, so the `TypeError` line is inferred — from the
   confirmed missing exports, the confirmed Vite source-module behaviour, and a
   receipt shape that matches that path exactly and matches no other. The
   inference chain is tight but it is an inference, not a captured log.
3. **Per-`it` attribution for R-CW-6 is inferred.** The harness discards raw
   receipts on `test.ok === false`, so it cannot be shown from artifacts alone
   that *both* tests failed rather than one — though both share the failing
   `beforeEach`, so both must.
4. **W1's accessor migration is unverified end-to-end.** The replacement symbols
   are confirmed present and the owner test uses exactly this pattern, but the
   rewritten templates were not executed here (that would recreate the
   single-fire fixture). W2's type gate plus the W4 re-fire is where that gets
   proven.
5. **Other proof rows not audited.** Only the R-CW-5/R-CW-6 templates were
   checked for API drift; a sweep of the remaining `tools/k6-proofs` surface
   against `374ad60` was out of scope.

---

## 9. Full-suite validation

Command (sanctioned runner, whole suite, no hand-picked subset):

```
node scripts/test-projects.mjs
```

**Result:** see the recorded tally appended below.

<!-- FULL-SUITE-TALLY -->

---

## 10. Files changed

Diagnosis only. No product file, no test file, and no harness file was
modified. This branch adds `output.md` and nothing else.
