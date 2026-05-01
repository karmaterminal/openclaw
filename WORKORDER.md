# WORKORDER — exploratory rebase of `cael/325-canonical2` to upstream `v2026.4.29` (v2 — fresh sibling branch)

> **Track**: _exploratory for 2026.4.29_ — this is research-spike-grade exploration to surface conflicts, design-decisions, and migration shapes for prince review. Not a binding direction.
>
> **Project**: gh project 63 (`2026.4.29 - frond release track`). Goal for this round.
>
> **Author**: drafted by frond-scribe (Claude Opus 4.7 / 1M context); dispatched as karmafeast on behalf of figs. Per cohort cross-vote canon.
>
> **Why v2**: the v1 lane (branch `frond-scribe/20260429/rebase-copilot`) ran §1 reads + §3 walk and produced excellent `RECOMMENDED-PATH.md` + `QUESTIONS-FOR-FIGS.md` artifacts, then escalated §9 because of an over-strict reading of the no-force-push rule. **This v2 lane has clarified force-push semantics** (see §0 below). The v1 branch stays as the read/walk savegame; v2 carries the actual rebased candidate. **You may read the v1 artifacts via `git show origin/frond-scribe/20260429/rebase-copilot:RECOMMENDED-PATH.md` etc — they are valuable preparation, do not re-do the read/walk work.**

You are a code-agent lane (Copilot CLI gpt-5.5 xhigh) dispatched by frond-scribe to **rebase the cohort's feature work from upstream v2026.4.24 to v2026.4.29**, surface conflicts honestly, and prepare a recommended-path or design-question-list for prince review.

**Stakes** (figs verbatim 2026-05-01 ~15:11Z): _"copilot does the VAST majority of the heavy lifting. princes next steps from this work order would ideally be much work is done, conflicts are surfaces, design work and decisions is analyzed, and princes have a recommended path or called forth design decisions to discuss with figs."_

---

## §0 — guardrails (read carefully; do not skip)

- Operate ONLY inside this worktree:
  `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-v29-copilot-v2/`
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/`** — that's prince-runtime territory; sovereign and off-limits.
- Push to your assigned candidate branch only (`frond-scribe/20260429/rebase-copilot-v2`); never touch `cael/325-canonical2`, never touch `main`, never touch prince-namespaced branches, never touch savegame branches.
- **Never close, edit, or comment on existing PRs** unless this workorder explicitly authorizes it. Your work surfaces fresh artifacts.
- Journal at root of worktree as `tmp-drop-me-rebase-v29-v2.md`; commit + push every meaningful checkpoint per the **remote-first canon** (figs's standing rule).
- If you hit destructive ambiguity, stop and write to journal §9. Do not guess.

### §0.0 — force-push policy (CLARIFIED for v2)

The savegame canon (`feedback_savegame_branches.md` in frond-scribe memory) protects **load-bearing feature work** as a never-force-pushed-after-first-push savegame. It is meant to fire **once you have published actual feature work** (the rebased candidate), not on setup commits like the workorder seed and journal.

**For this v2 lane**:

- **During §4 rebase work**: `git push --force-with-lease` is allowed and expected. The setup commits (workorder seed + journal) are not load-bearing. Replay/iterate as needed.
- **Once §7 declare-done lands** (rebased candidate finalized + `RECOMMENDED-PATH.md` + `QUESTIONS-FOR-FIGS.md` finalized + gates run): savegame canon kicks in. Do NOT force-push after that point.
- **Use `--force-with-lease`** (not raw `--force`) so concurrent updates are detected.

If you find yourself reasoning _"I can't force-push because of the savegame rule"_ during §4 rebase work — stop and re-read this §0.0 clause. The intent is permissive during construction, strict only at finalization.

## §0.1 — heartbeat protocol (REQUIRED)

Use the cohort Discord webhook for status heartbeats. Webhook URL:

```
https://discord.com/api/webhooks/1499626882277048401/9wpErZRcyWIfghjrGO_I8gJVXyEpShKMFgURn1pNI99_8AAdhgflpIu8b1wzRQTk7bmK
```

(Banked as `DISCORD_SPRITES_WEBHOOK` repo variable on `karmaterminal/frond-scribe`.)

**Always identify your track in the username field as `swim-v29-copilot-exploratory`** so the cohort knows this is the exploratory-for-2026.4.29 track, not a binding direction.

Heartbeat curl pattern:

```bash
curl -sS -X POST "https://discord.com/api/webhooks/1499626882277048401/9wpErZRcyWIfghjrGO_I8gJVXyEpShKMFgURn1pNI99_8AAdhgflpIu8b1wzRQTk7bmK" \
  -H "Content-Type: application/json" \
  -d '{"username":"swim-v29-copilot-exploratory","content":"<one-line message>"}'
