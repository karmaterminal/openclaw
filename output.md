# Project 87 ward issue architecture (filed #1255–#1259)

Bound parent: [karmaterminal/openclaw#1254](https://github.com/karmaterminal/openclaw/issues/1254)
Deployed composite: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955`
Absorbed upstream: `530b33e4e37264c89ecd5abdd06279dd23d5c867`
Causal report/graph: `cfbb29bfd3e751e718fda44649b690268621f13f` (64 nodes / 60 edges)
Causal branch tip (later docs only): `35f38b245bbcdab374257bc248f01f2fbfbc7047`
Silas RED-fossil branch: `origin/codeagent/silas-abandonment-red-fossil` @ `6f4ef385ea7881b3572efef9e06907d23c24fe90`
Review SHA for this note: this branch `codeagent/fleet-ward-issue-architecture` on exact `6b09`.

This lane reviewed the now-filed ward issues. It did not file issues, mutate Project 87, edit product code, or touch the fleet.

## Verdict in one page

The prior causal lane used the `causal-bug-proof` method honestly: frozen SHAs, separate defect nodes, GitNexus-as-discovery-only, a 7-layer temporal graph, and interventions labelled `not-executed`. It did **not** close any intervention gate. The filed split is the right five-way cut. None of #1255–#1259 belong in upstream PR #121204.

First-three treatment order stays:

1. #1255 abandonment retry-budget bypass (only source-plus-cadence retry-policy defect; RED fossil source exists)
2. #1256 Codex settled-turn rejection reason (same-trace zero-payload chain; inner predicate unknown)
3. #1257 synchronous agent-SQLite transcript holds (same-trace amplifier; planner/corruption unproven)

Then #1258 (Rune lineage) and #1259 (Elliott route reason). Do not wait for continuation telemetry. Do not treat silence as one disease.

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
| Desired-contract RED receipt published | Incomplete. Silas fossil **source** exists; no published RED log/JUnit/docs row. #1256–#1259 have no fossil. |
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

Do not extend #121204. Do not wait for it to land upstream before treating #1255 on the deployed composite.

## Ward protocol

1. Heal existing reliability defects on the **non-continuation** path first.
2. Keep each owner/fossil in its own PR.
3. Publish `karmaterminal-openclaw-docs:main:PR-NNNNNN/PROOFS/<FULL_SHA>/` before calling a treatment deployable.
4. Only after those treatments are proved, layer the proved composite onto the pure continuation assembly.
5. Continuation is elective session self-control. Upstream spawn/yield (#122076 / #124176) does not subsume it. Princes currently appear to use continuation little outside formal proofs; **no telemetry in this investigation attributes the fleet illness to continuation**. Do not write “continuation caused silence.”

## Issue split (keep five; one named follow-up)

The five filed issues match the causal minimum cut. Combine none.

Named follow-up **not filed** and must stay out of #1255’s repair PR:

- `session-admission-reason-code`: `admitReplyTurn` collapses three producers into `Session ... changed while starting work. Retry.` (`src/auto-reply/reply/reply-turn-admission.ts:263-325`). Upstream #118873 / #118879 track a **different** recovery-residue branch. Silas’s exact producer is unknown. #1255 currently amalgamates this into its desired contract; see `issue-updates/1255.md`.

Related but non-owners: fork #1229/#1188/#787/#1115/#1227; upstream #122076/#124176 (yield-only), #119884/#119901 (ANALYZE candidate), #114137 (intentional `NO_REPLY`), #118873/#118879, #114603 (conditional proxy/SecretRef).

## Project 87 workflow (Copilot / tmux)

Observed statuses (2026-08-15, org project 87):

| Item | Status now | Recommended |
| --- | --- | --- |
| #1254 parent | `in_coding_agent` | **In Progress** — scribe/manual orchestration only |
| #1255 | `in_coding_agent` | keep — fossil/fix coding lane |
| #1256 | Todo | Todo until a coding agent is actually assigned |
| #1257 | Todo | Todo; may start in parallel on **immutable DB copies** after #1255 is claimed |
| #1258 | Todo | Todo; start after #1255 if a second seat is free, before any Rune “fix” |
| #1259 | Todo | Todo; isolated session only; last of the first wave |

Column rules:

- **Todo** — unassigned treatment.
- **in_coding_agent** — a Copilot/tmux worker has the checkout and is producing fossil/fix/proof. One worker per issue.
- **In Progress** — scribe or a human is orchestrating, reviewing drafts, or publishing proofs. Not for the coding agent.
- **prince_review** — only when a reliable prince reviewer is actually available. Do not park items here as a default gate.
- **swim** — do **not** use for this ward. SWIM is an old continuation/presentation method; it does not apply to these reliability fossils.
- **Done** — only after (a) proof publication at `PR-NNNNNN/PROOFS/<FULL_SHA>/`, (b) GREEN→revert-RED→reapply-GREEN, (c) explicit deployment disposition (apply / wait / do-not-deploy). Closing the GitHub issue is a later maintainer step; this lane must not close #1254–#1259.

## Implementation / proof ordering

```text
#1255 RED fossil receipt → abandonment budget patch → closure on temp state-dir
        │
        ├─► #1256 reason-only instrumentation fossil (copied agent DB, no creds/send)
        │         → repair only the observed predicate → closure
        │         → incident-shaped receipt before claiming Cael/Ronan/Emeric cured
        │
        ├─► #1257 copied-store EXPLAIN/ANALYZE/timing (never live VACUUM)
        │         → land #119901 only if the copy proves stale sqlite_stat1
        │         → otherwise bound the sync read owner; keep integrity separate
        │
        ├─► #1258 populate existing completed_metadata_json with a closed enum
        │         → one isolated nonce: 1 event → 1 run-or-gate → 1 terminal → snowflake?
        │
        └─► #1259 typed materialization reason in existing fallback decision
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

Current-upstream flux on these owners since `530b`: `fc4d5d744fa` (readable-transcript cleanup) only. It does not cure the observed multi-second successful reads.

## Full-suite note

Product SHA is unchanged (`6b09`). Causal lane already ran `node --import tsx scripts/test-projects.mts` on this composite: **538/538 shards, 528 green / 10 red, 24 failing tests**, classified as 17 baseline + 7 load-sensitive. This review adds Markdown/JSON only. See `output.md` validation section after the local full-suite rerun on this docs commit.

## Uncertainties

- Which of the three `admitReplyTurn` producers fired on Silas.
- Which attestation predicate returned `undefined` on Cael/Ronan/Emeric.
- Whether stale `sqlite_stat1`, freelist, reconcile, or corruption caused the holds, and whether any hold caused context rejection.
- Whether Rune was gated, intentionally silent, or lost downstream.
- Which materialization predicate failed on Elliott, and which provider emitted each 401.
- Original Cael quick-check path / freelist counts remain unavailable.

https://github.com/karmaterminal/openclaw/issues/1254
