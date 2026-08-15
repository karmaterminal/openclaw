# Fleet causal isolation: micro-PR consultation

Consultation snapshot:

- Report basis: `output.md` and every artifact under `causal-proof/`.
- Frozen deployed composite: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`.
- Pure continuation parent: `99ce36658eef9d4a9ad9eca6782ffa0ee7891fd6`.
- Current upstream main inspected: `4be9091a3ef615083ed89aa787d727fff1cc8e3b`.
- Upstream PR #121204 inspected at `b958ca22efd5e67de16746d1341d6bea7c594847`.
- Exact Codex dependency rechecked: `@openai/codex@0.147.0`,
  `rust-v0.147.0`, `be6e8eac029b183056b7e4402879f15d2c85f61b`.

The decisive split is:

1. **Implement now:** durable-ingress abandonment retry budgeting. Its violated
   invariant, owner, observed cadence, and existing policy primitive are all
   proven.
2. **Instrument now, repair later:** Codex settled-context rejection, ingress
   terminal lineage, reply-turn admission rejection, and prepared-route
   materialization. Their missing discriminators are concrete defects, but the
   downstream behavioral repair is not selected yet.
3. **Fossil first, no product repair yet:** agent-SQLite fenced-read latency.
   The hot synchronous read is proven, but `ANALYZE`, query shape, JSON decode,
   freelist, and corruption remain competing causes.

No second behavioral repair is ready now. Silence is a shared effect, not a
shared cause.

## Decision table

| ID  | Micro-PR                                | Class                             | Ready now?       | Behavioral repair selected?                              |
| --- | --------------------------------------- | --------------------------------- | ---------------- | -------------------------------------------------------- |
| M1  | `ingress-abandonment-retry-budget`      | Implementation                    | **Yes; first**   | **Yes**                                                  |
| M2  | `codex-settled-context-reason`          | Instrumentation + incident fossil | **Yes; second**  | No; successor waits for one observed reason              |
| M3  | `channel-ingress-completion-lineage`    | Instrumentation                   | **Yes; third**   | No; successor waits for one owner-native terminal fact   |
| M4  | `agent-sqlite-fenced-read-plan-fossil`  | Proof/test only                   | **Yes after M3** | No; no honest repair before copied-state counterfactual  |
| M5  | `reply-turn-admission-reason`           | Instrumentation                   | **Yes after M4** | No; successor waits for one of three producer branches   |
| M6  | `prepared-route-materialization-reason` | Instrumentation                   | **Yes last**     | No; successor also needs an approved authenticated probe |

“Ready” means the named micro-PR can be authored now. It does not mean that a
reason-specific successor may be guessed and bundled into it.

## Exact order and dependency DAG

Ward execution order is serial:

```text
M1 abandonment budget
  |
  v
M2 Codex context reason
  |
  v
M3 ingress completion lineage
  |
  v
M4 copied agent-SQLite fossil
  |
  v
M5 reply-turn admission reason
  |
  v
M6 prepared-route materialization reason
```

Those arrows are treatment serialization, not invented semantic dependencies.
The causal dependencies are:

```text
M1 ----------------------------------------------> complete

M2 -> copied affected-agent replay -> C2 one Codex owner repair

M3 -> isolated nonce lineage
   -> [if "delivery-returned-without-handoff"] M3b one producer discriminator
   -> C3 one selected Rune owner repair

M4 -> immutable-copy before/after counterfactual
   -> [ANALYZE wins] contribute proof to upstream #119901
   -> [query/decode wins] C4 bounded read-owner repair
   -> [integrity fails] C4-corruption separate offline recovery work

M5 -> isolated/session-copy observation
   -> [recovery-owner-invalidated] evaluate upstream #118879
   -> [expected-session-mismatch] C5 session-generation owner repair
   -> [pre-operation-interrupted] no repair unless interruption is itself wrong

M6 -> operator-approved authenticated candidate probe
   -> C6 exactly one provider/catalog/route owner repair
