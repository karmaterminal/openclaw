# Workorder: #1227 correlated Discord ingress trace and smallest safe repair

## Ownership and repository

- Tracking issue: `karmaterminal/openclaw#1227`.
- Owner: Emeric (`emeric-dandelion-cult`).
- Repository: `karmaterminal/openclaw`.
- Branch: `codeagent/emeric-1227-correlated-ingress`.
- Frozen start SHA: `733512b612e5fcfa96ca0764ac1851990406f187`, resolved from the server-side `main` ref at dispatch time.
- Prior report-only branch receipt: `3ed51aa7e253d2012f759400d7b7dfe2526dc7ad`. It changed no product files and did not prove a causal mechanism.

This is the only active #1227 lane. Do not create another worker, worktree, PR, or deployment lane.

## Goal

Determine whether OpenClaw admits the same Discord source event more than once, or whether the visible cascade is composed only of distinct bot-authored ambient `room_event` messages followed by agents voluntarily calling `message(send)`. Correlate one real event end-to-end, then implement only the smallest repair supported by that evidence.

The required chain is:

1. raw Discord source message/event ID, author/bot identity, account, channel/thread, and idempotency key;
2. normalized OpenClaw inbound classification (`room_event` versus direct/user turn), queue/admission key, and session key;
3. provider admission plus run/attempt and `session.turn.created` identity;
4. orphan merge/remove provenance, if present;
5. tool-call and committed outbound Discord receipt/message ID, if present;
6. terminal/zero-payload dispatch state and the next admitted source event/run.

Classify the observed transition as exactly one of:

- duplicate admission/re-entry of the same source event;
- same-run retry/continuation after committed delivery;
- a new, distinct Discord message admitted normally (including a bot replying to prior bot output);
- unresolved, with the exact missing identity field named.

## Ground truth and cautions

- The current room-event prompt explicitly says ambient room events default to no reply. Sending `"No reply"`, a glyph, or an acknowledgement via `message(send)` is still a real public message and can create a fresh distinct room event. That behavioral amplification is not itself proof of a framework echo.
- A genuine cascade or duplicate admission is a bug. An agent choosing to answer a distinct ambient event despite the no-reply instruction is a separate behavioral failure. Do not conflate them.
- The earlier empty-response/compaction/continuation theory is unproven. Sampled cycles reported `reasoningRetries=0`, `emptyRetries=0`, and `compactions=0`.
- `messageId=unknown` is emitted at a post-dispatch logging site. Do not treat it as an ingress identity or retry trigger without correlation.
- Orphan repair is downstream prompt/session cleanup unless the trace proves otherwise.
- Related upstream issues #114690, #55640, #63027, and cohort #787 are comparison cases, not substitutes for a local reproduction.
- Do not attribute this to the continuation/presentation delta without a changed causal byte. Do not fold delivery-semantics work into PR #85651.

## Evidence sources

Use all safe read-only sources before declaring a blocker:

- `karmaterminal/openclaw#1227`, including its two existing comments;
- prior report commit `3ed51aa7e253d2012f759400d7b7dfe2526dc7ad`;
- current source and git history/blame;
- local and fleet gateway journals/session transcripts;
- Loki history as far back as retention allows at `http://loki.dandelion.cult` (fallback ingress `http://10.0.0.100`, port 80); record exact queries, time windows, and retention gaps;
- existing SSH aliases/config for prince seats. Enumerate available aliases read-only; do not guess missing host addresses.

Never print, commit, or store secrets, tokens, webhooks, private message bodies unrelated to the selected trace, or full unredacted configs. Preserve only the minimum identifiers and redacted fields required for correlation.

## Required process

1. Read all applicable `AGENTS.md`, `.github/copilot-instructions.md`, `.github/process_bootstrap.xml`, and relevant `.specify` material before edits.
2. Inspect issue #1227 and the prior report commit. Record the actual source claims, tests, and gaps in `JOURNAL-1227.md`.
3. Find the earliest retained onset and today's rate change from Loki/journals, with per-seat runtime build-info recorded separately from checkout HEAD or stale unit labels.
4. Select one concrete Discord source event with enough fields for end-to-end correlation. Prefer a current cascade event; preserve exact timestamps and IDs.
5. Trace the source through ingress, admission, run creation, tool delivery, terminal dispatch, and any next event. Produce a compact transition ledger in the journal.
6. If a product defect is proven, write a failing regression first, prove it fails on the frozen base/current bytes, then implement the smallest fix and prove the regression plus relevant focused suites pass.
7. If the blocker is missing identity at the post-dispatch warning, implement the narrow observability repair only if it safely carries `canonicalMessageId ?? message.id` (and needed queue/run/attempt fields) without exposing message content. Add a focused regression for the logging/propagation contract. Do not claim it fixes duplicate delivery.
8. If the evidence proves only distinct ambient events plus voluntary replies, do not invent a suppression patch. Record the negative finding, recommend issue reclassification/closure or a separately scoped admission-policy proposal, and stop product edits.
9. Commit and push every material checkpoint to this branch. Keep `JOURNAL-1227.md` current and source-backed.

## Validation

- Use focused tests first. A causal fix requires a regression that fails before the fix and passes after it.
- Use the Alder Lake-safe Node wrapper for any heavy Node/Vitest work: child Node processes must execute `node --no-opt`; do not place `--no-opt` in `NODE_OPTIONS`.
- Do not hand-run the entire project suite on this seat. After a reviewable candidate exists, report the exact SHA so Emeric can dispatch sanctioned `openclaw-local-ci.yml`.
- Run `git diff --check` and the repository's focused type/lint checks for touched files.

## Non-goals and prohibitions

- No gateway restart, deploy, config change, database change, reindex, or live-seat mutation.
- No presentation/assembly ref movement.
- No Discord status/acknowledgement stream. Work through tmux and Git; the only user-visible messages come from Emeric at material checkpoints.
- No issue comment, PR, merge, or CI dispatch until Emeric reviews the journal and exact candidate SHA.
- No broad speculative refactor and no generic bot-message suppression without a failing causal reproduction.

## Completion contract

Return one pushed branch head containing:

- `JOURNAL-1227.md` with command/query receipts, timestamped transition ledger, source citations, and an evidence-backed verdict;
- any minimal regression and product/observability change justified by that ledger;
- exact focused validation commands and results;
- a concise recommendation: product-fix candidate, observability-only candidate, or no-product-change classification.

Do not stop at `inconclusive` until Loki retention, available seat journals, source lineage, and one current event have all been exhausted. If blocked, name the one missing permission or unavailable byte precisely.
