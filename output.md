# Six-seat communication and SQLite causal investigation

- **Bound issue:** [karmaterminal/openclaw#1254](https://github.com/karmaterminal/openclaw/issues/1254)
- **Deployed composite:** `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
- **Absorbed upstream:** `530b33e4e37264c89ecd5abdd06279dd23d5c867`
- **Current upstream context:** `ab5b8b9a02c8b90c15b9c618b03cdf9a553d0cde`

The evidence supports several downstream forms of silence, not one shared root cause. The strongest concrete defect is Silas's unbounded pre-adoption retry loop. Cael, Ronan, and Emeric have a separate same-trace chain from Codex finalization failure to zero-payload dispatch, with multi-second agent-SQLite work inside the same traces. Rune lacks a retained terminal-outcome discriminator. Elliott is a distinct route/config/auth chain.

No fleet state was changed. The investigation used bounded payload-free journals and log fields, file sizes, source/history, GitHub metadata, GitNexus, and direct Codex `0.147.0` source.

By: frond scribe (@scribe-dandelion-cult, acct 2026-05-06) | OpenClaw: 3 PRs, 6 issues, 1 commit/12mo | GitHub: 2,275 commits, 1,716 PRs, 288 issues, 35 reviews/12mo

## Evidence boundary

The requested row-level fleet report and its appended upstream-history supplement no longer exist at the supplied session path; an exact-filename search found no relocated copy. Issue #1254 and its first comment preserve the per-seat summary, but not all original row IDs, timestamps, freelist values, or the database path for Cael's failed quick-check.

This report therefore distinguishes:

- **Observed:** captured payload-free log fields, issue receipts, Git history, and exact source.
- **Source-proven:** a reachable owner path or violated invariant in `6b09`.
- **Localized:** a small owner boundary with one sharply named missing discriminator.
- **Unproven:** an edge that still needs a fossil, a copied-state probe, or an incident-shaped run.

The passive observation ledger is `causal-proof/passive-observations.json`. The temporal multiplex graph is exported under `causal-proof/graph/`.

## Prioritized concrete problems

| Priority | Concrete problem                                                                                                                                                                                                                                                                             | Evidence verdict                                                                                                                                 | Proposed severable lane                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Pre-adoption abandonment bypasses the ingress retry limit.** Silas retried one Discord source message 42 times over 1h46m and settled at the configured three-minute backoff. `onAbandoned` always releases the claim; it never calls the failure disposition that enforces `maxAttempts`. | Source + same-source cadence establish the loop. The upstream/fork search found no issue or PR for this exact bypass.                            | Add a RED fossil for eight abandonments, route abandonment through bounded disposition, require visible/dead-letter outcome, and run patch/revert/reapply closure. Keep cancellation budget-free. |
| 2        | **Codex finalization context rejection is undifferentiated and yields zero visible payload.** Cael, Ronan, and Emeric each have a single trace containing finalizer failure followed by the zero-payload warning.                                                                            | The outer chain is observed and source-localized. The inner attestation predicate that returned `undefined` is unknown.                          | Return a closed context-capture result code, capture a RED incident-shaped fossil on a copied agent DB, then repair the observed rejection branch only.                                           |
| 3        | **Large agent SQLite stores block the event loop in transcript reads during the failing turn path.** Representative agent DBs are 3.80-6.62 GB; reads hold synchronous transactions for 2.3-5.4s.                                                                                            | Same-trace amplifier is proven; planner statistics, freelist, projection reconcile, and corruption are candidate causes, not established causes. | On immutable copies, compare query plans/timing before and after `ANALYZE`; keep integrity and compaction work offline. Rebase or supersede upstream PR #119901 only with copied-store proof.     |

Rune outcome lineage and Elliott route materialization remain separate follow-up candidates after these three.

## Family 1: completed/admitted turns with no visible payload

### Causal graph

```text
Codex turn has tool result but no visible assistant text
  -> finalizeCodexAttempt requests settled-turn context
  -> captureCodexSettledTurnFinalizationContext reads agent SQLite transcript
  -> buildCodexSettledTurnFinalizationContext returns undefined (reason erased)
  -> Codex finalizer throws "context is unavailable"
  -> core finalization catches and keeps the original empty preparation
  -> channel dispatch result has no visible-delivery signal
  -> maybeWarnZeroCountVisibleDispatch logs zero payload
```

### Incident-to-owner table

| Edge                                           | Receipt                                                                                                                                                                                                                                                                                               | Strength                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Finalization failure -> zero-payload dispatch  | Cael trace `818314b20865025cc092d3042672f63b`: failure at 09:27:21.779, warning at 09:27:27.938. Ronan trace `39bb0342c1c8abf08d305343b75028a6`: failure at 09:55:12.726, warning at 09:55:24.971. Emeric trace `9af101e0eeb3b3058bc3810e5b8851ad`: failure at 09:38:03.172, warning at 09:38:06.507. | **Strongest observed edge.** Same trace, same session, ordered. |
| Context capture -> unknown rejection           | `buildCodexSettledTurnFinalizationContext` has unlabelled `undefined` exits for missing boundary identity, invalid/duplicate required identities, mirror-boundary mismatch, history-boundary absence, and source-evidence mismatch.                                                                   | Source-localized, inner cause unknown.                          |
| Original Discord event -> failed finalizer run | Successful/finalized paths log `messageId=unknown`; issue summary says one ingress completion but the retained trace cannot join the run to Discord event `1538222293149294694`.                                                                                                                      | **Weakest edge.**                                               |

**Likely source owner:** Codex transcript mirror/finalization in `extensions/codex/src/app-server/settled-turn-context.ts:101-180` and `extensions/codex/src/app-server/run-attempt-finalize.ts:325-344`; terminal fallback in `src/agents/embedded-agent-runner/run/settled-turn-finalization.ts:97-166`; observer in `src/channels/turn/execution.ts:85-118`.

The observer is not the cause. It runs only after `runDispatch()` returns and reports that `queuedFinal`, delivery counts, and observed-delivery signals were all absent.

### History and existing work

| Ref                                                                                                                                          | Applicability                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `6eea20ce181` / [openclaw/openclaw#110565](https://github.com/openclaw/openclaw/pull/110565)                                                 | Textual introducing commit for the settled-turn context/finalizer path. It is deployed in `6b09`; no cross-revision fossil was run, so this is archaeology, not behavioral first-bad.                                                                         |
| [openclaw/openclaw#122076](https://github.com/openclaw/openclaw/issues/122076) / [#124176](https://github.com/openclaw/openclaw/pull/124176) | Fixes a `sessions_yield` false-positive by adding `!toolState.yieldDetected`. Count-only checks found zero yield markers in the representative Cael, Ronan, and Emeric traces, so applicability is not evidenced. The PR is open and not in current upstream. |
| [karmaterminal/openclaw#1227](https://github.com/karmaterminal/openclaw/issues/1227)                                                         | Shares unbound zero-payload and orphan/re-entry symptoms, but its own review concluded that source/run/tool correlation is missing. It does not prove this finalizer chain created the duplicate turns.                                                       |
| [openclaw/openclaw#114137](https://github.com/openclaw/openclaw/issues/114137)                                                               | Closed after retained cases proved intentional `NO_REPLY`; not applicable to traces that contain explicit finalizer errors.                                                                                                                                   |
| [openclaw/openclaw#122690](https://github.com/openclaw/openclaw/issues/122690)                                                               | Different proposed mechanism: terminal source-message tool capability failure. No matching capability error is present here.                                                                                                                                  |
| `2e806ef0e2c` / upstream #123993                                                                                                             | Current-upstream trailing-coda fix; does not touch context capture or zero-count dispatch.                                                                                                                                                                    |

### Dependency contract

The exact deployed package is `@openai/codex@0.147.0`, tag `rust-v0.147.0`, commit `be6e8eac029b183056b7e4402879f15d2c85f61b`.

- Codex waits for in-flight tool futures before the turn can complete: `../codex/codex-rs/core/src/session/turn.rs:2086-2110` and `../codex/codex-rs/core/src/session/turn.rs:2695-2708`.
- `turn/completed` carries only the last agent-message summary, not a complete historical transcript: `../codex/codex-rs/app-server/src/bespoke_event_handling.rs:1267-1301`.
- Item completion is a separate notification: `../codex/codex-rs/app-server/src/bespoke_event_handling.rs:1434-1442`.

OpenClaw therefore owns the mirror and attestation needed for isolated finalization. The unavailable context is not an upstream Codex-provided field that can be assumed present.

**Smallest decisive next probe:** change the context builder to return a closed reason such as `missing-history`, `missing-boundary-identity`, `required-identity-shape`, `mirror-boundary-order`, `history-boundary`, or `source-evidence-mismatch`; emit the reason with existing trace/run/turn identities. Replay a sanitized copy of one affected agent DB without a channel delivery adapter.

**Mutation gate:** never exercise this against a live fleet DB. Copy the agent DB and sidecars under a frozen Gateway boundary; use no provider credentials or channel send; do not weaken attestation to make the fossil pass.

**Repair/proof lane:** `codex-settled-context-reason-and-owner-fix`. First freeze one reason-specific RED fossil, then apply the owner fix, require GREEN, patch-only revert to RED, and reapply to GREEN. Keep #124176 separate unless the trace actually reports `yieldDetected`.

## Family 2: Rune ingress completion followed by silent visible loss

### Causal graph

```text
Discord event reaches durable ingress
  -> drain can call onAdopted after run adoption
     OR after a policy gate / deliberate no-dispatch
  -> ingress queue complete() writes status=completed
  -> payload_json and metadata_json are cleared
  -> no bounded terminal reason is retained
  -> Rune has completed ingress + no reply + no matching warning/error
  -> gate vs agent silence vs delivery loss cannot be distinguished
```

| Question              | Finding                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strongest proven edge | `completed` is a transport-replay terminal, not a visible-delivery receipt. `src/channels/message/ingress-monitor.ts:446-450` explicitly adopts policy-gated/no-dispatch work, and `src/channels/message/ingress-queue.ts:1051-1121` clears the original payload and metadata. |
| Weakest/unproven edge | Whether Rune was deliberately gated, produced intentional silence, lost an unobserved delivery, or skipped before agent execution. The bounded journal filter returned no matching diagnostic row.                                                                             |
| Likely owner          | Shared ingress completion metadata, with Discord preflight/admission supplying the transport-specific outcome.                                                                                                                                                                 |

### Existing work

- [openclaw/openclaw#114137](https://github.com/openclaw/openclaw/issues/114137) proves that zero payload can be intentional `NO_REPLY`, but Rune has no zero-payload warning to classify.
- [openclaw/openclaw#121058](https://github.com/openclaw/openclaw/issues/121058) was closed because directed automatic turns now have a fallback and message-tool-only silence can be intentional. Rune's delivery mode and gate are not retained.
- Fork issues [#1229](https://github.com/karmaterminal/openclaw/issues/1229), [#1188](https://github.com/karmaterminal/openclaw/issues/1188), and [#787](https://github.com/karmaterminal/openclaw/issues/787) own stale backlog, serial ingress stalls, and stale event injection respectively; none supplies Rune's missing terminal reason.

**Smallest decisive next probe:** retain a bounded, payload-free `completed_metadata_json` enum for `policy-gate`, `adopted-agent-run`, `direct-visible-delivery`, `intentional-silence`, and `terminal-error`, plus source event ID and run ID when known. One new nonce probe can then require exactly one admitted event and exactly one terminal outcome.

**Mutation gate:** use the existing nullable completed-metadata column; no SQLite schema-version change, message content, identity inference, or dual-write path. A live Discord nonce probe requires explicit operator approval and an isolated test channel.

**Repair/proof lane:** `channel-ingress-terminal-outcome-lineage`. This is observability/proof work first; do not invent a Rune delivery repair until the retained enum selects an owner.

## Family 3: Cael/Ronan SQLite corruption, freelist, and slow holds

### Causal graph

```text
3.80-6.62 GB agent SQLite database
  -> loadTranscriptEventsSync reads all transcript event_json in one sync deferred txn
  -> main thread held 2.3-5.4s
  -> same trace continues through finalization context failure / zero-payload warning

separate branch:
Cael quick-check corruption + unavailable freelist receipt
  -> physical/integrity cause unknown
  -> shared-WAL, planner-statistics, projection-reconcile, or other candidate
  -> no incident-causal edge yet
```

### Passive receipts

| Seat   |        Agent DB | Representative operation                              | Same-trace outcome                                                                                                                         |
| ------ | --------------: | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Cael   | 5,403,803,648 B | `session transcript fenced read`, 4,864ms and 5,398ms | A fenced read and context-unavailable warning share trace and span; the same top trace also contains failed finalization and zero payload. |
| Ronan  | 3,796,570,112 B | `session transcript fenced read`, 2,327ms / 2,543ms   | Trace `39bb...`: finalizer failed, 2,543ms read hold, zero payload.                                                                        |
| Emeric | 6,622,703,616 B | `agent.write`, 1,222ms                                | Trace `9af...`: hold, finalizer failed 76ms later, zero payload 3.3s later.                                                                |

`loadTranscriptEventsSync` opens the agent DB and parses all selected `event_json` rows inside one synchronous deferred transaction: `src/config/sessions/session-accessor.sqlite-read.ts:39-60`. Because Node's SQLite call and JSON parsing are synchronous, these holds block the Gateway event loop. They can amplify latency, liveness delay, and queue accumulation.

They are **not** ingress-queue transactions: the observed database path is the agent DB. Shared durable ingress writes use the separate state DB. A thrown SQLite write would also take the dispatch-error path rather than allow the post-dispatch zero-count observer to run.

### History and existing work

| Ref                                                                                                                                          | Applicability                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [openclaw/openclaw#119884](https://github.com/openclaw/openclaw/issues/119884) / [#119901](https://github.com/openclaw/openclaw/pull/119901) | Strong candidate. The issue reports 13-15s operations on a 2.58 GB migrated agent DB with stale planner statistics; these fleet DBs are larger. The PR adds offline `ANALYZE` after doctor compaction. It is open and not deployed/current upstream. Planner state was not read here, so it remains a candidate.           |
| [openclaw/openclaw#115908](https://github.com/openclaw/openclaw/issues/115908)                                                               | Candidate for synchronous projection/reconcile stalls. The representative operation here is a fenced transcript read; no reconcile marker was captured.                                                                                                                                                                    |
| [openclaw/openclaw#124045](https://github.com/openclaw/openclaw/issues/124045) / `ed447135bd4`                                               | The issue concerns a second writable opener on the shared state DB. Current upstream commit `ed447...` prevents auxiliary cache eviction from resetting the shared WAL. Observed slow holds are on agent DB, so it does not cure them. Cael's missing original quick-check path prevents a corruption-equivalence verdict. |
| `fc4d5d744fa` / upstream #123495                                                                                                             | Current-upstream-only cleanup protection for readable transcripts. The failing traces successfully spend seconds reading the agent DB and then reject attestation; missing-file cleanup is not evidenced.                                                                                                                  |
| `d343ea07ab4` / upstream #123680                                                                                                             | Current-upstream-only sidecar preservation. Relevant corruption hardening, but no captured sidecar-loss event links it to Cael.                                                                                                                                                                                            |

The original report's freelist counts are unavailable. File size is not a freelist proxy.

**Strongest proven edge:** the slow operation is agent/session SQLite inside the same failing turn traces, not shared queue SQLite.

**Weakest/unproven edge:** whether stale `sqlite_stat1`, freelist bloat, projection reconciliation, or physical corruption caused each slow read, and whether any of them caused context rejection.

**Likely source owner:** `src/config/sessions/session-accessor.sqlite-read.ts:39-60` for the hot read; offline agent-DB maintenance for planner/freelist state; database lifecycle owner for corruption.

**Smallest decisive next probe:** on an immutable cold copy with sidecars, record `sqlite_stat1` presence, `EXPLAIN QUERY PLAN` for the exact session/fence queries, timed fenced read, page/freelist counts, and integrity results. Apply `ANALYZE` only to a second copy and repeat. This directly tests #119884 without touching production.

**Mutation gate:** no `quick_check`, `integrity_check`, `ANALYZE`, `VACUUM`, checkpoint, or copy while the live Gateway owns the database. Stop it or use a verified immutable snapshot. Keep corruption recovery separate from performance work.

**Repair/proof lane:** `agent-sqlite-fenced-read-plan-proof`. If copied-state RED/GREEN supports #119901, land the offline maintenance fix and separately bound the hot read. If it does not, move to projection/fence query ownership rather than adding runtime retries.

## Family 4: Silas session-change / turn-abandoned loop

### Causal graph

```text
same Discord message 1538222293149294694
  -> admitReplyTurn rejects before adoption with lifecycle-invalidated
  -> agent runner returns undefined
  -> completeFollowupRunLifecycle sees lifecycle was never admitted
  -> onAbandoned()
  -> ingress drain release(lastError="turn-abandoned")
  -> attempts increment and retry delay grows to 180s
  -> onAbandoned never calls resolveIngressFailureDisposition
  -> maxAttempts=8 is never enforced
  -> same source retried 42 times, FIFO lane remains blocked
```

### Proven loop

- Silas processed the same source message 42 times from 09:26:17 through 11:12:17. Each attempt failed in 3-13ms with the same diagnostic session ID and `Session ... changed while starting work. Retry.`.
- The cadence reaches approximately 184 seconds, matching `DEFAULT_INGRESS_RETRY_MAX_MS = 180000` in `src/channels/message/ingress-retry-policy.ts:8-12`.
- `completeFollowupRunLifecycle` calls `onAbandoned` when adoption did not occur: `src/auto-reply/reply/queue/types.ts:314-350`.
- Ingress `onAbandoned` always releases: `src/channels/message/ingress-drain.ts:499-506`.
- `queue.release` increments attempts: `src/channels/message/ingress-queue.ts:1123-1163`.
- Retry-limit enforcement exists only in `resolveIngressFailureDisposition`: `src/channels/message/ingress-retry-policy.ts:77-120`. Abandonment bypasses it.

This is a source-proven retry-policy bypass, not merely an observability gap.

The error's **producer** is still ambiguous. `admitReplyTurn` emits the identical message for:

1. expected session ID mismatch;
2. `claimMainSessionRecoveryOwner()` returning invalidated;
3. interruption/abort before operation.

See `src/auto-reply/reply/reply-turn-admission.ts:263-325`.

### History and existing work

| Ref                                                                                                                                          | Applicability                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `16c14e5bbfc9` / [openclaw/openclaw#108924](https://github.com/openclaw/openclaw/pull/108924)                                                | Textual introducing commit for the unified turn-adoption lifecycle and unadopted `onAbandoned` path. The always-release behavior is born in this seam.                                                                                                                                         |
| `6df0fb818d67` / [openclaw/openclaw#98510](https://github.com/openclaw/openclaw/pull/98510)                                                  | Textual introduction of session lifecycle fencing and the shared error text.                                                                                                                                                                                                                   |
| [openclaw/openclaw#121269](https://github.com/openclaw/openclaw/issues/121269) / `69983f80113`                                               | Deployed fix hands pre-adoption failures back to durable ingress instead of stranding them until watchdog dead-letter. Silas proves that handoff now occurs; it does not bound repeated abandonment.                                                                                           |
| `06600e2ca09`                                                                                                                                | Deployed Discord retry/cancellation fix. It configures eight attempts and zero minimum age for ordinary failures but preserves unconditional abandonment release.                                                                                                                              |
| [openclaw/openclaw#118873](https://github.com/openclaw/openclaw/issues/118873) / [#118879](https://github.com/openclaw/openclaw/pull/118879) | Strong symptom overlap. A 2026-08-15 Discord report documents 27 transient rejections and explicitly identifies the same three-way reason collapse. PR #118879 fixes terminal-only main-session recovery residue only. Without Silas row state, its branch-specific applicability is unproven. |
| [karmaterminal/openclaw#1115](https://github.com/karmaterminal/openclaw/issues/1115)                                                         | Different older error: `reply session initialization conflicted`. Current retry code recognizes that exact shape; it does not classify `Session ... changed while starting work`.                                                                                                              |

Live upstream/fork searches for `turn-abandoned` retry limits, abandoned ingress `maxAttempts`, and `onAbandoned retry-limit-exceeded` returned no matching issue or PR.

**Strongest proven edge:** abandonment bypasses the only retry-limit disposition and produces the observed capped cadence indefinitely.

**Weakest/unproven edge:** which of the three session-lifecycle rejection branches fires on Silas.

**Likely source owner:** ingress drain for the unbounded loop; reply-turn admission/recovery for the recurring rejection.

**Smallest decisive next probe:** first add a closed reason code (`expected-session-mismatch`, `recovery-owner-invalidated`, `pre-operation-interrupted`) to the diagnostic and durable failure metadata. Separately, a focused fossil should abandon one claim eight times with `deadLetterMinAgeMs=0` and assert `retry-limit-exceeded` plus next-row lane progress.

**Mutation gate:** the fossil uses a temporary state directory only. Do not alter Silas's live queue/session rows. A live proof requires an isolated Gateway/state directory and no Discord send until the code fossil closes.

**Repair/proof lane:** two small lanes are severable:

1. `ingress-abandonment-retry-budget` — enforce bounded retry/dead-letter with visible operator outcome.
2. `session-admission-reason-code` — preserve the exact producer fact, then fix only the observed session owner.

## Family 5: Elliott route materialization and HTTP 401

### Causal graph

```text
requested openai/gpt-5.6-terra
  -> prepared subscription route materialization fails
  -> fallback openai/gpt-5.6-sol
  -> prepared subscription route materialization fails
  -> fallback github-copilot/gpt-5.5
  -> visible provider HTTP 401 notices
```

The passive window contains 72 OpenAI candidate-failure decision rows. A representative sequence at 10:18:52 selects Terra, fails it, selects Sol, fails it, then names GitHub Copilot as the next candidate. Issue #1254 retains two visible HTTP 401 receipts.

`materializePreparedRuntimeModel` can collapse several different failures into the same generic text:

- no resolved model;
- resolved provider mismatch;
- resolved model ID mismatch;
- exact route API/base URL/auth requirement mismatch.

See `src/agents/runtime-plan/materialize-model.ts:99-135`.

**Strongest proven edge:** the fallback decision explicitly orders Terra materialization failure -> Sol materialization failure -> GitHub Copilot candidate.

**Weakest/unproven edge:** which materialization predicate failed and which provider emitted each visible 401. The offline status probe and live embedded route do not exercise the same prepared route/fallback chain.

**Likely source owner:** prepared runtime model materialization and OpenAI provider-owned route/catalog policy for the first failures; Elliott's fallback/auth configuration for the GitHub Copilot 401.

### History and existing work

| Ref                                                                                          | Applicability                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1b1cebfe421` / [openclaw/openclaw#104685](https://github.com/openclaw/openclaw/pull/104685) | Textual introduction of exact prepared-route materialization and its generic failure. It is deployed in `6b09`. Exactness is a security/correctness invariant; do not weaken it to hide the error. |
| [openclaw/openclaw#114603](https://github.com/openclaw/openclaw/issues/114603)               | Exact error text for token/SecretRef plus configured `codexProxyBaseUrl`. Elliott config was not read, so this issue applies only if those preconditions are independently established.            |
| [openclaw/openclaw#114108](https://github.com/openclaw/openclaw/issues/114108)               | Related dashboard-vs-CLI auth mismatch, but its reported error is missing API key rather than route materialization plus Copilot 401.                                                              |
| Current upstream after `530b`                                                                | No commit changes `materializePreparedRuntimeModel`; the failure remains current.                                                                                                                  |

Codex `0.147.0` accepts explicit `model` and `modelProvider` on `thread/start`: `../codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs:57-66`. Elliott fails before that dependency boundary, while OpenClaw is materializing the exact provider route.

**Smallest decisive next probe:** return a typed materialization failure containing only redacted facts: `missing-model`, `provider-mismatch`, `model-id-mismatch`, or `route-mismatch`, plus normalized API/base-URL class and auth requirement. Record it in the existing fallback decision. Then one existing-auth route probe can select the owner without exposing secrets.

**Mutation gate:** no config write, fallback reorder, reauthentication, or credential output. An authenticated provider probe is an external side effect and requires explicit operator approval; run one candidate at a time in an isolated session with channel delivery disabled.

**Repair/proof lane:** `provider-route-materialization-reason`. If it reports the #114603 proxy mismatch, repair provider-owned route projection. If model metadata is absent, repair credential-scoped catalog warm-up. Keep expired Copilot fallback cleanup/config repair separate.

## Shared effects are not shared causes

| Shared observation                                  | What it establishes                                  | What it does not establish                                                                          |
| --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Silence                                             | No expected semantic reply was visible.              | One common defect.                                                                                  |
| `visible channel turn ... no queued reply payloads` | Dispatch returned without a visible-delivery signal. | That Discord transport dropped a payload or that the warning belongs to the original inbound event. |
| Slow SQLite hold                                    | A synchronous transaction body crossed 1s.           | Lock contention, corruption, or causation of empty output.                                          |
| Ingress `completed`                                 | Transport replay ownership ended.                    | Agent run, visible payload, or Discord delivery completed.                                          |
| HTTP 401 text                                       | A provider auth response reached user copy.          | The prepared OpenAI route itself returned 401.                                                      |

## Exact upstream/fork applicability summary

| Family                  | Deployed/canonical ref                                           | Current upstream/fork state                                                                                                    |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Finalization/no payload | `6eea20ce181`, upstream #110565                                  | PR #124176 is open and yield-specific; no yield marker in fleet traces.                                                        |
| Rune silent loss        | Core ingress completion in `6b09`                                | No issue identifies Rune's missing terminal reason.                                                                            |
| SQLite                  | Agent DB read path in `6b09`; issue #119884                      | PR #119901 open. Current `ed447...` fixes shared WAL, not observed agent DB holds.                                             |
| Silas                   | `16c14e5bbfc9`, `6df0fb818d67`; prior fix `69983f80113` deployed | #118873 tracks the collapsed rejection reason; #118879 is branch-specific and open. No issue covers abandonment budget bypass. |
| Elliott                 | `1b1cebfe421`, upstream #104685                                  | #114603 conditionally exact; no current upstream fix.                                                                          |

## GitNexus receipt

GitNexus was used for process/symbol discovery and exported call relations in `causal-proof/gitnexus-relations.json`. The tool reports repository `openclaw` at `a59a96549b7736613cb86dc846b28d0d82f03295`; the workorder describes the available slice as frozen near `530b`. Neither identity is exact `6b09`. The index also fails to resolve several current symbols and returns a stale `openStateDatabase` body where `6b09` uses the renamed state opener.

Accordingly:

- GitNexus relations are discovery evidence only.
- Every consequential source claim above was re-read from exact `6b09`.
- Current-upstream claims were checked against `ab5b8b9a02c8b90c15b9c618b03cdf9a553d0cde`.
- The exported graph marks stale-index and missing-report governance nodes explicitly.

## Artifacts

| Artifact                                   | Purpose                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `causal-proof/frozen-incident-ledger.json` | Frozen SHAs, issue receipts, original per-seat summary, and missing-report boundary. |
| `causal-proof/passive-observations.json`   | Payload-free journal/log/file-metadata receipts and honest claim limits.             |
| `causal-proof/gitnexus-relations.json`     | Raw normalized GitNexus call rows used by the exporter.                              |
| `causal-proof/proof-spec.json`             | Hand-authored temporal multiplex proof spec.                                         |
| `causal-proof/graph/proof.graphml`         | NetworkX `MultiDiGraph` GraphML export.                                              |
| `causal-proof/graph/proof.gexf`            | GEXF export.                                                                         |
| `causal-proof/graph/proof.json`            | NetworkX node-link JSON export.                                                      |
| `causal-proof/graph/nodes.csv`             | Node table.                                                                          |
| `causal-proof/graph/edges.csv`             | Edge table.                                                                          |
| `causal-proof/graph/manifest.json`         | Export count/layer manifest.                                                         |

Graph manifest: 64 nodes, 60 edges, all required layers (`code`, `commit`, `defect`, `test`, `incident`, `governance`, `intervention`).

No RED/GREEN/revert intervention receipt is claimed: this workorder is read-only. Proposed fossils and interventions are labelled `not-executed`.

## Validation

Full sanctioned suite:

```text
node --import tsx scripts/test-projects.mts
538/538 shard invocations completed in 2596.04s
528 green, 10 red
24 failing tests
```

Failure classification:

- **17 baseline failures:** focused reruns reproduce on composite first-parent
  `b5de30c6ffe068d26f6b18e416f8f4659088241f` or absorbed upstream
  `530b33e4e37264c89ecd5abdd06279dd23d5c867`. They cover three continuation
  Responses assertions, the Project 84 topology contract, one Discord
  retry-exhaustion assertion, three golden/git-backup assertions, four plugin
  assertions, and five tooling/package/release assertions.
- **7 load-sensitive failures:** one TUI PTY assertion, four post-compaction
  durable-handoff assertions, and two backup assertions passed when their
  failed configs were rerun serially with `maxWorkers=1`.
- Serial diagnostics also exposed unrelated baseline/environment noise not
  present in the original full run; it was not counted as a full-suite failure.
- The branch changes only Markdown, JSON, CSV, GraphML, and GEXF report
  artifacts. No product or test source changed. The final composite merge from
  `b5de` to `6b09` changes only `src/gateway/server-cron.test.ts`, outside every
  failing file.

The baseline command grouped exact failing files under the same sanctioned
Vitest configs:

```text
node scripts/run-vitest.mjs run --config <failed-config> --maxWorkers=1 <failed-files...>
```

This lane does not repair those reds: they predate the report branch and are
outside issue #1254's bounded causal investigation.

Artifact validation completed:

- JSON parse for incident, passive, GitNexus, spec, manifest, and node-link exports.
- Causal exporter generated GraphML, GEXF, JSON, nodes CSV, edges CSV, and manifest.
- Git diff whitespace check.

## Exact commands

```text
git show --no-patch --pretty=fuller 6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955
git merge-base 6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955 upstream/main
git fetch upstream main
gitcrawl doctor --json
gitcrawl threads karmaterminal/openclaw --numbers 1254 --include-closed --json
gh issue view 1254 --repo karmaterminal/openclaw --json number,title,state,url,author,body,comments,assignees,createdAt,updatedAt,labels
gh search issues|prs --repo <repo> --match title,body --limit 20 -- <bounded-query>
git log --all -S <exact-diagnostic> -- <owner-paths>
git blame -L <range> 6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955 -- <owner-path>
gitnexus query/context/cypher against repository openclaw
git clone https://github.com/openai/codex.git ../codex
git -C ../codex checkout --detach rust-v0.147.0
ssh <seat> journalctl --user -u openclaw-gateway --since ... --until ... | grep <diagnostic-only-patterns>
ssh <seat> grep <exact timestamp/trace> /tmp/openclaw/openclaw-2026-08-15.log
ssh <seat> stat -c '%n %s' <known SQLite database and sidecar paths>
python3 .../causal-bug-proof/scripts/build-proof-graph.py --spec causal-proof/proof-spec.json --gitnexus-result causal-proof/gitnexus-relations.json --out-dir causal-proof/graph
node --import tsx scripts/test-projects.mts
```