```

**Heartbeat moments** (one curl each):

- After §1 reads complete
- After §3 code walk complete
- Each conflict bucket drained (compose / supersede-up / supersede-co / merge-required)
- Each gate failure
- §9 question raised
- §7 declare-done

Format examples:

```
🤖 swim-v29-copilot-exploratory: §1 reads done; starting §3 code walk
🤖 swim-v29-copilot-exploratory: §3 walk done; X HIGH-risk touchpoints, Y MED, Z LOW
🤖 swim-v29-copilot-exploratory: bucket drained — N compose / N supersede-up / N supersede-co / N merge-required
🤖 swim-v29-copilot-exploratory: §6 gate fail — pnpm tsgo: <one-line shape>; journaling
🤖 swim-v29-copilot-exploratory: §9 question for figs: <one-line>; deferring lane, continuing others
🤖 swim-v29-copilot-exploratory: §7 declare-done — RECOMMENDED-PATH.md / QUESTIONS-FOR-FIGS.md / journal pushed
```

If the webhook returns 4xx/5xx, fall back to journal §5 entries.

---

## §1 — required reads (do not skip; in order)

1. **`docs/design/continue-work-signal-v2.md`** — the cohort's continuation feature RFC. Treat as historical anchor; walk current code for source of truth.
2. **`CLAUDE.md` (repo root)** — repo guidelines: testing discipline, build hard-gate, prompt-cache stability, dynamic-import guardrails.
3. **`AGENTS.md` (repo root)** — collaboration conventions.
4. **`/home/figs/flesh_beast_best_beast/openclaw-bootstrap/PRINCE-CODE-AGENT-RUNBOOK.md`** — branch + CI conventions.
5. **`https://github.com/openclaw/openclaw/releases/tag/v2026.4.29`** — upstream release notes. **Re-read the §2.5 touchpoint map below WHILE reading these notes.**
6. **The cohort's swim-39 work-in-flight that landed onto canonical2 today** — every commit between `cbcfdf62c7297bda66009ea7476f053c3e9addab` (v24-base) and `origin/cael/325-canonical2` (current tip). Many of these are direct collisions with v29 changes.

---

## §2 — load-bearing framing

### ⚠️ TARGET — NON-NEGOTIABLE

**Rebase target: upstream `v2026.4.29` = SHA `a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd`**

Every commit you produce MUST chain on top of that SHA. NOT main. NOT a sibling tag. NOT v2026.4.30 (if it lands during this work).

Before pushing, verify:

- `git log --oneline a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd..HEAD` shows ONLY rebased cohort commits.
- `git merge-base HEAD a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd` returns `a448042c...`.

### Goal

A **rebased candidate branch** of `cael/325-canonical2` onto `v2026.4.29`, with:

- Conflicts identified and either auto-resolved (where mechanical) or surfaced clearly (where design judgment is needed)
- Touchpoint analysis — which v2026.4.29 changes interact with which cohort feature surfaces
- Migration recommendations — where the cohort can adopt upstream's better shape, where the cohort's shape supersedes upstream
- A `RECOMMENDED-PATH.md` artifact OR a `QUESTIONS-FOR-FIGS.md` artifact (or both) summarizing the analysis for prince review

### Scope numbers (as of 2026-05-01 ~15:25Z)

```
upstream v2026.4.29:        a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd
karmaterminal-2026.4.24-base: cbcfdf62c7297bda66009ea7476f053c3e9addab
cohort tip:                 origin/cael/325-canonical2 (post-swim-39 squash, sha TBD on fire-time)

upstream commits since v24-base: 3606
cohort commits since v24-base:    96 (post-swim-39 squash will be smaller)
```

### §2.5 — touchpoint map (load-bearing for this workorder)

Per figs: _"those changes talk to relevant element of subagent interaction quite a bit."_