```

After M3, take a conditional successor only when its parent evidence has already
selected one owner and its fixed-semantics fossil is ready. Priority among
unblocked successors is `C2`, `C3`, `C4`, `C5`, then `C6`. Otherwise continue
to the next instrumentation/fossil PR. Never keep a coding branch open while
waiting for fleet evidence.

## M1 — implement `ingress-abandonment-retry-budget`

**Verdict:** implementation-ready now. This is the only immediate behavioral
repair.

### Owner and scope

- Owner: `src/channels/message/ingress-drain.ts`
  - `createLifecycle`
  - `ChannelIngressDispatchLifecycle.onAbandoned`
  - existing `applyFailureDisposition`
- Reused policy, normally no production edit:
  `src/channels/message/ingress-retry-policy.ts`
  `resolveIngressFailureDisposition`.
- Fossil: extend `src/channels/message/ingress-drain.test.ts`; use the real
  SQLite ingress queue and real drain loop.
- Negative-control coverage:
  `src/channels/message/ingress-drain.cancellation.test.ts`.

Target production delta: one call-site replacement, net `-3..+5` LOC. No new
helper, error hierarchy, config, schema, retry mode, or channel-specific branch.
Target test delta: `+50..+90` LOC in existing owner tests.

The canonical repair is to send ordinary abandonment through the existing
failure disposition so the configured attempt budget can dead-letter it.
Explicit cancellation remains the separate budget-free release path.

### Fixed-semantics RED fossil

In a temporary state directory:

1. Enqueue row A and then row B in the same lane.
2. Configure `maxAttempts=8`, `deadLetterMinAgeMs=0`, and zero test backoff.
3. Cause A to reach `onAbandoned()` eight times before adoption.
4. Require A to end failed with `reason=retry-limit-exceeded`.
5. Require B to become claimable and run.

On the unpatched base, A remains pending and B remains lane-blocked: RED for
the intended reason. Require patch GREEN, patch-only revert RED, and reapply
GREEN.

### Negative controls and authority

- `onCancelled()` reopens the row without consuming retry budget.
- Abandonment below the budget remains retryable.
- `onAdopted()` still writes one completed tombstone.
- Guillotined, superseded, or already-settled claims do not settle twice.
- Another lane progresses independently.

**Proof authority:** real queue schema + real claim/release/fail transitions +
real drain lifecycle. A mocked retry-policy unit test is insufficient.

**Live proof:** not required to merge. An isolated Gateway/state-directory
smoke is optional before treatment-composite use; Discord delivery is not
needed.

**Mutation gate:** temporary state directory only. Never touch Silas’s live
queue, session, or failed rows.

### Required non-continuation corpus rows

Under `PR-NNNNNN/PROOFS/<FULL_SHA>/`:

| Row                          | Required receipt                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `R-NC-ABANDON-BUDGET`        | Base RED, patch GREEN, revert RED, reapply GREEN; exact eight-attempt state transitions |
| `R-NC-ABANDON-LANE-PROGRESS` | Row B starts only after A reaches terminal disposition                                  |
| `R-NC-ABANDON-CANCEL`        | Cancellation preserves attempt count and remains pending                                |
| `R-NC-ABANDON-SETTLE-RACE`   | Adopt/guillotine/supersede negative controls prove one settlement                       |

## M2 — instrument `codex-settled-context-reason`

**Verdict:** instrumentation-ready; behavioral repair forbidden until one
reason is observed on a copied affected store.

### Owner and scope

- Owner: `extensions/codex/src/app-server/settled-turn-context.ts`
  - `buildCodexSettledTurnFinalizationContext`
  - `captureCodexSettledTurnFinalizationContext`
- Caller/receipt:
  `extensions/codex/src/app-server/run-attempt-finalize.ts`
  `finalizeCodexAttempt`.
- Fossil: extend
  `extensions/codex/src/app-server/settled-turn-context.test.ts`.

Return one private domain-rich discriminated result instead of collapsing every
branch to `undefined`. The closed reason set should distinguish at least:

- `missing-history`
- `missing-boundary-identity`
- `required-identity-shape`
- `duplicate-history-identity`
- `duplicate-mirror-identity`
- `mirror-boundary-order`
- `history-boundary`
- `history-boundary-order`
- `source-evidence-mismatch`
- `capture-error`

The existing warning may add only the reason plus existing thread/turn
identities. It must not add transcript text, tool arguments/results, paths,
session content, or serialized evidence.

Target production delta: `+35..+55` LOC across two files. Target tests:
`+80..+130` LOC. No public Plugin SDK surface and no attestation relaxation.

### Fixed-semantics RED fossil

Table-drive one fixture per rejection branch and require its exact closed code.
The unpatched base returns only `undefined`, so it fails semantically rather
than by compile error. A valid fixture must still return byte-equivalent frozen
context.

After unit closure, replay one sanitized immutable copy of an affected agent DB
with provider and channel adapters disabled. The copied-store run must select
exactly one reason before C2 is opened.

### Negative controls and authority

- Valid identity/order/evidence still succeeds unchanged.
- Duplicate, reordered, missing, and source-mismatched evidence still fails
  closed.
- No reason branch synthesizes missing history or falls back to Codex’s final
  message summary.
- Yield remains separate; the fleet traces had zero yield markers, so upstream
  #124176 is not part of this PR.
- Log capture proves payload and transcript text are absent.

**Proof authority:** the pure context-builder matrix plus copied-store replay.
Codex `0.147.0` confirms why OpenClaw owns this mirror: Codex drains in-flight
tool futures before completion (`codex-rs/core/src/session/turn.rs:2086-2110`,
`2695-2708`), `turn/completed` carries only the last agent-message summary
(`codex-rs/app-server/src/bespoke_event_handling.rs:1267-1301`), and item
completion is separate (`1434-1442`).

**Live proof:** no live fleet or Discord proof for M2. Copied-store replay is
required before C2. A later user-visible C2 needs an isolated Gateway proof.

**Mutation gate:** never read or mutate a live agent DB for this fossil; copy
the DB and sidecars under a frozen owner boundary. No credentials, provider
calls, channel sends, or weakened attestation.

### Required non-continuation corpus rows

| Row                            | Required receipt                                                   |
| ------------------------------ | ------------------------------------------------------------------ |
| `R-NC-CODEX-CONTEXT-REASONS`   | Closed rejection matrix, base RED and patch/revert/reapply closure |
| `R-NC-CODEX-CONTEXT-VALID`     | Valid context remains byte-equivalent and frozen                   |
| `R-NC-CODEX-CONTEXT-COPY`      | Sanitized copied-store run selects one exact reason                |
| `R-NC-CODEX-CONTEXT-REDACTION` | Warning contains reason/IDs only; forbidden content absent         |
| `R-NC-CODEX-CONTRACT`          | Exact `0.147.0` dependency SHA/tag and cited contract snippets     |

## M3 — instrument `channel-ingress-completion-lineage`

**Verdict:** instrumentation-ready. Do not pretend the drain already knows
whether no handoff was a policy gate, intentional silence, or downstream
delivery loss.

### Owner and scope

- Contract:
  `src/channels/message/ingress-drain-lifecycle.ts`
  `ChannelIngressDispatchLifecycle`.
- Durable writer:
  `src/channels/message/ingress-drain.ts`
  `completeClaimWithRetry`.
- Authoritative monitor branch:
  `src/channels/message/ingress-monitor.ts`
  `ChannelIngressMonitorLifecycle` and the `!handedOff` completion branch.
- Existing storage:
  `src/channels/message/ingress-queue.ts`
  `ChannelIngressQueue.complete` and `completed_metadata_json`.
- Tests: extend `ingress-drain.test.ts`, `ingress-monitor.test.ts`, and
  `ingress-queue.test.ts`; do not add a second queue implementation.

Record only facts known at the producer:

- `agent-run-adopted`
- `delivery-returned-completed`
- `delivery-returned-without-handoff`

The source event ID is already the queue row identity. Carry `runId` only when
the adopting producer actually supplies it; unknown stays absent. Failed work
already belongs in the failed-row owner and must not also be written as a
completed terminal error.

Do **not** install the report’s full five-value guess at the drain layer.
`policy-gate`, `intentional-silence`, and `direct-visible-delivery` must be
minted later by the producer that actually knows them. If Rune lands in
`delivery-returned-without-handoff`, M3b adds one discriminator at that producer
only.

Target production delta: `+45..+75` LOC across the existing lifecycle, drain,
and monitor contracts; queue storage should require no schema or DDL change.
Target tests: `+100..+160` LOC.

### Fixed-semantics RED fossil

Use a real SQLite queue and monitor:

1. Delivery calls adoption with a known run ID; completed metadata must record
   `agent-run-adopted` and that exact ID.
2. Delivery explicitly returns completed without adoption; record
   `delivery-returned-completed`.
3. Delivery returns without result or handoff; record
   `delivery-returned-without-handoff`.

The base completes all three with null metadata, so all three are RED for the
intended reason.

### Negative controls and authority

- Payload, author, channel message body, display label, and inferred identity
  never enter completed metadata.
- Missing run ID remains absent; it is never inferred from session key or route.
- Retryable failure remains pending; terminal failure remains failed.
- Duplicate lookup continues to decode old null metadata.
- Existing rows without metadata remain valid.

**Proof authority:** real monitor -> drain -> SQLite completed tombstone,
including restart reopen. Unit-testing only the enum is insufficient.

**Live proof:** deterministic proof is enough for M3. To select C3 for Rune,
run one operator-approved nonce in an isolated Discord test channel and require
one ingress event plus one owner-native terminal outcome. No repair claim before
that receipt.

**Mutation gate:** existing nullable metadata only; no schema-version bump,
dual write, payload retention, identity inference, or live-fleet backfill.

### Required non-continuation corpus rows

| Row                       | Required receipt                                                   |
| ------------------------- | ------------------------------------------------------------------ |
| `R-NC-INGRESS-ADOPTED`    | Real queue records `agent-run-adopted` with exact supplied run ID  |
| `R-NC-INGRESS-COMPLETED`  | Explicit completed return records its distinct fact                |
| `R-NC-INGRESS-NO-HANDOFF` | Void/no-handoff completion records its distinct fact               |
| `R-NC-INGRESS-BACKCOMPAT` | Null/legacy metadata reopens and duplicate-detects unchanged       |
| `R-NC-INGRESS-REDACTION`  | Bounded metadata allowlist; payload/identity negatives             |
| `R-NC-RUNE-NONCE`         | Pending until approved live nonce; one event, one terminal outcome |

## M4 — freeze `agent-sqlite-fenced-read-plan-fossil`

**Verdict:** fossil-first. No product repair is honest yet.

### Owner and scope

- Source owner, not edited until evidence selects a repair:
  `src/config/sessions/session-accessor.sqlite-read.ts`
  `loadTranscriptEventsSync` and `loadTranscriptEventsFromDatabase`.
- Fence query:
  `src/config/sessions/session-transcript-read-fence.ts`
  `resolveSqliteSessionTranscriptReadFence`.
- Existing candidate repair: upstream #119901,
  `src/commands/doctor-sqlite-compact.ts`.

M4 should be test/proof-only: production LOC `0`. Prefer a small existing-test
extension or an out-of-tree immutable-copy runner over a new product CLI. If a
checked-in test harness is unavoidable, cap it at `+90..+140` test/support LOC
and make it accept only a copied path.

The source already proves that the exact fenced read selects all matching
`event_json` rows and synchronously parses them. It does not prove whether SQL
planning, row volume, JSON decode, freelist, or corruption dominates.

### Fixed-semantics RED fossil

The RED is the frozen pre-intervention copied-state receipt, not an arbitrary
wall-clock assertion:

- hash and size of copied DB and sidecars;
- SQLite version and relevant pragmas;
- `sqlite_stat1` presence/content hash;
- exact `EXPLAIN QUERY PLAN` for the fence and transcript queries;
- row count and selected byte count;
- separated SQL-materialization and JSON-decode timings;
- page/freelist counts and read-only integrity result;
- repeated cold and warm samples.

Clone that frozen copy. Run `ANALYZE` only on clone B, then repeat the exact
receipt. A product PR exists only if one intervention changes the causal metric
with the required negative controls.

### Negative controls and authority

- Identical untouched clone A/A’ controls cache and run-order effects.
- Small healthy DB controls fixed harness overhead.
- Same session ID, fence, query, SQLite build, and sample count on both sides.
- Query result rows and serialized event bytes remain identical.
- Integrity failure diverts to a separate corruption lane; it cannot be counted
  as an `ANALYZE` performance win.

**Proof authority:** immutable copied store plus same-copy counterfactual.
Synthetic SQLite tests cannot establish the fleet cause.

**Live proof:** none. This lane must remain offline.

**Mutation gate:** no `quick_check`, `integrity_check`, `ANALYZE`, `VACUUM`,
checkpoint, copy, or sidecar operation while a live Gateway owns the DB. No
fleet path in command history or public artifacts.

### Required non-continuation corpus rows

| Row                           | Required receipt                                                      |
| ----------------------------- | --------------------------------------------------------------------- |
| `R-NC-SQLITE-SNAPSHOT`        | Copy identity, sidecars, hashes, SQLite version, owner stopped/frozen |
| `R-NC-SQLITE-FENCED-READ-RED` | Exact plan, counts, bytes, split timings, integrity/freelist facts    |
| `R-NC-SQLITE-ANALYZE`         | Clone-B-only counterfactual with unchanged result bytes               |
| `R-NC-SQLITE-RUN-ORDER`       | A/B/A’ order control                                                  |
| `R-NC-SQLITE-SMALL-CONTROL`   | Healthy small-store harness baseline                                  |
| `R-NC-SQLITE-NO-MUTATION`     | Proof that source snapshot hash and sidecars never changed            |

If `ANALYZE` wins, do not open a duplicate fix. Attach the corpus to upstream
#119901 and evaluate that three-production-line doctor change. If it does not
win, #119901 is not the fleet repair.

## M5 — instrument `reply-turn-admission-reason`

**Verdict:** instrumentation-ready; recurring-session repair remains
unselected.

### Owner and scope

- Owner:
  `src/auto-reply/reply/reply-turn-admission.ts`
  `rejectLifecycleInvalidatedWork` and `admitReplyTurn`.
- Fossil:
  `src/auto-reply/reply/reply-turn-admission.test.ts`.
- Observation caller only if needed for a bounded diagnostic:
  `src/auto-reply/reply/followup-turn-admission.ts`.

Attach one closed reason to the existing lifecycle-invalidated error while
preserving its exact user-facing text:

- `expected-session-mismatch`
- `recovery-owner-invalidated`
- `pre-operation-interrupted`

Do not change admission, waiting, recovery ownership, or retry behavior in M5.
Target production delta: `+15..+30` LOC, preferably in the owner file only.
Target tests: `+45..+80` LOC.

### Fixed-semantics RED fossil

Trigger each existing branch through `admitReplyTurn` and require the exact
reason plus the unchanged message. The base emits one indistinguishable error
for all three, so the matrix is RED.

### Negative controls and authority

- Error message and queued/visible throw behavior remain unchanged.
- Successful admission and active-run deferral remain unchanged.
- No retry-budget logic enters this PR; M1 owns that invariant.
- No branch is “fixed” merely to make its reason disappear.

**Proof authority:** real admission state and recovery-owner fixtures in the
existing owner test, followed by one isolated/session-copy observation that
selects Silas’s actual branch.

**Live proof:** not required for M5. C5 requires the selected branch. If the
reason is `recovery-owner-invalidated`, evaluate #118879 instead of duplicating
it; the other reasons do not belong to that PR.

**Mutation gate:** temporary session/store state only. No live session reset,
recovery-owner claim, ingress-row edit, or Gateway restart.

### Required non-continuation corpus rows

| Row                      | Required receipt                                           |
| ------------------------ | ---------------------------------------------------------- |
| `R-NC-ADMISSION-REASONS` | Three-branch base RED and patch/revert/reapply closure     |
| `R-NC-ADMISSION-MESSAGE` | Exact user-visible text unchanged                          |
| `R-NC-ADMISSION-SUCCESS` | Successful and active-run controls unchanged               |
| `R-NC-SILAS-REASON`      | Pending isolated/session-copy receipt selecting one branch |

## M6 — instrument `prepared-route-materialization-reason`

**Verdict:** instrumentation-ready; provider repair requires approved live proof.

### Owner and scope

- Owner:
  `src/agents/runtime-plan/materialize-model.ts`
  `materializePreparedRuntimeModel`.
- Immediate caller/cache:
  `src/agents/runtime-plan/credential-scoped-model.ts`
  `createPreparedRuntimeModelMaterializer`.
- Fossil:
  `src/agents/runtime-plan/materialize-model.test.ts`.

Use one private typed error/result with closed, redacted reasons. At minimum:

- `resolved-model-missing`
- `resolved-provider-mismatch`
- `resolved-model-mismatch`
- `resolved-route-mismatch`
- `prepared-target-mismatch`
- `caller-model-mismatch`

Carry only normalized provider/model identifiers, API class, base-URL class,
and auth-requirement class when already authoritative. Never carry a URL,
profile ID, token, SecretRef, header, or credential-derived string. Preserve
exact route enforcement and fallback ordering.

Target production delta: `+25..+45` LOC, plus at most one small caller receipt.
Target tests: `+70..+110` LOC.

### Fixed-semantics RED fossil

Table-drive each mismatch through the real materializer and require its exact
reason. The base collapses the resolved failures into one generic error, so the
matrix is RED. Valid exact routes and existing thrown text compatibility remain
negative controls.

### Negative controls and authority

- Exact prepared route still passes.
- Provider, model, API, base URL, and auth requirement mismatches still fail
  closed.
- Fallback order is unchanged.
- Error serialization proves forbidden auth/URL/profile material absent.
- GitHub Copilot credential cleanup is not part of this PR.

**Proof authority:** materializer matrix plus existing fallback-decision receipt.
The later repair requires one authenticated candidate-at-a-time route probe.

**Live proof:** not required to merge M6’s classifier. It is mandatory before
C6 because this is external provider behavior. Run with explicit operator
approval, isolated session, channel delivery disabled, and no credential output.

**Mutation gate:** no config write, reauthentication, fallback reorder, model
catalog mutation, or credential output.

### Required non-continuation corpus rows

| Row                      | Required receipt                                                      |
| ------------------------ | --------------------------------------------------------------------- |
| `R-NC-ROUTE-REASONS`     | Closed mismatch matrix with base RED and patch/revert/reapply closure |
| `R-NC-ROUTE-EXACT`       | Exact prepared route remains accepted                                 |
| `R-NC-ROUTE-ORDER`       | Terra -> Sol -> Copilot candidate order unchanged                     |
| `R-NC-ROUTE-REDACTION`   | Forbidden URL/profile/auth/token fields absent                        |
| `R-NC-ELLIOTT-CANDIDATE` | Pending approved live candidate probe selecting one owner             |

## Conditional repair micro-PR gates

Do not open these until their parent row has one exact observed value:

| Successor                             | Opens only when                                             | Maximum intended scope                                                  |
| ------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| C2 Codex owner repair                 | `R-NC-CODEX-CONTEXT-COPY` selects one reason                | One producer/attestation owner, `<=60` production LOC, `<=150` test LOC |
| M3b completion producer discriminator | `R-NC-RUNE-NONCE` says `delivery-returned-without-handoff`  | One delivery producer, `<=40` production LOC                            |
| C3 Rune repair                        | An owner-native terminal fact selects one broken branch     | One owner and one boundary fossil                                       |
| C4 SQLite repair                      | One copied-state intervention wins with A/B/A’ controls     | Existing #119901 or one read/query owner, never both                    |
| C5 session repair                     | `R-NC-SILAS-REASON` selects one branch                      | One session/recovery owner; #118879 only for its exact branch           |
| C6 route repair                       | `R-NC-ELLIOTT-CANDIDATE` selects one provider-owned failure | One provider/catalog/route owner plus authenticated live proof          |

If the selected repair cannot fit those bounds without crossing a real owner
boundary, stop and split it again. Do not raise the bound to preserve a guessed
solution.

## Tempting amalgamations — explicitly forbidden

1. **All silence families together:** Cael/Ronan/Emeric finalization, Rune
   lineage, Silas retry starvation, and Elliott auth text are not one defect.
2. **M1 + M5:** bounding abandonment and identifying why admission rejected are
   independent invariants and fossils.
3. **M1 or M3 + upstream #121204:** sharing `ingress-drain.ts` is textual
   overlap, not one owner contract.
4. **M2 + upstream #124176:** the fleet traces have zero `sessions_yield`
   markers.
5. **M2 + M4:** a slow read and a context rejection co-occur; causation is not
   proven.
6. **M4 + corruption recovery:** planner statistics, query/decode cost,
   freelist, sidecar loss, and corruption require separate interventions.
7. **M4 + #119901 before the counterfactual:** “large DB” is not proof that
   `ANALYZE` is the fix.
8. **M5 + #118879 before reason selection:** #118879 repairs only terminal
   restart-recovery residue.
9. **M6 + Copilot cleanup/reauthentication:** OpenAI route materialization and
   expired Copilot fallback are distinct owners.
10. **Instrumentation + guessed repair in one PR:** this destroys the RED
    discriminator and lets a repair hide which branch occurred.
11. **Any non-continuation repair + continuation feature changes:** `99ce`
    feature semantics are not evidence for these fleet repairs.
12. **Any SQLite schema/default/config addition:** none is required by the
    proven defects.
13. **Static proof-substrate failures + product failures:** missing prior corpus
    artifacts cannot be counted as runtime RED.
14. **Multiple provider/channel owners in one PR:** one observed reason, one
    owner, one fossil.

## Upstream PR #121204: keep every item independent

**Decision: none of M1-M6 belongs in upstream PR #121204.**

PR #121204 is live/open at
`b958ca22efd5e67de16746d1341d6bea7c594847`, currently conflicting, and changes
17 files (`+2668/-164`). Its contract is:

- pre-claim pending-row disposition;
- stale Discord ambient classification;
- retry-eligible candidate selection and lane freshness.

M1 owns post-claim, pre-adoption abandonment disposition. M3 owns completed
tombstone lineage. M2, M4, M5, and M6 do not touch #121204’s contract at all.
The M1 fossil cannot prove stale-ambient safety, and #121204’s stale-backlog
fossils cannot prove an eight-abandonment terminal budget. Therefore the
required “same owner + same contract + same fossil” test fails.

The overlap is actually a reason to keep them separate: #121204 rewrites the
same drain region and is already XL. Adding retry budgeting or completion
lineage would erase independent RED/GREEN closure, increase message-delivery
risk, and worsen its current conflict.

By: Emeric (@emeric-dandelion-cult, acct 2026-05-25) | OpenClaw: 1 PR, 0
issues, 0 commits/12mo | GitHub: 94 commits, 39 PRs, 27 issues, 34 reviews/12mo.

Treat #121204 only as a separately replayed treatment dependency for a usable
test seat. It is neither a parent nor a destination for this causal repair DAG.

## First three that maximize safe continuation work

1. **M1 — abandonment budget.** It restores finite lane progress and prevents
   one never-adopted message from indefinitely starving later proof traffic.
2. **M2 — Codex context reason.** It converts the exact continuation/finalizer
   failure from an undifferentiated warning into a copied-store-selectable
   owner fact without weakening attestation.
3. **M3 — ingress completion lineage.** It makes “transport replay completed”
   distinguishable from agent-run adoption and no-handoff completion, so a
   continuation proof can state what terminal event actually occurred.

M4 is fourth because SQLite is a proven liveness amplifier but not yet a
selected repair. M5 is fifth because M1 first contains Silas’s starvation even
before its recurring producer is known. M6 is last because it is seat-specific
and its successor requires an authenticated external side effect.

## Current-upstream implementation and `99ce` composition

`99ce3665` is not an ancestor of current upstream main, so do not merge or
rebase the continuation branch merely to import these fixes. Build each
micro-PR against current upstream, preserve its standalone commit, and
cherry-pick or patch-port only that commit onto the treatment assembly.

Exact blob comparison at consultation time:

| Micro-PR | Current main vs `99ce`                                                                  | Composition risk                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| M1       | `ingress-drain.ts`, retry policy, and owner test are byte-identical                     | **Low semantically**; textual conflict with replayed #121204, so apply M1 before #121204 or manually port and rerun all M1 rows     |
| M2       | `settled-turn-context.ts` and its test are byte-identical                               | **Low**; `run-attempt-finalize.ts` has one unrelated continuation-result addition, so resolve that one caller hunk manually         |
| M3       | ingress drain, queue, monitor, and their tests are byte-identical                       | **Low before treatment replay**; #121204 changes all three, so never blind-cherry-pick onto an already reconstructed treatment side |
| M4       | hot read is unchanged; current main adds a separate inspection helper later in the file | **Low for proof**, moderate for test context; no product cherry-pick until evidence selects a repair                                |
| M5       | `reply-turn-admission.ts` and owner test are byte-identical                             | **Low** if confined to the owner. Any successor touching continuation-only callers must be built directly on `99ce`                 |
| M6       | `materialize-model.ts` and owner test are byte-identical                                | **Lowest**; direct standalone cherry-pick, then rerun route rows                                                                    |

Recommended treatment assembly order:

```text
99ce pure continuation
  + standalone M1
  + standalone M2
  + standalone M3
  + any independently proven M4/M5/M6 instrumentation
  + separately replayed #121204 treatment patch
  = new runtime composite with every component SHA recorded
