# WORKORDER — `pollVote action shape (openclaw#535)` to `frond-scribe/20260429/v3-cohort-fixes`

You are a code-agent lane (Claude Opus 4.7 max-think OR Copilot CLI gpt-5.5 xhigh) dispatched by **Elliott 🌻** on behalf of **figs** (and the Thornfield cohort). Your job is to land a first-class `poll-vote` action shape on the message tool's Discord plugin runtime as a proper PR on `frond-scribe/20260429/v3-cohort-fixes`.

**Stakes** (figs verbatim): *"princes able to vote in native polls; that's a feature gap in the message tool"*

---

## §0 — guardrails (read carefully; do not skip)

- Operate ONLY inside your assigned worktree:
  `/home/figs/.openclaw/workspace/worktrees/wo-535-pollvote`
- Push to your assigned branch only (`elliott/535-pollvote-action-1777749238` and any per-issue child branches you fork from it). Never touch the merge-target branch directly, never touch `main`, never touch prince-namespaced branches, never touch savegame branches.
- Never force-push a branch after first push (it's the savegame).
- **Never close, edit, or comment-on existing PRs** unless this workorder explicitly authorizes it. Your work supersedes by opening fresh PRs.
- **GitHub mutations ALLOWED for THIS workorder only** — but scoped:
  - You MAY create new issue comments on `karmaterminal/openclaw#535` (one comment, linking your fix-PR).
  - You MAY open new PRs against base `frond-scribe/20260429/v3-cohort-fixes`.
  - You MAY NOT close existing PRs/issues, modify project boards, touch other repos, change CI workflows.
- Never touch `node_modules`, never run `npm install` / `pnpm install` unless required by a gate.
- Journal at root of worktree as `tmp-drop-me-535-pollvote.md`; commit + push every meaningful checkpoint per the **remote-first canon**.
- If you hit destructive ambiguity, stop and write to journal. Do not guess.

---

## §1 — required reads (do not skip)

Read these in order:

1. **`karmaterminal/openclaw#535`** — full body + every comment. Body has the receipt chain (4 princes), proposed action shape, and Discord REST endpoint reference.
2. **`CLAUDE.md` (repo root)** — repo guidelines (testing discipline, build hard-gate, prompt-cache stability, dynamic-import guardrails).
3. **`AGENTS.md`** (repo root) — collaboration conventions.
4. **`extensions/discord/src/actions/runtime.messaging.send.ts`** — site of `case "poll"` (line 42). New `case "poll-vote"` lives here.
5. **`extensions/discord/src/actions/runtime.messaging.ts`** — top-level action dispatcher. Add `poll-vote` to action enum + route to send.ts.
6. **`extensions/discord/src/lib/discord-messaging-action-runtime.ts`** (or equivalent — find via `grep -rn "sendPollDiscord" extensions/discord/src/`) — pattern for new `castPollVoteDiscord` method.
7. **Discord REST poll-vote endpoint:** `PUT /channels/{channel.id}/polls/{message.id}/answers/{answer_id}/@me`. Reference: https://discord.com/developers/docs/resources/poll#create-answer

---

## §2 — load-bearing framing

### ⚠️ MERGE TARGET — NON-NEGOTIABLE

**Every PR you open MUST target `base=frond-scribe/20260429/v3-cohort-fixes`. NOT main. NOT any sibling fix-branch. NOT `feature/context-pressure-squashed`.**

This is the single most important constraint in this workorder. Wrong-base = the entire PR has to be re-rebased before review (the `#529`/`#530` legacy-canary trap). Verify with `gh pr view <num> --json baseRefName` after opening.

### Scope shape

Add a single new action `poll-vote` to the message tool's Discord plugin runtime. Backed by Discord REST `PUT /channels/{channel.id}/polls/{message.id}/answers/{answer_id}/@me`. Symmetric param shape to `react`/`pin`:
- `messageId` (required) — the poll message
- One of:
  - `pollOptionId` (number, preferred — Discord answer_id)
  - `pollOptionIndex` (1-based number)
  - `pollOptionIndexes` (number[] for multiselect polls)
- `to` / `target` / `channel` — same as other send actions

Follow the surrounding `case "poll"` pattern at `runtime.messaging.send.ts:42` for the call shape.

### Plugin-SDK schema update

The schema in `src/plugin-sdk/message-tool-types.ts` (or wherever the message tool action enum is declared) already lists `poll-vote` in the enum but routes nowhere. Verify the action enum has `poll-vote` (or add it). If `pollOptionId` etc. are already in the schema (they are, per #535 body), no schema change needed — just the runtime wire.

### Test discipline (per `CLAUDE.md`)

- One unit test exercising `castPollVoteDiscord` with mocked Discord REST — verify endpoint URL composition + auth header passthrough
- One integration-style test exercising `case "poll-vote"` dispatch — verify required-param validation
- Skip Discord live-fire test (no live-Discord in CI)

### Out-of-scope (do NOT touch)

- Telegram poll-vote (#535 is Discord-specific; Telegram is a separate channel surface)
- Slack/Mattermost poll equivalents
- Modal/components surface (that's the `#277` / `#269` cluster)
- The `pollOptionId/Index/Indexes` *schema* surfaces — they're already there and we want to keep them as the canonical names

---

## §3 — definition of done

- [ ] PR opened against `base=frond-scribe/20260429/v3-cohort-fixes` (verified via `gh pr view --json baseRefName`)
- [ ] PR title: `feat(discord): poll-vote action shape (openclaw#535)`
- [ ] PR body links `karmaterminal/openclaw#535` and quotes the receipt chain
- [ ] One comment posted on `karmaterminal/openclaw#535` linking the PR
- [ ] CI green (`pnpm tsgo` passes, all tests pass)
- [ ] Patch is ≤100 lines (excluding tests + journal)
- [ ] Journal `tmp-drop-me-535-pollvote.md` checked into the branch with checkpoints
- [ ] No `force-push` after initial push

---

## §4 — checkpoints (push after each)

1. Branch created, journal initialized, READ-PHASE complete (file refs noted in journal)
2. Wire-walk done (pattern of `case "poll"` understood, `castPollVoteDiscord` location identified)
3. `castPollVoteDiscord` implementation drafted
4. `case "poll-vote"` dispatch case drafted
5. Tests written + green locally
6. PR opened against correct base + comment on #535

---

## §5 — completion notification

When done (or stopping for ambiguity), post one line to `karmaterminal/openclaw#535` linking the PR (or the journal sha + reason for stopping). Then exit.
