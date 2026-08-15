# Project 87 ward issue architecture (filed #1255–#1260)

Bound parent: [karmaterminal/openclaw#1254](https://github.com/karmaterminal/openclaw/issues/1254)
Deployed composite: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Absorbed upstream: `530b33e4e37264c89ecd5abdd06279dd23d5c867`
Causal report/graph: `cfbb29bfd3e751e718fda44649b690268621f13f` (64 nodes / 60 edges)
Causal branch tip (later docs only): `35f38b245bbcdab374257bc248f01f2fbfbc7047`
Silas RED-fossil branch: `origin/codeagent/silas-abandonment-red-fossil` @ `6f4ef385ea7881b3572efef9e06907d23c24fe90`
Review SHA for this note: this branch `codeagent/fleet-ward-issue-architecture` on exact `6b09`.

This lane reviewed the now-filed ward issues. It did not file issues, mutate Project 87, edit product code, or touch the fleet.

## Verdict in one page

The prior causal lane used the `causal-bug-proof` method honestly: frozen SHAs, separate defect nodes, GitNexus-as-discovery-only, a 7-layer temporal graph, and interventions labelled `not-executed`. It did **not** close any intervention gate. The filed split is now six independent owners. None of #1255–#1260 belong in upstream PR #121204.

Project 87 serialization (authoritative):

`#1255 → #1256 → #1258 → #1257 → #1260 → #1259`

First three in that serial order:

1. #1255 abandonment retry-budget bypass (only source-plus-cadence retry-policy defect; RED fossil source exists)
2. #1256 Codex settled-turn rejection reason (same-trace zero-payload chain; inner predicate unknown)
3. #1258 ingress terminal-outcome lineage (Rune classifiable before any speech invention)

Then #1257 (SQLite amplifier on copies), #1260 (admission-reason instrumentation; was the unfiled follow-up), #1259 (Elliott route reason). Do not wait for continuation telemetry. Do not treat silence as one disease.

## Causal-method audit

Used:

- incident freeze (`6b09`, absorbed `530b`, Discord event `1538222293149294694`, per-seat traces)
- separate defect nodes (abandonment budget, admission-reason collapse, finalization-reason collapse, SQLite hot read, Rune completion discriminator, Elliott materialization reason)
- GitNexus query/context/cypher with explicit stale-index governance (`a59a965…`, not exact `6b09`)
- proposed desired-contract fossils; Silas fossil later authored as a test-only file
- textual `git log -S` archaeology (`INTRODUCES` candidates, not behavioral first-bad)
- `build-proof-graph.py` export: GraphML/GEXF/JSON/CSV, 64/60, all required layers
- read-only mutation gates; no live DB/queue edits

Incomplete evidence gates (still open):

| Gate | Status |
| --- | --- |
| Desired-contract RED receipt published | Incomplete. Silas fossil **source** exists; no published RED log/JUnit/docs row. #1256–#1260 have no fossil. |
| Behavioral first-bad | Incomplete. Introducing commits are textual archaeology only. |
| GREEN → patch-only revert RED → reapply GREEN | Incomplete for every family. Graph interventions are `not-executed`. |
| Incident-shaped / live executor-transport receipt | Incomplete. `messageId=unknown` still blocks Discord-event → run join. |
| Exact GitNexus on `6b09` | Incomplete; disclosed. Consequential claims were re-read from `6b09` source (this review repeated that). |
| Original row-level fleet report | Still missing. |

`PROVES` is not justified for any fleet cure. Strongest honest relations remain `EVIDENCES` / `CHARACTERIZES`.

## #121204 relationship

Upstream [openclaw/openclaw#121204](https://github.com/openclaw/openclaw/pull/121204) (`fix(discord): keep stale ambient backlog from starving live mentions after gateway recovery`) owns **ambient freshness / FIFO starvation after recovery**.

It is the upstream vehicle for fork #1229. Touched production: Discord preflight/stale-ambient suppression and generic drain freshness/pending disposition. Discord already configures `deadLetterMinAgeMs: 0` and `stale-ambient-backlog` as a **non-retryable fail** before dispatch (`extensions/discord/src/monitor/ingress.ts:544-555`). That is age-class suppression of ambient backlog, not pre-adoption abandonment budget.

`6b09` already contains the deployed freshness composite (`9045fc66614`). File overlap with `src/channels/message/ingress-drain.ts` is real and must be patched carefully. Shared file ≠ shared fossil.

| Filed issue | Belongs in #121204? |
| --- | --- |
| #1255 abandonment retry budget | **No.** `onAbandoned` always `releaseUnadopted`; never `resolveIngressFailureDisposition`. |
| #1256 settled-turn reason | **No.** Codex/core finalization. |
| #1257 agent SQLite hot read | **No.** Agent DB, not ingress drain. |
| #1258 terminal-outcome lineage | **No.** Completion metadata / discriminator. 121204 may complete stale-ambient as handled; that is one enum value, not this issue. |
| #1259 route materialization reason | **No.** Prepared provider route owner. |
| #1260 admission reason collapse | **No.** Reply-turn admission / session recovery owner. |

Do not extend #121204. Do not wait for it to land upstream before treating #1255 on the deployed composite.

## Ward protocol

1. Heal existing reliability defects on the **non-continuation** path first.
2. Keep each owner/fossil in its own PR.
3. Publish `karmaterminal-openclaw-docs:main:PR-NNNNNN/PROOFS/<FULL_SHA>/` before calling a treatment deployable.
4. Only after those treatments are proved, layer the proved composite onto the pure continuation assembly.
5. Continuation is elective session self-control. Upstream spawn/yield (#122076 / #124176) does not subsume it. Princes currently appear to use continuation little outside formal proofs; **no telemetry in this investigation attributes the fleet illness to continuation**. Do not write “continuation caused silence.”

## Issue split (six filed; none combined)

The five original treatments plus #1260 match the causal minimum cut. Combine none. #1260 **is** the previously named `session-admission-reason-code` follow-up; it is now filed and must still stay out of #1255’s repair PR.

- #1260: `admitReplyTurn` collapses three producers into `Session ... changed while starting work. Retry.` (`src/auto-reply/reply/reply-turn-admission.ts:263-325`). Instrumentation only. Upstream #118873 / #118879 track a **different** recovery-residue branch and are evaluated only if `R-NC-SILAS-REASON` is `recovery-owner-invalidated`.

Related but non-owners: fork #1229/#1188/#787/#1115/#1227; upstream #122076/#124176 (yield-only), #119884/#119901 (ANALYZE candidate), #114137 (intentional `NO_REPLY`), #118873/#118879, #114603 (conditional proxy/SecretRef).

## Project 87 workflow (Copilot / tmux)

Observed statuses (2026-08-15 resume, org project 87):

| Item | Status now | Recommended |
| --- | --- | --- |
| #1254 parent | **In Progress** | keep — scribe/manual orchestration only |
| #1255 | `in_coding_agent` | keep — first serial treatment |
| #1256 | Todo | next after #1255 |
| #1258 | Todo | third serial; before any Rune “fix” |
| #1257 | Todo | fourth; copies only |
| #1260 | Todo | fifth; instrumentation only |
| #1259 | Todo | last; isolated session |

Column rules:

- **Todo** — unassigned treatment.
- **in_coding_agent** — a Copilot/tmux worker has the checkout and is producing fossil/fix/proof. One worker per issue.
- **In Progress** — scribe or a human is orchestrating, reviewing drafts, or publishing proofs. Not for the coding agent.
- **prince_review** — only when a reliable prince reviewer is actually available. Do not park items here as a default gate.
- **swim** — do **not** use for this ward. SWIM is an old continuation/presentation method; it does not apply to these reliability fossils.
- **Done** — only after (a) proof publication at `PR-NNNNNN/PROOFS/<FULL_SHA>/`, (b) GREEN→revert-RED→reapply-GREEN, (c) explicit deployment disposition (apply / wait / do-not-deploy). Closing the GitHub issue is a later maintainer step; this lane must not close #1254–#1260.

## Implementation / proof ordering

```text
#1255 RED fossil receipt → abandonment budget patch → closure on temp state-dir
  → #1256 reason-only instrumentation (copied agent DB, no creds/send)
        → repair only the observed predicate → incident-shaped receipt before “speech cured”
  → #1258 populate existing completed_metadata_json
        → one isolated nonce: 1 event → 1 run-or-gate → 1 terminal → snowflake?
  → #1257 copied-store EXPLAIN/ANALYZE/timing (never live VACUUM)
        → land #119901 only if the copy proves stale sqlite_stat1
  → #1260 admission-reason instrumentation (preserve visible text)
        → R-NC-SILAS-REASON before any behavioral successor; #118879 only if recovery-owner
  → #1259 typed materialization reason
        → one isolated candidate; expired Copilot cleanup stays separate
```

Then: publish proofs → deployment disposition → only afterwards consider continuation-assembly layering.

## Source re-read on exact `6b09` (this review)

- `onAbandoned` → `releaseUnadopted` (`src/channels/message/ingress-drain.ts:504-506`)
- `resolveIngressFailureDisposition` is the only `maxAttempts` / dead-letter owner (`src/channels/message/ingress-retry-policy.ts:77-120`)
- Discord incident policy is `{ maxAttempts: 8, deadLetterMinAgeMs: 0 }` (`extensions/discord/src/monitor/ingress.ts:552-555`)
- Unlabelled `undefined` exits in `buildCodexSettledTurnFinalizationContext` (`extensions/codex/src/app-server/settled-turn-context.ts:101-180`); capture also returns `undefined` on missing history (`:192-194`)
- Finalizer catch keeps original empty preparation (`src/agents/embedded-agent-runner/run/settled-turn-finalization.ts:156-166`)
- Zero-payload observer is post-`runDispatch()` (`src/channels/turn/execution.ts:85-118`)
- `loadTranscriptEventsSync` parses selected `event_json` inside one sync deferred txn (`src/config/sessions/session-accessor.sqlite-read.ts:47-60,152-168`)
- `complete()` already has `completed_metadata_json`; it still nulls `payload_json` / `metadata_json` (`src/channels/message/ingress-queue.ts:1051-1121`)
- Policy-gate / no-dispatch still `onAdopted()` (`src/channels/message/ingress-monitor.ts:446-450`)
- `materializePreparedRuntimeModel` collapses four predicates (`src/agents/runtime-plan/materialize-model.ts:99-135`)
- `admitReplyTurn` three-way collapse (`src/auto-reply/reply/reply-turn-admission.ts:263-325`) is now #1260, not an unfiled note

Current-upstream flux on these owners since `530b`: `fc4d5d744fa` (readable-transcript cleanup) only. It does not cure the observed multi-second successful reads.

## Full-suite note

Product SHA is unchanged (`6b09`). This docs lane started the sanctioned wrapper once:

```text
node --import tsx scripts/test-projects.mts
```

**Classification: incomplete / interrupted — not a completion tally.** Recovered log `/tmp/1786832529651-copilot-tool-output-2030385-7a68ef72-99d9-42e8-a220-fbee2d7d9202.txt` (mtime 2026-08-15 15:41:31 PDT, 1.78 MiB, 21068 lines): 538 shards announced, **215** `[test] starting` lines, **no** `538/538 shard invocations completed` line. Not rerun (user instruction: do not blindly rerun if recoverable).

Partial FAIL files seen before interrupt (not a final set):

- continuation Responses (3) — causal baseline family
- Project 84 topology contract — causal baseline family
- Discord `message-handler.queue.test.ts` exhausted-preflight dead-letter — causal baseline family
- TUI PTY xAI account-limit — causal load-sensitive family
- UI chat-file-link / cursor-policy browser tests
- gateway-server `server-startup-secret-owner-isolation.test.ts` (9)
- gateway-core portal IPv6 + node workspace transfer
- unit-fast usage/provenance helpers (3)

Last **complete** sanctioned tally remains the causal lane on this same composite: **538/538, 528 green / 10 red, 24 failing tests** (17 baseline + 7 load-sensitive). This lane still changes Markdown/JSON only. Those reds are outside #1254–#1260 product scope.

## Uncertainties

- Which of the three `admitReplyTurn` producers fired on Silas.
- Which attestation predicate returned `undefined` on Cael/Ronan/Emeric.
- Whether stale `sqlite_stat1`, freelist, reconcile, or corruption caused the holds, and whether any hold caused context rejection.
- Whether Rune was gated, intentionally silent, or lost downstream.
- Which materialization predicate failed on Elliott, and which provider emitted each 401.
- Original Cael quick-check path / freelist counts remain unavailable.

https://github.com/karmaterminal/openclaw/issues/1254