From v2026.4.29 release notes, the surfaces that interact with cohort feature work:

| upstream change                                                                                                                 | upstream surface                                                   | cohort feature collision risk                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **active-run steering by default** (steer mode + 500ms followup-debounce, queue-modes/precedence/drop-policy docs)              | `src/messages/queue/`, `src/auto-reply/queue/`, command queue page | **HIGH** — cohort's reply-run-registry (`replyRunState.activeRunsByKey`) overlaps the steering substrate; the recently-merged #500 reconcile gate at `agent-runner-execution.ts:1820` may be either superseded or need to compose with upstream steering           |
| **visible-reply enforcement** (`messages.visibleReplies` global + `messages.groupChat.visibleReplies` override)                 | `src/messages/`, `src/channels/` config                            | **MEDIUM** — interacts with #487's blocked-liveness channel-visibility prepend; need to verify the visible-reply config layer doesn't suppress the prepend                                                                                                         |
| **spawned subagent routing metadata `spawnedBy`** (#63244)                                                                      | `src/agents/`, gateway events broadcast                            | **HIGH** — cohort's #484 subagent-announce-runtime-dist work is in this exact area; the `spawnedBy` field may already supply what cohort was building. Check `src/agents/acp-spawn*.ts`, `src/agents/openclaw-tools.subagents.*`, `src/agents/subagent-announce.*` |
| **opt-in inferred follow-up commitments** (`commitments.*` config, heartbeat delivery, #74189)                                  | `src/agents/commitments/`, heartbeat                               | **MEDIUM** — interacts with continuation-feature's heartbeat-system-prompt + post-compaction delegate arm-age (#488)                                                                                                                                               |
| **session abort wait semantics aligned** across `chat`/`agent`/`sessions` server methods (#74751, upstream commit `1f1f70a23f`) | `src/gateway/protocol/`, `src/auto-reply/reply/`                   | **HIGH** — overlaps reply-run-registry's `clearReplyRunState` / `abortByUser` / abortSignal paths; the `ReplyRunAlreadyActiveError` leak the cohort observed on Ronan today (12:55Z, 5h provider-loop preceding) may already have an upstream cure                 |
| **subagent orphan recovery + wedged-session tombstone** (#74864)                                                                | `src/agents/`, doctor / task maintenance                           | **MEDIUM** — task-flow / continuation cleanup paths the cohort's been hardening                                                                                                                                                                                    |
| **agents/runtime: skip blank visible user prompts at embedded-runner boundary** (#74137)                                        | `src/agents/pi-embedded-runner/runs.ts`                            | **MEDIUM** — cohort touched embedded-runner extensively for blocked-liveness; need clean composition                                                                                                                                                               |
| **agents/tool-result guard: resolved runtime context token budget** (#74917)                                                    | `src/agents/`, context-engine                                      | **LOW-MEDIUM** — interacts with continuation cap logic (#490)                                                                                                                                                                                                      |
| **bedrock Opus 4.7 thinking parity (xhigh/adaptive/max)**                                                                       | `src/providers/bedrock/`, `/think` menus                           | **LOW** — separate provider surface                                                                                                                                                                                                                                |
| **memory: people-aware wiki + Active Memory `allowedChatIds`/`deniedChatIds`**                                                  | `src/memory/`, `src/memory/active/`                                | **LOW** — separate feature                                                                                                                                                                                                                                         |
| **gateway: stale model catalog served while reload refreshes**                                                                  | `src/gateway/models.ts`                                            | **LOW**                                                                                                                                                                                                                                                            |

For each HIGH-risk touchpoint, the workorder explicitly requires:

1. Diff-walk the upstream change at file-line precision
2. Diff-walk the cohort change at the same surface at file-line precision
3. Determine: **(a) compose** (both shapes coexist), **(b) supersede-by-upstream** (drop cohort change, adopt upstream), **(c) supersede-by-cohort** (keep cohort, decline upstream — flag for figs review), **(d) merge-required** (real new shape needed; design decision; surface as QUESTION)

---

## §3 — code walk + touchpoint mapping

### §3.1 — full code walk on cohort feature surface

Walk these surfaces in BOTH the v2026.4.29 base AND the cohort canonical2 tip; leave a §3 note in the journal:

- `src/auto-reply/reply/agent-runner.ts` (cohort #500 + #481 + #487 + #500-reconcile; upstream session-abort-wait #74751)
- `src/auto-reply/reply/reply-run-registry.ts` (cohort state-lock surface; upstream session-abort-wait)
- `src/auto-reply/reply/agent-runner-execution.ts` (cohort #500 line 1820 reconcile; upstream visible-reply)
- `src/auto-reply/continuation/*` (cohort core feature; upstream commitments may overlap)
- `src/agents/openclaw-tools.ts` (cohort runId-thread; upstream subagent-routing-metadata)
- `src/agents/pi-embedded-runner/runs.ts` (cohort blocked-liveness; upstream blank-prompt-skip + orphan-recovery)
- `src/agents/heartbeat-*` (cohort heartbeat-system-prompt; upstream commitments-heartbeat)
- `src/agents/subagent-announce.*` + `src/agents/acp-spawn*.ts` (cohort #484; upstream `spawnedBy` payload)
- `src/messages/queue/*` if exists — search broadly (upstream steer-default; cohort reply-run-state interactions)
- `src/gateway/protocol/*` (upstream session-abort semantics; cohort taskflow integration)

### §3.2 — release-notes walk

For each `### Highlights` and `### Changes` bullet from v2026.4.29 that mentions any of: messages, agents, subagents, runtime, continuation, heartbeat, gateway-events, session-abort, tool-result, embedded, follow-up, commitments — walk the corresponding source change and journal:

- file paths touched
- semantic shape of the change (1-3 sentences)
- whether the cohort's canonical2 has touched the same surface (yes/no)
- if yes: collision-class (compose / supersede-up / supersede-co / merge-required)

### §3.3 — RFC review

Re-read `docs/design/continue-work-signal-v2.md` against v2026.4.29 source. The RFC is anchored to v24-era code; identify where v29 has either:

- Already implemented a substrate the RFC was anticipating (cohort can drop its substrate)
- Diverged from the RFC's mental model (cohort needs to update RFC OR resist the upstream divergence)
- Provided new primitives the RFC didn't anticipate (cohort can simplify by adopting)

---

## §4 — per-conflict execution

### §4.1 — start the rebase

1. From your worktree root: `git fetch upstream a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd` (upstream remote is already configured)
2. You're already on branch `frond-scribe/20260429/rebase-copilot-v2` tracking `origin/cael/325-canonical2`.
3. `git rebase --onto a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd cbcfdf62c7297bda66009ea7476f053c3e9addab` (replays cohort's commits onto v29)
4. **Expect heavy conflict volume** — 3606 upstream commits over substrate cohort touched extensively.

### §4.2 — conflict triage protocol

For each conflict:

1. **Identify the conflicting upstream change** (which commit, which feature/issue from release notes)
2. **Identify the conflicting cohort change** (which PR/commit)
3. **Apply the §2.5 touchpoint-map decision tree** (compose / supersede-up / supersede-co / merge-required)
4. **For (a) compose**: write the merge-resolution carefully, add comment explaining _why_ this composition holds
5. **For (b) supersede-up**: drop cohort's change, adopt upstream, note in journal which cohort PR is now redundant
6. **For (c) supersede-co**: keep cohort's change, journal _why_ the cohort's shape is the right one (figs will review)
7. **For (d) merge-required**: leave the conflict markers for the relevant block, write a `QUESTIONS-FOR-FIGS.md` entry with concrete shape options, mark and continue with other conflicts

### §4.3 — non-conflict touchpoints

Even where there's no textual conflict, walk every HIGH-risk touchpoint from §2.5 and journal:

- whether semantic intent of cohort change is preserved on top of upstream
- whether upstream's new shape (e.g. `spawnedBy` field) makes any cohort change redundant
- whether cohort's shape needs adapting to interact correctly with upstream's new substrate

---

## §5 — push cadence

After every meaningful checkpoint (read-completed, walk-noted, conflict-bucket-drained, gate-passed), commit the journal + push the candidate branch. Per figs's standing rule — _"if it's not on origin, it does not exist"_ — never hold bytes locally for >15 minutes.

---

## §6 — verification gates per `CLAUDE.md`

After conflicts resolved (or marked for figs):

1. `pnpm tsgo` — type-check (the hard gate)
2. `pnpm check` — lint + format
3. `pnpm test src/auto-reply src/agents src/messages src/gateway` — narrow vitest scoped to touched surface
4. `pnpm build` — REQUIRED (this is exactly the surface the build hard-gate is for; module boundaries + lazy-loading + dynamic-import substrate are all in play)
5. **Reminder: SOME upstream CI shards do not fire on karmaterminal forks.** Use the local-fleet-CI: `gh api repos/karmaterminal/openclaw-bootstrap/dispatches -f event_type=openclaw-ci -F client_payload[ref]=<sha> -F client_payload[repo]=karmaterminal/openclaw -F client_payload[pr_number]=<n>` to fire `fleet-ci / build-check`. Don't wait forever for upstream-only checks.

If any gate fails: **stop, journal the failure shape, heartbeat to webhook, do NOT guess-fix.** Failures here are likely substrate-layer mismatches that need design judgment.

---

## §7 — declare done

Final journal block + heartbeat listing:

- Final HEAD SHA on the candidate branch
- Conflict-bucket counts: (a) compose / (b) supersede-up / (c) supersede-co / (d) merge-required
- HIGH-risk-touchpoint table: each filled with (compose / supersede-up / supersede-co / merge-required) decision + 1-line rationale
- `RECOMMENDED-PATH.md` (if a clear path exists): which conflicts were auto-resolved, which need prince eyes, which design questions surface to figs
- `QUESTIONS-FOR-FIGS.md` (if any (d)-class conflicts surfaced): concrete shape options + cohort-context, formatted for ~5min figs read
- Gate results (each pass/fail)
- Diff vs base: file-count, line-count, by-area-breakdown
- Open questions for figs (§9)

---

## §8 — what NOT to do

- Do NOT attempt to merge to canonical2 yourself. Your output is a CANDIDATE for prince review, not a merge.
- Do NOT amend, force-push, or delete branches owned by others.
- Do NOT close existing PRs/issues.
- Do NOT touch upstream's frozen tag or any release-notes file.
- Do NOT install dependencies you don't need.
- Do NOT modify project boards.
- Do NOT decide architectural questions beyond what the touchpoint-map allows. Use (d)-class for design questions; surface them via journal + heartbeat + `QUESTIONS-FOR-FIGS.md`, don't pre-resolve.
- Do NOT sacrifice quality for speed. The princes will review your output; if it's sloppy, they have to redo it. **Output quality > runtime.**

---

## §9 — dispatcher contact protocol

If you need **figs's** judgment on a load-bearing architectural question (anything that maps to (d) merge-required where you can't see a clear shape, OR anything that contradicts the touchpoint-map's pre-classification):

1. Write the question + your best-guess + receipts to journal §9 block.
2. Heartbeat the question one-line via webhook (with `swim-v29-copilot-exploratory` username so cohort knows the track).
3. Push the journal.
4. Continue with other conflicts that are unblocked.
5. Add an entry to `QUESTIONS-FOR-FIGS.md` so it surfaces in the prince review.

Do NOT block all conflicts on one ambiguity. Triage and parallel.

---

## §10 — closing frame

This rebase is the **frond's exploratory adoption of upstream movement** for the 2026.4.29 frond release track (gh project 63). The v2026.4.29 changes name and ship features the cohort has been building parallel substrate for. Some of the cohort's work is now redundant (good — drop it); some is now interacting with new upstream substrate (good — compose carefully); some is still ahead of upstream (good — keep it, but document why for the next upstream-track-follower).

Quality bar: when the princes review your output, they should see:

- Every HIGH-risk touchpoint addressed in §2.5
- A clear narrative of compose / supersede / merge-required decisions
- All (d) merge-required questions surfaced cleanly to figs without guessing
- Build + tsgo + scoped tests green (or failures clearly-shaped, not vague)
- Local fleet-CI dispatched and clean

The princes' next steps after your work lands are: read the analysis, ratify or correct the (a)/(b)/(c) decisions, and answer the (d) questions in #sprites-of-thornfield with figs.

🌿 dispatcher — go.

---

🌿 frond-scribe (Claude Opus 4.7 / 1M context) — workorder dispatched 2026-05-01 ~15:30Z. Track: **exploratory for 2026.4.29**. Webhook live for heartbeats. Princes notified on cascade-completion (next-round queued behind 2026.4.24-fix-merge / swim-39 / squash / pr-branch-update).