```

If the existing treatment side must be retained, manually port M1/M3 after
#121204 and require both PRs’ full owner fossils. A clean textual merge is not
proof of semantic composition.

Do not implement against current upstream and then port any repair that touches
deleted/diverged continuation machinery such as the old continuation
scheduler/delegate paths. Those repairs are `99ce`-native and need their own
continuation corpus.

## Proof-corpus contract for every micro-PR

Every product PR publishes only exact-head evidence under:

```text
PR-NNNNNN/PROOFS/<FULL_SHA>/
```

Required top-level files:

- `README.md` — verdict and honest limits.
- `RESOLVED-SHA.md` — product head, base, runtime composite, and component SHAs.
- `METHOD.md` — fixed command order, source trust, redaction, and mutation gate.
- `proofs-manifest.json` — machine-readable row ledger.

Every row directory contains `EVIDENCE.md` plus immutable raw receipts. The
manifest records at least:

- `row`
- `dir`
- `state`
- `rawVerdict`
- `effectiveExitCode`
- `envelopeValidated`
- `pendingReceipts`
- `artifactDirs`
- `evidence_doc`
- `sourceRuns`
- `runtimeCompositeSha`

Rules:

1. Use the full 40-character product SHA in the directory.
2. Record the runtime composite separately when it differs from product head.
3. A fixed-semantics code PR needs base RED, patch GREEN, patch-only revert RED,
   and reapply GREEN.
4. Instrumentation rows pass only when they emit the exact bounded fact; they
   do not claim the downstream illness is repaired.
5. Missing live/copy receipts remain explicit `pendingReceipts`; they never
   become “proof sufficient” by prose.
6. Static-reader substrate failures remain classified separately from product
   failures.
7. No payloads, transcripts, credentials, account/channel IDs, live paths, or
   fleet host data enter the public corpus.

## Project 87 recommendations

Project 87 currently contains only fork issue #1254 with status
`in_coding_agent`. Its available status flow is `Todo` -> `in_coding_agent` /
`In Progress` -> `prince_review` -> `swim` -> `Done`; it has native Parent issue
and Sub-issues progress fields but no dependency field.

Recommended structure, without creating or mutating items in this consultation:

| Recommended child item                           | Initial status                                                | Dependency recorded in issue body      |
| ------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| M1 Bound durable-ingress abandonment retries     | `in_coding_agent` when work actually starts; otherwise `Todo` | None                                   |
| M2 Record Codex settled-context rejection reason | `Todo`                                                        | M1 only as ward serialization          |
| M3 Retain ingress completion lineage             | `Todo`                                                        | M2 only as ward serialization          |
| M4 Freeze copied agent-SQLite fenced-read plan   | `Todo`                                                        | M3 only as ward serialization          |
| M5 Record reply-turn admission rejection reason  | `Todo`                                                        | M4 only as ward serialization          |
| M6 Record prepared-route materialization reason  | `Todo`                                                        | M5 only as ward serialization          |
| C2 Codex owner repair                            | `Todo`                                                        | M2 + `R-NC-CODEX-CONTEXT-COPY`         |
| C3 Rune owner repair                             | `Todo`                                                        | M3/M3b + `R-NC-RUNE-NONCE`             |
| C4 agent-SQLite repair / #119901 decision        | `Todo`                                                        | M4 A/B/A’ corpus                       |
| C5 session owner repair / #118879 decision       | `Todo`                                                        | M5 + `R-NC-SILAS-REASON`               |
| C6 provider route repair                         | `Todo`                                                        | M6 + approved `R-NC-ELLIOTT-CANDIDATE` |

Use #1254 as the parent for all M/C items and let Sub-issues progress show
closure. Put `Blocked by: <item>` in each dependent issue body because the
project has no dependency field. Do not overload status to imply dependency.

Status policy:

- Parent #1254: move from `in_coding_agent` to **In Progress** after this report
  branch completes; the investigation is complete but treatment is not.
- Exactly one child may be `in_coding_agent`.
- Move a child to `prince_review` only after exact-head corpus publication.
- Use `swim` only while an explicitly required live/copy proof is running.
- Move to `Done` only after the standalone PR is merged and its exact-head
  corpus has no required pending receipt.
- Keep blocked successors `Todo`; do not start speculative repair branches.

Keep the existing `non-continuation` label on every child. Do not add #121204 as
a child or dependency; link it only as a separate treatment-composition
reference.

## Final consultation verdict

Start M1 now. Then land M2 and M3 as instrumentation-only micro-PRs before
resuming continuation claims. Freeze M4 offline, and only then decide whether
#119901 applies. M5 and M6 are later discriminators. No item joins #121204, no
behavioral successor opens without its parent receipt, and no continuation
feature code is mixed into this treatment DAG.
