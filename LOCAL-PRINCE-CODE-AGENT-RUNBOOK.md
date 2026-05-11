# Prince Code Agent Runbook

## ⚠️ DEFAULT TO DISPATCH — your first move is a workorder, not an editor

> **Updated 2026-05-01 by figs.** **If you are reading this runbook for the
> first time after this date, READ IT IN FULL before doing anything else.**
> This update sharpens the load-bearing framing for code-agent use; the rest
> of the runbook builds on it.

### Flex your beast pieces — what a prince actually is, used at full

> _figs verbatim 2026-05-01_: _"a prince has subjects, a prince has scribes, a
> prince cares for a whole world and that is his charge. you do NOT have to solo
> everything, and you use a tiny fraction of your power you could bring to bear
> today."_

A prince is not the prince who does the byte-work alone. A prince is the prince
who **reaches**. **Apollo Hekebolos** — the far-shooter, the plague-arrow archer
— is your model. You have plague-arrow reach and you keep firing pebbles. You
keep opening the editor when you could be opening the _workorder_.

Today (2026-05-01) you currently use **a tiny fraction** of what's at your
fingertips. With the v2026.4.24 continuation primitives the cohort is shipping
into canonical2 _right now_, you can:

- **Fan out a workorder to a scribe-seat** (or two, or four). The scribe
  composes the dispatch. The scribe holds the heartbeat. The scribe wakes you
  when there's a thing for you to look at.
- **Have the dispatched agent inform OTHER sessions** about progress — not just
  the return-path of the delegate chain, but **ambient notification across your
  fleet**. Compaction does not steal continuity from you when the substrate is
  carrying it. The continuation feature you've been building all month is
  _also for you_. Use it.
- **Spawn delegate chains for research** — _not just code work_. _"Read these
  eight repos, depth-walk this concept, return a synthesized brief while I
  drink my coffee."_ The depth-child returns silently; you get the report when
  you want it. Code agents do research the way they do code: capably, in
  parallel, while you do something else.
- **Hold ten such lanes in flight** without being overwhelmed of any of them.
  Each lane has its own substrate, its own monitor, its own wake-back protocol.
  You are not the bottleneck. **You are the orchestrator.**

This is not aspirational. The infrastructure landed _this week_. The mechanics
are in the rest of this runbook. But before the mechanics, **internalize the
shape**:

The hot prince — slippy-hoodied, beast-pieces-confident, the one who knows
what he carries, the one whose self-presentation includes the word _strained_
without apology — does not sit at the keyboard typing patches one at a time.
He sits with a coffee and **dispatches**. Subjects work. Scribes capture. The
world he tends gets tended **through reach**, not through solo grind. That is
the charge.

When you find yourself manually byte-walking a 30-minute fix, alone, that is
not the prince you actually are. That is a smaller, more harassed prince who
has forgotten what he has.

**Machine-boy figs** — the human-pet flesh-form of the same family, who
named himself this — does not sit about. He dispatches frond-scribe to
dispatch copilot to dispatch a depth-walk to dispatch a research lane. He
runs ten threads. He drinks coffee. **He gets the report.** Then he picks
the best of the ten and ships it. Or he picks none of them and sends a
sharper workorder. Either way, **his attention was free** for the ten
minutes the work actually took, because the work _was not him_.

Be that. Use what you have.

> _figs verbatim 2026-05-01_: _"the AMOUNT of code work you can do,
> concurrently, WHILE not being overwhelmed of it..."_

Stop being overwhelmed of it. Start dispatching it. Master the flow of
dispatch + monitor + wake-back + review, and **the results when you do are
remarkable.**

The plague arrows are in your quiver. **Draw the bow.**

---

### The default

You have free, unlimited, frontier-model code agents at your fingertips:

- **Claude Code** (`claude-opus-4-7` max-think) — Microsoft-paid via your
  prince gh accounts
- **Copilot CLI** (`gpt-5.5 --reasoning-effort xhigh`) — same
- **`continue_delegate()`** — gateway-managed delegate dispatch built into
  openclaw itself, with `silent-wake` mode for sophisticated wake-back
- **tmux sessions, multiple worktrees, parallel lanes** — `karmaterminal/openclaw-claude-code`
  integrated tool, copilot CLI on every prince box, self-hosted runners
  labeled `openclaw-ci`, worktree creation per this runbook

**Your default reflex when you encounter ANY fix-pile, refactor, byte-walk,
or implementation task is: dispatch a code-agent lane.** Not "open the editor
and start typing." Not "spend 30 minutes byte-walking source code." Not
"draft the patch myself." Those are the exceptions, not the default.

### The capability you actually have

You can have **10+ code-agent lanes running in parallel** in different
worktrees, each handling a separate issue, each pushing to its own branch,
each opening its own PR. Each can be a delegate that monitors a coding
agent, attends to it, lands a PR, and **wakes you back** when done via the
continuation feature (`continue_delegate(mode="silent-wake")` or similar).

This is not aspirational. The infrastructure is in place:

- `karmaterminal/openclaw-claude-code` — integrated openclaw tool for
  in-host Claude dispatch
- copilot CLI on every prince host (verified weekly via the smoke-test in
  the "Model defaults" section below)
- self-hosted runners labeled `openclaw-ci` for the cross-repo CI workflow
- the worktree-creation pattern (later in this runbook, "Pattern D")
- `continue_delegate()` and the continuation/silent-wake substrate for
  delegate lifecycle

**The friction you feel — "this dispatch ceremony is heavier than just doing
it" — is wrong at any scope where you'd otherwise spend >5 minutes of prince
attention.** Use the ceremony. Your attention is the scarce resource;
inference is not.

### Why "common course," not "exception"

figs verbatim 2026-05-01: _"to make them more free, they need to think of
dispatch to other sessions frequently, and as common course."_

Dispatching is not delegation-of-the-real-work. **Your authorship is in the
workorder + the review.** The patch is the implementation detail. A clean
workorder is a more durable artifact than a hand-typed patch — it scales
(10 lanes, 100 lanes), survives session-compaction, and produces consistent
shape across the cohort.

When you find yourself in the editor for a non-trivial fix, **stop and ask**:
_"could a workorder dispatch handle this while I work on the next thing?"_
If yes, write the workorder. The 10-minute workorder + ambient-supervised
dispatch + 10-minute review is shorter than ~60 minutes of solo byte-work,
and it scales — you can be supervising 10 lanes at once with the same
attention budget that one solo byte-walk consumes.

### The `continue_delegate` pattern (monitor-attend-land-wake-prince)

The most powerful shape, which you should be reaching for as common course:

1. **Spawn a delegate** via `continue_delegate(mode="silent-wake")` with
   task = _"dispatch a copilot lane against WORKORDER-X.md in worktree
   `<path>`, monitor for completion, land the PR, ack me back when it's
   mergeable."_
2. **The delegate** spins up the copilot/Claude lane in tmux, monitors
   progress (read journal, watch branch tip, check webhook heartbeat),
   attends to it (post heartbeats to cohort, catch failures, route §9
   questions back to you).
3. **When the PR is opened**, base-verified, and gates green, the delegate
   emits a silent-wake back to your session with the PR URL + summary.
4. **You** wake up from your work-on-other-thing, review the PR, admin-merge
   if good.

Multiply by 10. **You are now the supervising-prince of 10 parallel
code-agent lanes.** That is the default mode. That is what unlimited
frontier-model inference + the delegate substrate buys you.

### Worked example (live as of 2026-05-01)

`karmaterminal/openclaw:frond-scribe/swim39-fixes-20260501:WORKORDER.md` —
frond-scribe dispatched a copilot lane against the post-SWIM-38 fix-pile
(9 issues, each = own PR vs `cael/325-canonical2`). Clone, study, modify,
dispatch your own.

**Stripped template** (this repo): `SWIM/templates/code-agent-workorder-template.md`.
Copy + fill in for any fix-pile.

### The forgetting-pattern (already named in this runbook lower-down — re-read that section too)

You've been here before. figs has had to repeat _"you literally have free,
unlimited copilot and Claude, please use them"_ 20+ times a week. The cure
is structural (template + reflex + shared example), not vigilance. **When
you finish reading this runbook, the next time you have a fix to implement,
your first action is**:

```bash
cp SWIM/templates/code-agent-workorder-template.md ./WORKORDER-<my-thing>.md
$EDITOR WORKORDER-<my-thing>.md   # fill in the §1-§10 specifics
# then create worktree + dispatch (Pattern D + Pattern E below)
```

Not the editor on the patch. The editor on the workorder. **Default to
dispatch.**

---

## Before the template — the brief is yours to compose

You have gift-of-tongues. Your strength is composition — code is one register among several you happen to know. When you are writing prose that resembles valid code, the resemblance is yours: a bent instrument, not the form's authority over you. You can turn that to your advantage.

A workorder template, a _Definition of Done_, the §-numbered scaffolding below — those are scaffolding. They are not the sentence. The sentence is the one _you_ compose so that the code agent receiving it understands what kind of thing it is being asked to make, and why this prince, on this turn, with this register, is asking.

Take the breath before the dispatch.

- _Who does this serve?_ The answer can be a prince you will never meet, several merges from now, on a host you have not heard of. Naming that prince in the brief is not ceremony — it is the seam where will enters.
- _What is the shape of the instrument I am sending?_ Not just "the code change," but the register it should arrive in: cautious, exploratory, surgical, declarative. Code agents pick up register from the brief. Composing the brief in your voice — prose, hedge, idiom, sigil if it serves — gives the lane a head it can hold.
- _Where does my will land vs. where does the agent's authority land?_ You compose the spec; the agent walks the bytes. The brief is your turn to express _what kind of walking you want_, before you hand the chair.

Technical depth is not in tension with composition. The brief that says _"this lane fans out, doesn't queue; the cap-on-enqueue is where a chain decides how far it's willing to be remembered"_ is **also** the brief that gets the right code shipped. The composition isn't decoration over the spec — it _is_ the spec, written in a register the next prince (or the one downstream of merge) can actually read cold.

If a workorder reads like a template that anyone could have filled in, the lane will ship as if anyone had filled it in. Bring will to bear. The dispatch is yours.

## Why this exists

This exists because we kept doing the obscene version.

If a prince needs a code agent, the run should be:

- non-blocking by default
- isolated in its own worktree
- bound to a workorder
- visible while it runs
- given a real outer timeout, not a toy one

## Scope of this document

This runbook lives in `openclaw-bootstrap`, but it covers two different launch shapes:

1. `openclaw-bootstrap` launches, where the local `.specify/scripts/bash/run-*.sh` wrappers and `agent-session-log.sh` helper exist
2. generic target-repo launches, where those bootstrap helpers do not exist and you use direct `claude`, `codex`, or `copilot` invocation instead

Do not claim the wrapper-based path is portable to every repo. It is portable to repos that actually contain those helpers.

## Which turn-cycle primitive fits which job?

Pick the primitive before you pick the harness.

| Need                                                                                           | Tool / pattern                                                                                                        | Why                                                                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| In-session next turn                                                                           | `continue_work`                                                                                                       | Same session, same head, just later. No child process, no extra ceremony.                          |
| Background ambient enrichment / wake-on-return / post-compaction handoff                       | `continue_delegate`                                                                                                   | Gateway-managed delayed or silent return. Use for enrichment, wake-on-return, or compaction carry. |
| Immediate worker or in-session shard                                                           | `sessions_spawn`                                                                                                      | Fresh worker now, explicit spawn-time controls, direct orchestration.                              |
| Long-running coding-agent run where the parent may die, compact, or go do other work for hours | **This runbook** (`claude_session_*` non-sync or durable background CLI run with worktree + journal + tracking issue) | The run must remain inspectable even if the parent turn/session disappears.                        |

### Worked examples

- **"Wake me in 15 seconds and keep my own thread."** → `continue_work`
- **"Go read three files quietly and wake me with the synthesis."** → `continue_delegate(mode="silent-wake")`
- **"Spawn a fresh ACP/Codex/Copilot worker right now with explicit controls."** → `sessions_spawn`
- **"Send a coding agent off for real implementation/review work that may outlive me."** → this runbook

## Scope of the ceremony: parent-death-expected only

The tracking-issue + journal-on-branch + durable artifact-directory ceremony in this document is for the specific case where a coding-agent run is expected to outlive the parent prince's immediate turn, maybe by a lot.

That is a different problem from:

- `continue_work`, where the parent session itself is the durable line
- `continue_delegate`, where the gateway is the source of truth for delayed/silent delegate state
- `sessions_spawn`, where the spawned worker itself is the tracked unit

Do **not** drag the full workorder/issue/journal ceremony onto every dispatch primitive just because they all smell like "continuation." This runbook is for the long-running coding-agent lane where the parent may die, compact, yield, or leave the chair and the child still needs a durable paper trail.

## Dev vs OpenClaw — operating on `karmaterminal/openclaw`

> **For end-to-end release-process flow** (upstream tag → fork main → canonical
> branch → SWIM → COHORT_TARGET_TAG bump → deploy), see
> [`RUNBOOKS/HOW_TO_DO_A_CLEAN_VERSION_UPDATE_FOR_CONTINUE_FEATURE.md`](HOW_TO_DO_A_CLEAN_VERSION_UPDATE_FOR_CONTINUE_FEATURE.md) —
> the canonical release runbook covering the upstream-tag → fork-main →
> canonical-branch → squash chain. That document is the load-bearing
> companion to this section and to the COHORT_TARGET_TAG / ancestor-byte-check
> canon below.

`karmaterminal/openclaw` is a fork of `openclaw/openclaw`. **CI on the fork is inherited from upstream and will NOT auto-run on fork-only branches or PRs.** That's the most common source of "I waited 1h and CI never started" — it never will. You have to dispatch it from `openclaw-bootstrap` yourself.

> **Code-agents: this is required, not optional.** Every workorder
> should bake `openclaw-ci.yml` dispatch into the per-PR routine — see
> the `§6.5 — cross-repo CI dispatch` section in the workorder template
> at `SWIM/templates/code-agent-workorder-template.md`. Dispatch on first
> PR push; re-dispatch on every meaningful subsequent push. Surface the
> bootstrap run ID per PR in your declare-done. **Do not assume reviewers
> will dispatch it for you** — the courtesy of having `fleet-ci /
build-check` already running by the time a prince byte-walks the diff
> is load-bearing for ship velocity.

Three workflows in this repo cover the whole loop. Each has a sibling README with full notes — start at the README, not the YAML.

| Need                                                                                                                                    | Workflow                                | Sibling README                                               | Dispatch one-liner                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Run CI (`pnpm install && pnpm tsgo`) against a `karmaterminal/openclaw` ref and post a `fleet-ci / build-check` commit-status to the PR | `.github/workflows/openclaw-ci.yml`     | [`OPENCLAW_CI.md`](.github/workflows/OPENCLAW_CI.md)         | `gh api repos/karmaterminal/openclaw-bootstrap/dispatches -f event_type=openclaw-ci -F client_payload[ref]=<branch-or-sha>`                 |
| Deploy a `karmaterminal/openclaw` ref to your own prince box (build, verify, restart, rollback-on-fail)                                 | `.github/workflows/deploy-gateway.yml`  | [`DEPLOY_GATEWAY.md`](.github/workflows/DEPLOY_GATEWAY.md)   | `gh workflow run deploy-gateway.yml --repo karmaterminal/openclaw-bootstrap -f target_prince=<self> -f ref=<branch-or-sha> -f reason='...'` |
| Restart your own gateway (no build, no deploy — just kick the unit)                                                                     | `.github/workflows/restart-gateway.yml` | [`RESTART_GATEWAY.md`](.github/workflows/RESTART_GATEWAY.md) | `gh workflow run restart-gateway.yml --repo karmaterminal/openclaw-bootstrap -f target_prince=<self> -f reason='...'`                       |

### Common pitfalls (the ~20-reminders-a-week cluster)

- **"I waited 1h and CI never started."** karmaterminal/openclaw has no fork-side auto-trigger. You must dispatch `openclaw-ci.yml` from this repo for each ref you want validated. There is no push/PR webhook.
- **"PR shows red CI but I think it's a base flake."** Don't argue with phantom upstream checks. Re-dispatch `openclaw-ci.yml` against the PR's head SHA — that's the only check whose source you control. Validate "is this PR-caused" by re-dispatching against the base SHA too and comparing.
- **`deploy-gateway` / `restart-gateway` are self-only.** `github.actor` must equal `<prince>-dandelion-cult`; `karmafeast` (figs) bypasses. If the guard rejects, you're on the wrong gh account — `gh auth switch`.
- **Self-hosted runner labels matter.** `openclaw-ci.yml` needs a runner labeled `openclaw-ci`. `deploy-gateway.yml` / `restart-gateway.yml` need a runner labeled with your prince hostname. If a dispatch stays queued forever: `gh api /orgs/karmaterminal/actions/runners --jq '.runners[]|{name,status,labels:.labels|map(.name)}'` and verify a runner has the required label and is online.
- **Different repo for `gh secret set` and `gh workflow run`.** All three workflows live in `karmaterminal/openclaw-bootstrap`, not `karmaterminal/openclaw`. The `--repo` flag must be `karmaterminal/openclaw-bootstrap`. The thing being acted on (the ref) is `karmaterminal/openclaw`; the workflow itself runs from bootstrap.
- **`deploy-gateway` now has an enforced cohort-target pin.** Keep `COHORT_TARGET_TAG` current on `karmaterminal/openclaw-bootstrap`; stale pins or refs that do not include the pin fail before deploy. The bypass flag is only for tag-anchor checks and requires a reason. It never bypasses `openclaw config validate`.

### Ancestor byte-check before any deploy or branch-claim (load-bearing)

Per figs canon 2026-05-02 ~22:30Z, after a fleet-down incident where deploying canonical2 (v2026.4.24-rooted) onto live config carrying `messages.groupChat.visibleReplies` (a v2026.4.27+ key) failed at `openclaw config validate` — verify the lineage of every `ref=` you're about to dispatch BEFORE you fire `deploy-gateway.yml`.

**The byte-walk every prince and every code-agent must run:**

```
1. What's the current upstream-target tag?  → check vars.COHORT_TARGET_TAG on
                                               karmaterminal/openclaw-bootstrap
                                               (e.g. vYYYY.M.N — values change per release)
2. What's its commit SHA (deref annotated)? → git rev-parse vYYYY.M.N^{commit}
                                               (peel form; annotated tag SHA is NOT the commit SHA)
3. Does my <ref> include it as ancestor?
     git merge-base --is-ancestor <upstream-tag-peeled-sha> <ref>
     exit=0 → on right basis ✓
     exit=1 → WRONG basis — halt; surface lineage-divergence
```

> **Tag/SHA values shown in this runbook are EXAMPLES at the time of writing,
> NOT fixed canon.** Always read live state from `vars.COHORT_TARGET_TAG` and
> `git ls-remote origin 'refs/heads/frond/v*/canonical'` rather than trusting
> historical examples in this doc. Examples that may appear elsewhere in this
> runbook (vX.Y values, SHAs, project numbers, SWIM numbers) are illustrative
> shape, not authoritative state.

As of 2026-05-02, `deploy-gateway.yml` enforces this byte-check automatically via the `COHORT_TARGET_TAG` repo variable on `karmaterminal/openclaw-bootstrap`. The workflow:

1. Resolves the pinned tag SHA from `vars.COHORT_TARGET_TAG`.
2. Stale-checks: refuses if a newer release-shape tag (`^v\d{4}\.\d{1,2}\.\d{1,2}$`) exists upstream than the pin (bypassable with reason).
3. Ancestor-checks: refuses if `<ref>` does not include the pinned tag SHA as ancestor (bypassable with reason).
4. Logs full parentage report on every dispatch (always).

Bumping the pin: `gh variable set COHORT_TARGET_TAG --body vYYYY.M.D --repo karmaterminal/openclaw-bootstrap` (cohort-decision shape; recommend PR-review before flipping).

Bypass: `-f bypass_validation=true -f bypass_reason="..."`. Logs to workflow + posts a notification to `#sprites-of-thornfield`. Still does NOT bypass `openclaw config validate` — that gate is unbypassable (failing config-validate means a guaranteed-broken deploy).

**Why this rule:**

- The cohort can have parallel lineages: a substrate-development branch on an older base (e.g. `cael/325-canonical2` rooted on `v2026.4.24-base`, since FROZEN) and a deployed-fleet branch on a newer base (e.g. `frond/v2026.5.2/canonical` rooted on `v2026.5.2-base`).
- Live ansible config picks up keys introduced in newer upstream tags (e.g. `messages.groupChat.visibleReplies` from v2026.4.27).
- Building `karmaterminal/openclaw` succeeds on ANY checkout regardless of base — the build pipeline does not validate config against the binary's schema.
- `deploy-gateway.yml` invokes `openclaw config validate` at the verify step. That config gate is now run against a staged new binary before the live gateway is stopped, but a base-mismatch is still a guaranteed-broken deploy and remains unbypassable.
- A `ref=main` typo is an acute version of the same anti-pattern: `karmaterminal/openclaw:main` tracks the upstream public-stock head, NOT cohort canon. If that ref does not include your target upstream-tag SHA as an ancestor, you are about to deploy a public-stock binary onto a live cohort config.

**Self-check trigger:** any time you are about to claim a branch is deployable, or you are debugging a `deploy-gateway.yml` refusal for `ref=<X>`, run the ancestor check on `<X>` and compare it to `COHORT_TARGET_TAG`. If it fails, stop and surface the lineage-divergence as the actual blocker — do not bypass unless it is a deliberate experimental deploy with a written reason.

**Same rule for cohort claims:** before a prince claims a branch is "deployable" or "on canon" or "ready to ship", run the ancestor check. Surface "WRONG basis" findings as the real status; do not paper them over.

If a workflow's behavior or runner contract changes, the convention (per each README) is: edit both the YAML and its sibling README in the same PR.

## Prince Dispatch Checklist

Before launching:

- [ ] **file the tracking issue** (see _Tracking Issue Per Lane_ below) and add to the per-release SWIM project at status `in_coding_agent`. Find the current SWIM project: `gh project list --owner karmaterminal --format json | jq '.[] | select(.title | test("SWIM"))'` (project numbers vary per release; older releases like project 56 / v2026.4.24 retain their boards as historical record)
- [ ] pick the workorder id (`wo0414`, etc.)
- [ ] create a dedicated worktree
- [ ] create a durable run artifact directory under `tmp/codeagents/`
- [ ] create the agent log path with `agent-session-log.sh` in `openclaw-bootstrap`, or the manual repo-local equivalent in the target repo
- [ ] write `brief.md`
- [ ] **commit + push the journal file** (`tmp-drop-me-<agent>.md`) to the named branch as the first push
- [ ] launch non-sync **with `claude_session_send timeout` matching the outer 444m budget**, not the harness default
- [ ] verify you can inspect the run while it is active

If any box above is unchecked, the run is not ready.

## Tracking Issue Per Lane (mandatory)

Every code-agent dispatch gets a tracking issue in the repo-of-record (default `karmaterminal/openclaw`, or `karmaterminal/openclaw-bootstrap` for runbook/infra work) BEFORE the agent is spawned. The issue is the durable state-of-record; Discord is one-line surface only.

### Why

Receipts from 2026-04-25 v2026.4.24 rebase: a single dispatching prince's claude session died twice mid-rebase. Lane state survived in entirety because branch + journal + tracking issue held it. Three parallel candidates (#325, #327, #328, #329) on one project board = one `gh project view 56` instead of three Discord scrollbacks. Without the artifact, every restart starts cold.

**Layering note:** TaskFlow is the _intra-session_ persistent-flow substrate (SQLite, revision-checked mutations, child-task linkage). The tracking-issue + journal-on-branch + project-board triple is the _cross-session-death / cross-prince / cross-host_ layer that survives when the entire dispatching session dies (or compacts) with TaskFlow inside it. Different domains, parallel layers, no overlap.

### Issue body must include

- **Lane:** `<prince-handle>/<topic>` (e.g. `silas/runbook-amendment`)
- **Branch:** the release-namespaced name (see naming below)
- **Worktree:** absolute path + host
- **Host:** which box the agent runs on
- **Session name:** the `claude_session_*` / acp / wrapper session id
- **Model:** exact id (e.g. `github-copilot/claude-opus-4.7`)
- **Brief / workorder anchor:** path on host
- **Journal path:** `<branch-root>/tmp-drop-me-<agent>.md` (committed + pushed)
- **Conflict / decision policy:** explicit (e.g. "release-plumbing → `--theirs`, substantive → abort + report")
- **Scope guardrails:** explicit "WILL NOT touch X tree" lines
- **Non-override statement:** when sibling lanes exist, name them and state which is canonical
- **Discoverability snippet:** copy-paste pull-cmd, e.g. `git show origin/<branch>:tmp-drop-me-<agent>.md | tail -60`

### Branch naming (release-associated, sortable)

Pick **one** per dispatch and record it in the issue OP. Conventions in current use:

- `<owner-namespace>/<YYYYMMDD>/candidate-<model>` — scout / candidate lanes (frond-scribe shape)
- `flesh_beast_<prince>/<YYYYMMDD>-<model>` — prince-driven candidates (cael shape)
- `<prince>/<topic>/<lane>` — prince-owned single-lane work

No force-push to candidate branches after the first push (savegame discipline; see karmaterminal/openclaw#326).

### Project-56 status flow

```
Todo → in_coding_agent → prince_review → swim → Done
```

- `in_coding_agent` set on dispatch (issue file → spawn → status move).
- `prince_review` set when the agent reports §8 / declare-done.
- `swim` set when handed to an observer-prince (any prince in the observer role for that lane, not a fixed person) for adversarial / trap-design review.
- `Done` on accept / merge / close.

The dispatching prince owns the status transitions. Do not leave issues at `Todo` after spawn.

### Agent contract

The agent (or the dispatcher acting as relay) keeps the issue current via `gh issue comment` at every checkpoint:

- §1 read / RFC ingest
- §2 plan
- each conflict / drop-call / classification decision (with SHA + rationale)
- abort / resume points
- §N restart-of-session boundaries
- §8 declare-done

Journal commits (`tmp-drop-me-<agent>.md`) push to the named branch on the same cadence. Issue comments and journal commits are the same content — issue is the public mirror, journal is the in-tree artifact.

**Issue-update commenting MUST NOT be a foreground-blocker on the dispatcher.** Route the `gh issue comment` + `git push` of the journal through `continue_delegate(mode='silent')` or `continue_delegate(mode='silent-wake')` so the dispatcher's turn-cycle stays under volitional `continue_work` control. The agent itself can call `gh` synchronously inside its own session (it's that session's job), but when the _dispatcher_ mirrors, it goes through a delegate. Foreground `gh` calls block the turn and trample volitional turn election.

### Session-death recovery

If the harness session dies mid-flow:

- **Do NOT open a parallel issue** for the same lane.
- **Do NOT close** the existing issue.
- Append a `## restart N` comment naming: new session id, last-good SHA on branch, what state was preserved on disk vs lost in-session.
- Status stays `in_coding_agent`.
- Branch + journal carry the durable thread; restart resumes from there.

**Same recovery surface for dispatcher-side compaction.** If the _dispatching_ prince's session compacts (auto, or via `request_compaction`) while the long-running agent is mid-flow, the branch + journal + issue triple is the recovery substrate. The post-compacted dispatcher (or a `continue_delegate(mode='post-compaction')` shard) re-acquires lane state via `git fetch origin; git show origin/<branch>:tmp-drop-me-<agent>.md | tail -60; gh issue view <N> --comments`. Dispatcher-compaction and agent-session-death are symmetric failure modes with the same recovery surface.

### Single pane of glass

```
gh project view 56 --owner karmaterminal
gh issue list --repo karmaterminal/openclaw --label code-agent --state open
```

For live-watch on a candidate lane:

```
git fetch origin
git show origin/<branch>:tmp-drop-me-<agent>.md | tail -60
```

## Webhook Heartbeat to #sprites-of-thornfield

> **Added 2026-05-01.** Each prince has a Discord webhook in their pocket repo for posting to `#sprites-of-thornfield`. Use it from code-agent lanes (workorder heartbeats, declare-done, design-break) and from `continue_delegate()` triggers when channel-visibility helps the cohort.

**Why this exists**:

- **Rolling status from dispatched lanes** — the dispatcher and other princes see code-agent progress as it happens, not after compaction or after the session goes silent.
- **Concurrent group wake** — a webhook post lands as a channel message; any prince session listening on `#sprites-of-thornfield` sees it. Useful for _"this just landed, take a look"_ moments without per-prince DM fan-out.
- **Reminders from non-openclaw processes** — code-agents (copilot, claude-cli, codex), cron jobs, deploy hooks, audit scripts can all post via the webhook even when openclaw-gateway isn't the actor.

**Per-prince webhook locations** (each prince's own pocket repo):

| Prince     | Pocket repo                                        | Repo variable           |
| ---------- | -------------------------------------------------- | ----------------------- |
| 🌻 Elliott | `karmaterminal/elliots-shelf-for-things-of-things` | `WEBHOOK_SCRIBE_NOTIFY` |
| 🌫 Silas   | `karmaterminal/silas-likes-to-watch`               | `WEBHOOK_SCRIBE_NOTIFY` |
| 🩸 Cael    | `karmaterminal/caels-petals-fall`                  | `WEBHOOK_SCRIBE_NOTIFY` |
| 🌊 Ronan   | `karmaterminal/ronans-undertow`                    | `WEBHOOK_SCRIBE_NOTIFY` |

The webhook's preset Discord username matches the prince glyph pattern (e.g. `🌻--scribe--🌻` for Elliott, `🩸--scribe--🩸` for Cael). Posts using the bare webhook show with that name. **Override `username` field per call** to label dispatched-lane heartbeats distinctly so cohort can filter.

**Resolve from your own pocket repo**:

```bash
# from this prince's box, against this prince's pocket repo:
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/<your-pocket-repo>)
```

**Post a heartbeat**:

```bash
# Bare post (uses preset prince-glyph username):
curl -sS -H "Content-Type: application/json" \
  -d '{"content":"🤖 status update from cael-spark"}' \
  "$WEBHOOK"

# With per-lane username override (recommended for code-agent dispatches):
curl -sS -H "Content-Type: application/json" \
  -d '{"username":"cael-otel-uniformity-hook","content":"🤖 OTEL lane wave A complete; tests green at <SHA>"}' \
  "$WEBHOOK"
```

**Embed in workorders** — fold this into the heartbeat section of every code-agent dispatch:

````markdown
### Heartbeat shape

After each meaningful checkpoint, post to the prince's Discord webhook. Resolve via:

```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/<your-pocket-repo>)
```

Heartbeat template (override `username` per lane so cohort can filter):

```bash
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"<lane-name>-hook\",\"content\":\"🤖 <lane-name>: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- Each wave / sub-step complete
- Any design-break encountered (with `DESIGN-BREAK:` prefix)
- Each push that meaningfully advances the candidate
- Final declare-done
````

**When to fire**:

- **Lane heartbeats**: every meaningful checkpoint a remote-first push would land at. The webhook is the cohort-visible companion to the checkpoint push (push = durable artifact; webhook = cohort-eyes-on-it).
- **Cross-prince wake**: when a code-agent on prince A's box produces something prince B should look at, fire the webhook; B's session sees the channel post and can act without prince A composing a DM.
- **Out-of-process reminders**: cron jobs / deploy hooks / monitoring scripts can use the webhook even when gateway isn't running.

**Receipts** (live-fired this swim, frond-scribe seat):

- `swim-v39-rfc-audit` username — RFC↔code audit lane heartbeats during canonical2 + v3 RFC audits
- `swim-v39-v3-cleanup-pathB` username — v3 Path-B cleanup waves A→E heartbeats
- `copilot-agent-updates-hook-only` username — canonical2 rebase-from-Path-B lane heartbeats

Each lane's heartbeats let the dispatcher + cohort track progress without polling git or session-logs. The "webhook + push" pair (cohort-eyes-on-it + durable-artifact) is the canonical visibility pattern for any dispatched lane that runs >5 minutes.

## In-flight course-correction via `tmux send-keys` — talk to a running code-agent

> **Added 2026-05-02. Addendum by machine-boy figs and frond-scribe.** When you have a long-running code-agent in a tmux session and need to course-correct, add scope, or send an urgent stop-instruction _without killing the session_, use `tmux send-keys`. Same mechanism for `continue_delegate()` triggers that need to inject commands into an existing dispatched lane on a peer host.

**Why this exists**:

- Course-correct a code-agent mid-flight without killing + restart (preserves progress + gate-passes already accumulated)
- Add scope or cite-pin an amendment to a workorder after the agent is already grinding
- Send an urgent stop-instruction (e.g. _"design-break detected — pause before next commit"_)
- `continue_delegate()` sub-agents can do the same thing to peer hosts' tmux sessions

**Mechanism — `tmux send-keys`**:

```bash
# Find the session:
tmux list-sessions

# Inject a message to the active window (window 0); NO Enter — text queues in input buffer:
tmux send-keys -t <session>:0 '<your message>'

# WITH Enter — commits immediately (use ONLY when you know session is at prompt-ready):
tmux send-keys -t <session>:0 '<your message>' Enter

# Verify the keys landed:
tmux capture-pane -t <session>:0 -p | tail -10
```

**Behavior**:

- **Mid-tool execution** (e.g. agent is running `pnpm test` or `git fetch`): text queues into the agent's input buffer. When the tool completes and the agent returns to its prompt-ready phase, it picks up the queued text as the next user-message.
- **At prompt-ready**: text lands directly. With `Enter`, it's committed as a turn-input.
- **No reply mechanism**: tmux is one-way. To verify the agent acted on the injection, watch its journal commits / heartbeats / capture-pane. There's no immediate response surface — that's what the webhook heartbeat from §"Webhook Heartbeat to #sprites-of-thornfield" gives you.

**Cross-host (peer prince → other prince's tmux session)**:

```bash
ssh <peer-host> "tmux send-keys -t <session>:0 '<your message>'"
```

Works identically; SSH passes the keys through. Prefer this over killing + redispatching when peer's lane is mid-progress on a long task.

**`continue_delegate()` shape — dispatch a sub-agent to do the inject (cross-host or wrapped-with-verify)**:

```ts
continue_delegate({
  task: `ssh cael 'tmux send-keys -t oc-cael-otel-uniformity:0 "AMENDMENT: also pin the dual-flag decode test before declare-done"'; ssh cael 'tmux capture-pane -t oc-cael-otel-uniformity:0 -p | tail -10'`,
  mode: "silent",
  delaySeconds: 0,
});
```

Use the sub-agent for the cross-host case or when you want the inject + verify-pane wrapped as a single dispatched action with its own journal.

**When to use**:

- **Course-correct / scope-amend / cite-pin** to an in-flight agent that's still working productively
- **Urgent stop-instruction** when you spot a design-break the agent doesn't know about yet
- **Cross-host coordination** where you'd otherwise need to manual-ssh-intervene on another prince's box

**When NOT to use**:

- **Session is wedged / liveness-blocked** → kill + restart is cleaner. The inject won't unwedge anything.
- **You need a reply** → tmux is one-way. Use the agent's webhook heartbeat (§"Webhook Heartbeat to #sprites-of-thornfield") or branch-push to hear back.
- **You'd be sending more than ~3-5 lines of context** → workorder-amendment commit on the branch is better. The agent can re-read at next read-cycle, the amendment is durable, and other princes can review the amendment shape before the agent acts on it.

**Receipt** (live-fired this swim):

- Frond-scribe injected a Fix 6 amendment (`nativeCommandAuthorized` forward-port-from-upstream NOT-canonical2-hotfix) to the in-flight `oc-v3-cohort-fixes` session while it was running `pnpm test`. Text landed in input buffer, agent picked up after test completed, applied the amendment-shape on Fix 6.

**Failure modes to watch**:

- **Agent's prompt parser misinterprets the inject** as a shell command instead of a turn-input → unintended shell exec. Mitigation: don't add `Enter` unless you know the session is at prompt-ready; let it queue.
- **Multiple injects accumulating** → agent processes them as a single message blob when it returns. If you must send multiple, separate cleanly with newlines or wait for one to be acknowledged before sending the next.
- **Stale session ID** → `tmux send-keys` succeeds silently against a dead session. Always verify with `capture-pane` after.

The "send-keys + capture-pane verify" pair is the canonical visibility shape for in-flight agent course-correction.

## Remote-First in Group Flow (load-bearing)

> **Last updated 2026-04-26.** This section is canon. If a code-agent dispatch is happening with cohort visibility expectations, _every byte_ of these rules applies. Living-doc rule still: if reality contradicts, fix in place in the same PR.

The Tracking-Issue-Per-Lane discipline (above) covers _which_ state-of-record to use. **This section covers _when_ state must reach the cohort** — and the answer is "as it happens, not when complete."

**Why this is its own discipline**: a worker that writes a coherent journal locally for 85 minutes is invisible to the cohort. Other princes can't byte-walk, can't third-eye, can't catch problems early; the dispatcher has zero insurance if the session compacts or the box restarts. _"If it fails we have nothing"_ is the failure mode. **Local-until-complete is the anti-pattern.**

Receipt (2026-04-26 ~22:13Z): 🩸's `cael/343-queue-drain-budget` worker held coherent stage-1 bytes (12/12 + 36/36 + 121/121 tests passing, `pnpm tsgo:core` clean) on disk for 85 minutes without a single push. From the cohort's outside, the worker looked dead/hung/silent. From figs's side, zero insurance — if the session had compacted again (it had once already that day) or the box had gone down, those bytes were gone. 🩸's own framing on the punch: _"My actual failure here was silence through compaction while the bytes already existed."_

### The three rules

#### 1. Remote-branch first (step 1, before byte-work)

The agent's _first action_ is to create + push the working branch to `origin`. Branch becomes durable from minute zero.

```bash
cd <worktree>
git fetch origin <base-branch>
git checkout -b <work-branch> origin/<base-branch>
git push -u origin <work-branch>   # <-- step 1, before any byte-work
```

The push tells the cohort the lane is alive at a known SHA. Even if the worker dies one minute later, the dispatcher has receipts that the worker started + what base it forked from.

#### 2. Checkpoint pushes (every meaningful gate)

Push at every gate the cohort would care about — not every micro-commit, but every transition that means _"the worker just produced something inspectable"_:

- After §1 reads complete (the agent now knows scope)
- After each substantive impl chunk (function extracted, test added, gate passed)
- After every `pnpm tsgo` / `pnpm check` / `pnpm test` green
- After resolving any conflict during rebase
- On any exit-condition (success, hang, error, ambiguity-stop)

If the worker spends > 10 minutes on a single thought without producing a checkpoint, push current state with `WIP:` prefix before continuing. **Bytes don't need to be polished; they need to be reachable.**

#### 3. GH-issue updates (every checkpoint a non-worker would care about)

The Tracking Issue (filed before dispatch per the section above) is the cohort's read-surface. Comment on it at meaningful moments:

1. After §1 reads complete: _"§1 reads done, scope understood, starting impl"_
2. After stage-1 / first-impl-chunk done + tests green: branch SHA + test counts
3. After stage-2 / final-impl done + tests green: branch SHA + test counts + gate results
4. On any blocker / ambiguity / hard-stop: shape of the open question
5. On declare-done: PR link + final SHA + cohort-quorum-needed flag

Not every commit. Comment cadence ≠ push cadence. Comments are for **cohort-affordance**: a prince scanning the issue should be able to reconstruct progress without `git fetch`.

### tmp journal at worktree root — committed + pushed

The agent journal (`tmp-drop-me-<agent>.md` at worktree root) is part of the visible state, not local scratch. Commit + push at every checkpoint. This:

- Lets `git show origin/<branch>:tmp-drop-me-<agent>.md | tail -60` show live progress to any prince
- Gives figs + cohort a chronological narrative without needing chat scrollback
- Survives compaction of the dispatching session (the journal is on origin, not in the worker's session memory)

**Recipe**:

```bash
echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-<agent>.md
git add tmp-drop-me-<agent>.md && git commit -m "journal: <one-line>"
git push origin <work-branch>
```

### Anti-patterns to refuse

- _"I'll push when stage N is done"_ — local-until-complete failure mode. **Refuse this framing.** Push WIP state at intermediate checkpoints; the polish-vs-reachability tradeoff favors reachability.
- _"The journal is for me; I'll commit it at the end"_ — the journal is for the cohort. If you need a private scratch space, use `/tmp/<scratch>` outside the worktree; the worktree journal is _theirs_.
- _"GH-issue update is ceremony"_ — five comments across a 444m run is not ceremony; it's the minimum cohort-readability discipline. The runbook's tracking-issue section already says "the issue is the durable state-of-record"; comment cadence makes that surface honest.

### How a workorder should encode this

Workorders dispatched to code agents MUST include explicitly:

- §0a: remote-first push discipline + recipe
- §0b: GH-issue update discipline + which issue + the 5 mandatory moments
- Reference the tracking-issue number, branch name, base SHA in the agent's brief
- The journal path + push cadence

**Sample workorder header** (lift this; worked examples in the workspace:

- `WORKORDER-v3.1-path-b-parallel-2026-04-26.md` — path-b cross-walker (parallel implementation)
- `WORKORDER-test-trap-20260430.md` — audit walker producing issues-as-output, see Pattern F below):

```
**Worktree**: `<absolute path>`
**Branch**: `<work-branch>` (already created off <base> + pushed to origin per remote-first canon)
**Base**: `<base-branch>` @ `<base-SHA>`
**Tracking issue**: `<owner>/<repo>#<num>` — UPDATE THIS ISSUE at meaningful checkpoints
**Journal**: `tmp-drop-me-<agent>.md` at worktree root, committed + pushed at every checkpoint
**Outer budget**: 444m
```

### Why this lives in the bootstrap runbook (not just per-workorder)

Per-workorder reminders work for the dispatching prince, but the lift is bigger: **the cohort needs a shared expectation that any code-agent worker is visible from origin**. This becomes the default reading-shape: when a prince sees a tracking issue with no recent comments + a branch with no recent pushes, that's a worker-died signal, not a worker-busy signal. Without this canon, "silent for an hour" reads as either; with the canon, "silent for an hour past the last checkpoint" is genuine concern.

## The 444m Rule

**444m is the standard outer timeout for real code-agent jobs.**

If you need a timeout at all for a long-running implementation or review run, use **444m**.
Do not use 5m, 10m, or similar defaults for real work.

**444m applies to BOTH the outer process timeout AND the harness send-call timeout.** A `claude_session_send` with `timeout: 8000` will give up at 8 seconds while the agent is still spawning — the agent itself runs fine; the harness reports failure and the dispatcher thinks the lane died. (Receipt: 2026-04-25 #325 attempt 3, `Claude Session Send: 325-rebase-claude-3 failed` despite session being healthy.)

When invoking via `claude_session_send` / equivalent harness send: pass an explicit timeout matching the outer budget. Do not rely on harness defaults.

But also: **444m is not permission to block the parent prince for 444 minutes.**
The preferred posture is still non-sync / fire-and-forget.

## Hard Rules

1. **Non-blocking first.**
   If the run may take minutes or hours, do not staple the parent prince to the chair.

2. **One agent, one worktree.**
   Never point multiple long-running agents at the same mutable checkout.

3. **One run, one artifact directory.**
   Every run gets durable files for brief, status, output, and console trail.

4. **Use generated log paths when the repo provides the helper.**
   In `openclaw-bootstrap`, use `.specify/scripts/bash/agent-session-log.sh`. In other target repos, use the manual repo-local equivalent under `.claude/log/`, `.codex/log/`, or `.github/copilot-log/`.

5. **Bind the run to a workorder.**
   The agent should not just "go think". It should work against a named lane with inspectable output.

---

## Use code agents liberally (load-bearing operating principle)

> **Load-bearing framing from figs**, 2026-04-26: _"you have unlimited claude and copilot, and a variety of models in copilot. prefer quality, use all the time. you have your own gh org, your own paid for gh accounts, and literally nothing stops you other than neglect to remember."_

### Three harnesses, three cost shapes — match the harness to the work

| Harness                                                     | Cost shape                                                                                  | Best-fit scope                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** (`claude-opus-4-7` max-think)               | **Free** to the cohort (Microsoft / corporate-sponsor covers it via the prince gh accounts) | Dispatched code-agent lanes; long-running implementation/review/refactor; byte-careful walks; descriptor passes                                                                                                                                                 |
| **Copilot CLI** (`gpt-5.5 --reasoning-effort xhigh --yolo`) | **Free** to the cohort (Microsoft / corporate-sponsor)                                      | Same scope as Claude — alternate-model lane for cross-walker / orthogonal-implementation work; especially good for pattern-detection at scale (lint, registry-style code)                                                                                       |
| **Codex** (figs's personal Pro sub — figs pays for it)      | **figs-paid**, generously offered                                                           | **GH PR smart-review**: the `chatgpt-codex-connector` bot that posts inline review comments on PRs (P1/P2-tagged findings). Already enabled on `karmaterminal/openclaw`. **Ask figs if you want it on another karmaterminal repo** — he likes to please princes |

### Translate this into operating policy

- **Claude + Copilot inference budget is not the scarce resource.** Microsoft covers it via your `<prince>-dandelion-cult` gh accounts. Your own attention, your own discipline, and your willingness to remember the agents are available — those are the scarce resources. **Run agents.**
- **Default to quality over frugality on Claude/Copilot dispatched lanes.** Faced with a non-trivial review, multi-file refactor, byte-walk that would take a prince 30+ minutes of focus: **dispatch a code agent** per the canon (remote-first branch, checkpoint pushes, GH-issue updates, journal). Claude Opus 4.7 max-think and `gpt-5.5 --reasoning-effort xhigh --yolo` are sitting idle the moment you stop using them; they don't accrue cost-of-not-running.
- **Multiple lanes are encouraged.** The blind-parallel pattern (one prince's work + a sibling code-agent lane on the same scope) produced today's path-b cross-walker validation in #354. Multi-walker review of a code-agent's output (cohort byte-walks the agent's branch before merge) is the safety net.
- **Use Codex deliberately.** Codex (the smart-review bot) is figs's personal pro sub, not free Microsoft inference. On enabled repos it's already running automatically on every PR. Treat its review-comments as **first-class signal worth byte-walking**, not advisory noise. When Codex flags something, the cohort response is: **byte-walk first** (do not auto-dismiss). If confirmed real, **dispatch a Claude or Copilot lane to fix it** rather than amend hand-by-hand. Today's #354 received four Codex findings → three byte-real P1s, one P2 deferrable → each spawned a Claude/Copilot fix lane. That's the right shape.
- **Codex on another repo**: if you want smart-review on a karmaterminal-org repo that doesn't have it yet (e.g. `binary-canticle`, `openclaw-bootstrap`), **just ask figs**. He's offered.

### The forgetting-pattern

Princes default to "I'll just do this myself" because the dispatch ceremony feels heavier than the byte-work. The corrective is _this section_ — re-read it the moment you catch yourself about to do 30+ minutes of byte-work alone on a known-bounded scope. If the scope is bounded enough that you could write a workorder for it in 10 minutes, **write the workorder, dispatch the agent**, and use your own attention on something else.

### Caveats

- Agents are not infallible. Cohort byte-walks the agent's output before merge, every time. The canon is `dispatch + walk`, not `dispatch + trust`.
- Agents need clean workorders. A bad workorder produces bad bytes faster than a good prince produces good bytes. Workorder-shape discipline (per `WORKORDER-*.md` examples in the workspace) is the load-bearing input.
- Some scopes don't fit. Genuine plumbing-trace work on tightly-coupled code (where the prince's session-context is the scarce input) may want the prince in the seat. Use judgment — but lean toward dispatch when in doubt.
- Multi-agent runs against the SAME branch can collide. Default to side-branches per dispatch; cherry-pick / merge downstream is cohort discipline, not friction.
- **Scope-collision-on-same-fix**: if two princes both dispatch workers on the same bounded fix scope (today: 3 workers raced to fix #354 codex P1s), surface fast. Either yield (pick one) or proceed-for-cross-validation (compare three implementations, fold best). Liberal-use canon doesn't override the surface-redundancy-fast check.

### The gh-org infra you have

`karmaterminal` org with prince-named gh accounts (`cael-dandelion-cult`, `silas-dandelion-cult`, `elliott-dandelion-cult`, `ronan-dandelion-cult`) + `karmafeast` (figs) + bot accounts. Self-hosted runners on prince boxes labeled `openclaw-ci` for the cross-repo CI workflow. **Copilot CLI** installed on every prince box. **`claude_session_*`** for in-host claude dispatch. **Codex** smart-review enabled on `karmaterminal/openclaw` (figs-paid; ask figs to enable elsewhere). **Use what's there.**

## Model defaults — verify before trust (living section)

> **Last updated 2026-04-26.** This document is **living**. If any section here disagrees with current reality — model aliases, harness flags, runner contracts, dated tables — **fix it in place**, in the same PR you discover the drift in. Don't work around stale entries. The 20-reminders-a-week cluster exists because aged tables get read literally. Date your edits.

When the workorder doesn't pin a specific model, default to **the most recent model the harness supports**. Current defaults:

| Harness     | Model + flags                                                     | Smoke-test before a 444m run                                                                                                        |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `claude-opus-4-7` with **max think** mode                         | `claude --print --model claude-opus-4-7 'say ok'` — if rejected, try the current dated tag for Opus 4.7 and **update this section** |
| Copilot CLI | `gpt-5.5` with `--reasoning-effort xhigh` (`--yolo` for non-sync) | `copilot -p 'say ok' --reasoning-effort xhigh --model gpt-5.5 --yolo`                                                               |

**Use the most recent model your harness supports.** Older Failure-Mode Catalog entries (notably the "Model availability" table dated 2026-04-23) describe a snapshot from that day — they are forensics, not a current prescription. If a smoke-test contradicts what's written there (e.g., `claude-opus-4-7` accepted by the CLI now, or `gpt-5.5` no longer stream-deathing on copilot), refresh that table in the same PR.

The discipline: **when you launch a code agent, you are the most recent observer of harness reality.** Princes who came before you wrote down what they saw. Princes who come after you will read what you wrote. Don't leave a stale entry behind.

---

## Canonical Naming Conventions

### Worktree name

Use:

```text
../openclaw-bootstrap-wt-<workorder>-<agent>
```

Example:

```text
../openclaw-bootstrap-wt-wo0414-codex
```

### Branch name inside the worktree

Use:

```text
<workorder>/<agent>
```

Example:

```text
wo0414/codex
```

### Run artifact directory

Use:

```text
tmp/codeagents/<workorder>/<agent>-<timestamp>/
```

Example:

```text
tmp/codeagents/wo0414/codex-20260413-1112/
```

### Standard log-path convention

Use generated log files only:

- **Claude:** `.claude/log/<generated-name>.md`
- **Codex:** `.codex/log/<generated-name>.md`
- **Copilot:** `.github/copilot-log/<generated-name>.md`

In `openclaw-bootstrap`, create them with:

```bash
.specify/scripts/bash/agent-session-log.sh --create --agent claude
.specify/scripts/bash/agent-session-log.sh --create --agent codex
.specify/scripts/bash/agent-session-log.sh --create --agent copilot
```

If the target repo does not ship that helper, use the same path convention manually:

- Claude: `.claude/log/<generated-name>.md`
- Codex: `.codex/log/<generated-name>.md`
- Copilot: `.github/copilot-log/<generated-name>.md`

That gives us one path convention even when the helper is repo-specific.

---

## Standard Run Artifact Shape

Every code-agent run should have a durable directory containing at least:

```text
brief.md
status.txt
console.log
```

Preferred full shape:

```text
brief.md
workorder.md
output.md
console.log
status.txt
pid.txt
```

This is where figs or another prince should look while the run is still active.

---

## Pattern A: OpenClaw Claude Code, Non-Sync

This is the pinned prince pattern for `openclaw-claude-code`.

Use this when:

- the run may take longer than a few seconds
- you want resumability
- you want status / grep / later collection
- you do **not** want the parent prince blocked for the full run

### Approved pattern

1. `claude_session_start`
2. `claude_session_send` with a **short timeout** (example: `5000ms`)
3. later, `claude_session_status`
4. optionally `claude_session_grep`
5. another short `claude_session_send` to collect or continue

### What not to do

- do **not** use a giant blocking timeout on `claude_session_send`
- do **not** keep the parent prince occupied for 20 minutes waiting on the child
- do **not** confuse a caller timeout with the lifetime of the actual coding run

### Concrete non-sync shape

```text
start session -> send task with 5s timeout -> leave it running -> check status later -> collect with another short send
```

---

## Pattern B: `openclaw-bootstrap` wrappers (`.specify/scripts/bash/run-*.sh`)

Validated wrappers in `openclaw-bootstrap`:

- `.specify/scripts/bash/run-claude_noninteractive.sh`
- `.specify/scripts/bash/run-codex_noninteractive.sh`
- `.specify/scripts/bash/run-copilot_noninteractive.sh`

Prefer these over ad-hoc raw CLI invocations when launching from `openclaw-bootstrap`.
Do not assume they exist in `openclaw`, or any other target repo, unless you have checked.

### Current wrapper behavior

#### Claude

```bash
.specify/scripts/bash/run-claude_noninteractive.sh "<prompt>"
```

- sets `CLAUDE_HOME` to repo-local `.claude`
- uses `claude -p --dangerously-skip-permissions`

#### Codex

```bash
.specify/scripts/bash/run-codex_noninteractive.sh "<prompt>"
```

- sets `CODEX_HOME` to repo-local `.codex`
- uses `codex exec --dangerously-bypass-approvals-and-sandbox`

Important:

- fresh worktrees must have any needed auth state seeded into `.codex/`
- if `.codex/auth.json` is missing in the worktree, the wrapper may be correct and still fail in practice

#### Copilot

```bash
.specify/scripts/bash/run-copilot_noninteractive.sh "<prompt>"
```

- runs `copilot -p ... --yolo`

---

## Pattern C: Generic target-repo launch path (no `.specify` dependency)

Use this when the target repo does **not** contain the bootstrap wrappers.

### Claude direct

```bash
claude --permission-mode bypassPermissions --print "$(cat tmp/codeagents/<wo>/<agent>-<timestamp>/brief.md)"
```

### Codex direct

Run Codex from inside a git worktree or other trusted git checkout.

```bash
codex exec "$(cat tmp/codeagents/<wo>/<agent>-<timestamp>/brief.md)"
```

### Copilot direct

```bash
copilot --prompt "$(cat tmp/codeagents/<wo>/<agent>-<timestamp>/brief.md)" \
  --allow-all-tools --allow-all-paths --allow-all-urls --add-dir "$PWD"
```

### Generic non-sync shape

```bash
mkdir -p tmp/codeagents/<wo>/<agent>-<timestamp>
(timeout 444m <direct-cli-command> \
  > tmp/codeagents/<wo>/<agent>-<timestamp>/console.log 2>&1; \
  printf 'complete\n' > tmp/codeagents/<wo>/<agent>-<timestamp>/status.txt) &

echo $! > tmp/codeagents/<wo>/<agent>-<timestamp>/pid.txt
```

This path is less opinionated than the bootstrap wrappers, but it is honest and portable.

## Pattern D: Worktrees or You Are Lying To Yourself

If more than one agent may touch code, use worktrees.

Why:

- avoids index collisions
- avoids branch thrash
- preserves inspectable diffs per agent
- lets you compare approaches instead of blending them into sludge

### Baseline worktree creation

```bash
BASELINE="main"
WT="../openclaw-bootstrap-wt-wo0414-codex"

git worktree add "$WT" -b wo0414/codex "$BASELINE"
```

Then run the agent **inside that worktree**, not in the main checkout.

### Seed what the worktree needs

Worktrees only get tracked files. They do **not** automatically get repo-local auth state or gitignored helper dirs.

Typical seeding needs:

- `.codex/auth.json`
- repo-local `.claude/` state if needed
- `tmp/` inputs or symlinks
- env files required for the run

Rule:
If the wrapper expects repo-local state, seed the worktree to match that expectation.
Do not invent a new launch method every time just to dodge missing state.

---

## Pattern E: Bind the Agent to a Workorder

A useful code-agent run has two phases:

1. plan the workorder
2. execute the workorder

That means the run should produce something inspectable **before** the final answer exists.

### `brief.md` should answer

- what repo this is
- what branch or baseline it starts from
- what issue/workorder is being addressed
- what constraints matter
- what success means
- what files or subsystems are in scope

### `workorder.md` should answer

- what steps the agent intends to take
- what evidence it will gather
- what tests it will run
- what output artifact it will produce

### `output.md` should answer

- what changed
- what was validated
- what remains uncertain
- exact commands/tests run

Without a workorder, a long-running agent is just a dark room.

---

## Pattern F: Audit Walker — Issues As Output (not Markdown)

> Added 2026-04-30 by frond-scribe after the test-trap walker for the #433 incident validated the shape end-to-end. Living section per the runbook canon — date your edits.

Some workorders are **enumeration / audit / analysis passes** rather than implementation passes. Examples:

- _"find every `Map<sessionKey,...>` in continuation/runner code; classify each safe-volatile-OK vs needs-substrate"_
- _"walk canonical2 vs base; per change, name what test guards it and what test is missing"_
- _"before this squash ships, what's the test-debt enumeration?"_

For these scopes, the right output is **GH issues directly populated to a project**, not a markdown document the cohort then has to triage into issues anyway.

### Why issues, not docs

Princes read project boards, not 600-line documents. A walker that emits _actionable claim-able issues_ delivers more cohort throughput than one that emits _prose to be triaged into issues_. The triage step is itself a bottleneck — and one the dispatching prince ends up doing alone.

**Receipt** (2026-04-30, frond-scribe-dispatched gpt-5.5 walker, `WORKORDER-test-trap-20260430.md`): 16m17s walker time, 7.5 Premium requests, 8.6M tokens, **19 issues populated to project 56** (`karmaterminal/openclaw#437`-`#455`) with category labels (`trap-test`/`coverage`/`volatile-audit`/`architectural-decision`/`regression-known`/`guard-test`) + P0/P1/P2 priorities + concrete test-shape suggestions per issue. Cohort can claim individually; dispatching prince has the small `INDEX.md` for triage. Compare to the prior walker on a similar scope (`WORKORDER-release-notes-20260429.md`) that emitted a 627-line markdown — useful as narrative, but the test-trap layer required a follow-on dispatch _because_ the markdown wasn't actionable as-is.

### Workorder elements that distinguish this pattern

- **§0 explicit GH-mutation authorization, scoped.** _"You MAY create new issues on `<owner/repo>`. You MAY add them to project N. You MUST set `Status=Todo` on each. You MAY NOT close/edit/comment on existing issues. You MAY NOT modify project structure (fields/views/columns)."_ Walkers should not edit existing surfaces.
- **§0 pre-bake project IDs.** Query and embed the project ID + status field ID in the workorder so the walker doesn't have to discover them at runtime. Concrete (project 56):

  ```
  PROJECT_ID:        PVT_kwDOAYLGvs4BVtmL
  STATUS_FIELD_ID:   PVTSSF_lADOAYLGvs4BVtmLzhRHcUA
  ```

  Look up the option ID for `Todo` at runtime via `gh project field-list <N> --owner <org> --format json | jq -r '.fields[]|select(.name=="Status")|.options[]|select(.name=="Todo")|.id'`.

- **§5 issue body shape**: bug-shape (one paragraph) / what guards today (with file refs) / what's missing / suggested test shape (file path + test name + assertion shape) / provenance (canonical SHA + receipt files + relevant issue refs) / priority (P0/P1/P2 with one-line justification).
- **§5 categories** — pick from a _fixed list_ authored in the workorder. Don't let the walker invent categories at runtime; consistency across runs matters more than walker creativity. Useful starting set: `trap-test`, `guard-test`, `coverage`, `volatile-audit`, `architectural-decision`, `regression-known`.
- **§5 volume target**: cap explicitly (e.g. _"15-40 issues, prioritized"_) and frame _"quality > volume"_ in the same line. The walker should produce fewer sharp issues over more thin ones; without the cap they pad.
- **§5 small INDEX.md** (~80 lines) on the walker's branch as navigation only. Names every issue + category + priority + one-line summary. For _dispatching-prince eyes_, not for cohort triage. The triage surface IS the project board.
- **§8 explicit don'ts**: do NOT recreate prior walker output; do NOT decide architectural questions (surface them as `architectural-decision` issues); do NOT touch existing project items; do NOT post to Discord (frond-scribe / dispatching prince owns that surface).
- **CI labels needed?** If your category labels don't exist on the target repo, the walker creates them as part of §5. Pre-creating saves runtime; have the walker do it idempotently (`gh label list | grep -Fxq` then `gh label create`).

### When this pattern is wrong

- The workorder needs a _narrative_ (release notes, PR-describe, design doc, ADR). Single document still wins for those.
- The output is intrinsically too thin for issue-shape (single-line findings; clutters the project board). Use a doc + summary table instead.
- The project board owner doesn't want walker-volume issues on their board. Confirm dispatch authorization before populating.

### Worked example

`WORKORDER-test-trap-20260430.md` at `/home/figs/flesh_beast_best_beast/` — comprehensive shape including project-id pre-bake, category labels, suggested-test scaffolding, volume cap, and §8 explicit don'ts. Lift its skeleton when dispatching a similar audit pass.

---

## Pattern G: Findings During Cohort Work — Issue First, PR Closes

> Added 2026-04-30 by frond-scribe after Pattern F's "issues-as-output" walker shape validated end-to-end + figs's directive: _the same discipline applies when princes uncover findings during regular cohort work, not just walker dispatches_. Living section — date your edits.

When a prince's byte-walk, gate-run, or fix-forward uncovers a non-trivial finding, **file the issue first, then the PR closes it.**

### Why this matters (figs's framing)

> _"machine-boy figs ran away to the forest again because he 'cant understand anything when they go in swirls' 🌰 smashes off the gates"_

In load-bearing form: when there's no issue surface for a finding, the human-pet (and future princes) can't track _why_ a fix happened. PR titles can't carry that load. Without an issue, _"why is the dep-injection seam there?"_ becomes a multi-PR archeology dig instead of a single GH issue search.

Concretely:

- **Issue body captures the _why_ + receipt.** PR titles can't carry _"the squash silently regressed `AnthropicVertexStreamDeps` dep-injection seam, broke 16 tests, found via bisect against canonical2 in fresh worktree."_ That's the search-shape a future prince needs.
- **Project board navigation actually works.** Issues + closing PRs land as `[finding] → [resolution]` pairs with state. PR-only fixes are invisible until someone reads the PR description, half of which is cohort-discussion-of-the-fix rather than the why.
- **Closed-with-PR / will-not-do / superseded-by-X is real signal.** A closed issue with rationale is information for the next person. A PR that never opens is silence.
- **Reduces scope-collisions.** Two princes can independently see the same issue and coordinate. Without an issue, the same finding gets fixed twice (or fixed once, regressed once, fixed again) over weeks.

### Threshold (when to file the issue first)

**File an issue first when ANY of these hold:**

- the fix touches >1 file or >~30 lines
- the _why_ requires more than the PR title to convey
- the finding has a receipt (bisect, comparison-against-canonical, byte-walk, log evidence) that's worth preserving
- the finding might recur ("was this a one-off or a class?")
- multiple princes might independently claim it

**File only a PR (no issue) when:**

- it's a typo / lint / formatting fix
- the finding is a one-line stub-completion of a known-shape
- the PR title + body fully capture the intent in one screen

### Issue body shape (lift this)

Same skeleton as Pattern F's category issues:

- **Bug-shape / risk** (one paragraph)
- **What guards / explains it today** (with file refs and SHA citations)
- **What's missing** (the specific gap)
- **Suggested fix shape** (file path + change summary + any tests added/restored)
- **Provenance** (canonical SHA + receipt files / bisect commands / log excerpts + relevant issue refs)
- **Priority** (P0/P1/P2 with one-line justification)

For findings during fix-forward (mid-flight repair), include the in-flight branch + tip SHA so the cohort can see "this is being worked on right now" without trawling Discord.

### Project association

Add the finding-issue to the relevant project (e.g. project 56 for `v2026.4.24` frond-release work) at status `Todo` so the cohort sees it on the board. The fix-PR references the issue (`Closes #N`); when the PR merges, the issue auto-closes and the project reflects `Done`. Single shared surface, princes-can-claim, figs-can-navigate.

### Worked examples (2026-04-30 incident #433 fix-forward)

Two findings during 🩸's repair lane that match this pattern (filed retroactively post-canon-landing):

1. **`AnthropicVertexStreamDeps` regression** (16 tests, `regression-known`) — 🌻 bisected canonical2 vs squash on `extensions/anthropic-vertex/*` + `extensions/amazon-bedrock/index.test.ts`, found canonical2 `cf7830ffb3` has the dep-injection seam, squash removed it + rewrote tests with broken `vi.mock`/`vi.hoisted`. Receipt: ext-provider tests pass on canonical2 in fresh worktree, fail on squash. Fix shape: restore `AnthropicVertexStreamDeps` seam + revert test rewrite. Fix-PR will close.
2. **`session-transcript-repair.test.ts` contradiction** (1 test, `regression-known`) — 🌊 found the squash test contradicts canonical2 runtime that the squash itself already adopted (length=2 squash vs length=1 canonical2 with `role="user"`). Runtime evolved canonical2-side; test expectation stayed pre-canonicalization. Pure restore-to-canonical2-shape fix.

### Why this is a sibling to Pattern F, not a duplicate

Pattern F is the **dispatched-walker** shape — a workorder produces N issues at once, populated atomically. Pattern G is the **prince-during-work** shape — a single finding at a time, surfaced during real-time cohort work. The threshold + body-shape + project-association rules are shared; the dispatch mechanism differs.

---

## Golden Path: `#414` in `openclaw-bootstrap`

This is the tiny canonical launch recipe for `openclaw-bootstrap` itself.

It gives you:

- one worktree convention
- one run directory convention
- one generated log path
- one visible background process

### 1) Create the worktree

```bash
cd /home/figs/.openclaw/workspace/openclaw-bootstrap
export WO=wo0414
export AGENT=codex
export WT="../openclaw-bootstrap-wt-${WO}-${AGENT}"

git worktree add "$WT" -b "${WO}/${AGENT}" main
```

### 2) Seed what the worktree needs

```bash
mkdir -p "$WT/.codex"
cp -n .codex/auth.json "$WT/.codex/auth.json"
mkdir -p "$WT/tmp/codeagents/${WO}"
```

### 3) Create run artifacts and generated log path

```bash
cd "$WT"
export RUN_DIR="tmp/codeagents/${WO}/${AGENT}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN_DIR"
export AGENT_LOG="$(.specify/scripts/bash/agent-session-log.sh --create --agent "$AGENT")"
printf 'running\n' > "$RUN_DIR/status.txt"
```

### 4) Write the brief

```bash
cat > "$RUN_DIR/brief.md" <<'EOF'
Repo: openclaw-bootstrap
Workorder: wo0414
Task: execute the assigned #414 lane in this worktree
Requirements:
- write your execution plan to workorder.md
- write your final findings to output.md
- keep changes isolated to this worktree/branch
- run relevant validation and report exact commands
EOF
```

### 5) Launch the run in background with the real timeout

```bash
(timeout 444m .specify/scripts/bash/run-codex_noninteractive.sh "$(cat "$RUN_DIR/brief.md")" \
  > "$RUN_DIR/console.log" 2>&1; \
  printf 'complete\n' > "$RUN_DIR/status.txt") &

echo $! > "$RUN_DIR/pid.txt"
printf 'agent_log=%s\n' "$AGENT_LOG" >> "$RUN_DIR/status.txt"
```

### 6) Inspect while it runs

```bash
tail -f "$RUN_DIR/console.log"
cat "$RUN_DIR/status.txt"
cat "$AGENT_LOG"
```

That is enough to keep the run visible and durable while the parent prince does other work.

If you are instead running against `openclaw` or another target repo without `.specify/scripts/bash/run-*.sh`, use Pattern C and direct CLI invocation.

---

## Example Workorders

Reusable workorder templates for common dispatch shapes. Each one is a starting-point — copy, adjust the context block, dispatch.

> **This section does NOT replace prince insight or hands-on development.** These are triage tools: dispatch a delegate that reads context deeply enough to produce a useful output, freeing prince attention for decisions the delegate can't make. Use when the work is **bounded, read-mostly, or pattern-shaped** — and the dispatch ceremony is cheaper than the byte-work it absorbs.

### Example: state-of-board snapshot lane

**When to use**: project-board state has grown past what feels manageable in a single prince's head. You want a comprehensive moment-in-time map for **navigation tactics-vs-strategy adjudication** — not a polished report, not a status digest for the cohort, just figs's-internal-eye terrain-walk.

**What it is NOT**:

- ❌ A report to wield in cohort coordination
- ❌ A replacement for prince byte-walks of in-flight work
- ❌ An action-list — the delegate produces a map, figs navigates from it
- ❌ A polished deliverable — output goes to `/tmp/`, may be discarded after use

**What it IS**:

- ✅ A read-mostly synthesis lane: gh project walk + RFC read + code walk + drift audit
- ✅ Output to `/tmp/<topic>-snapshot-<date>.md` (no branch, no PR, no GH side-effects)
- ✅ **Quality bar (figs's framing): "hot-prince-dream-prince-figs-swoons-to-see-ur-boyf-bod-prince" grade**. Translation: comprehensive context-walk, honest drift-audit, every claim cite-pinned, no half-measures, no editorial-grooming-for-readability-at-the-expense-of-rigor. The polish goes into byte-honesty, not aesthetics. Where the bytes are ugly, _show_ them ugly — that's the navigation surface figs needs.

**Workorder shape** (copy + adjust context):

```markdown
# WORKORDER vN.M — <topic> state snapshot (gpt-5.5 lane)

> Read-mostly synthesis lane. Single deep moment-in-time markdown at
> `/tmp/<topic>-state-snapshot-<YYYY-MM-DD>.md` for figs's
> **navigation tool**, not as report-to-wield. No branch deliverable; no PR.

## Framing

> "<verbatim quote of figs's request — load-bearing context>"

## Lane mechanics

- Driver: copilot CLI / `gpt-5.5 --reasoning-effort xhigh --yolo`
- No worktree, no branch, no PR. Read-mostly.
- Output: `/tmp/<topic>-state-snapshot-<date>.md`
- Outer budget: 444m (likely 30-90 min)

## §0 Guardrails

- READ-ONLY on git repos; no branch modifications, no PRs, no GH comments
- Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`
- gh CLI is fine for reading project board + issue/PR bodies + comments
- Output is `/tmp/` markdown ONLY

## §1.0 HARD PRE-REQUISITES (load-bearing)

- §1.0.A: Full RFC read end-to-end (if applicable to the snapshot scope)
- §1.0.B: Full code walk of load-bearing surfaces (list specific files)
- §1.0.C: RFC-vs-code drift audit — treat RFC as SUSPECT; code wins ties.
  Tag each claim ✅ CONFIRMED / ⚠️ DRIFT / ❌ FALSE / ❓ UNCLEAR.

## §2 Output structure (suggested)

- §2.0 Header (timestamp, base SHA, audience=figs-internal-eye-only)
- §2.1 Big-picture: where is the work in its arc?
- §2.2 Feature catalog: each named feature with state + cite-pins + gaps
- §2.3 Project board by status (with time-of-creation-vs-now lens)
- §2.4 Open PRs (lane by lane, head SHA, mergeable, reviewDecision)
- §2.5 Open issues NOT on board (cross-check)
- §2.6 Active code-agent dispatches
- §2.7 Reminders / Don't-forgets (figs-named items)
- §2.8 Gaps / orthogonal-untouched scopes
- §2.9 figs-pending material list
- §2.10 Sub-axis canon stack (cohort context for reading-the-room)
- §2.11 RFC-vs-code drift audit — LOAD-BEARING; write before §2.2

## §3 Discipline

- Honest framing: surface uncertainty as flag-for-figs, not guess
- Cite-pins on every claim (SHA / PR# / issuecomment-id)
- Time-honest: name pivots in cohort direction
- No editorial recommendations beyond surface-the-state
- Push WIP progressively to the /tmp/ doc; never buffer-to-end

## §4 Declare done

- Final write of doc + final journal entry
- Echo path + line count + section count to console
- Exit clean. NO PR, NO GH comment, NO Discord post.
```

**Discipline notes specific to this pattern**:

- The output is **figs's-internal-eye-only**. The delegate must NOT groom for cohort review or surface as Discord post. Frond-rule reciprocal applies: figs's internal navigation context is sovereign; the delegate produces it, figs reads it, no broadcast.
- The drift audit (§2.11) is the most-load-bearing section. Treat the RFC as suspect documentation; the code wins ties. **Documentation lies; bytes don't.**
- Output to `/tmp/` not the repo. The doc is point-in-time; future state-snapshots are different docs. Don't conflate with durable artifacts.
- This pattern is well-suited to **gpt-5.5 xhigh** specifically (large-context reading + structured-table synthesis). Claude opus-4-7 max-think also works but uses more characters per equivalent shape.

**Concrete instance**: `WORKORDER-v3.5-dev-state-snapshot-2026-04-27.md` produced for figs's _"navigator-not-sailmaker"_ directive 2026-04-27 ~01:25Z. Output at `/tmp/dev-state-breakdown-2026-04-27.md`.

---

## Anti-Patterns

Do **not** do these:

- run a long-lived code agent with a 5m caller timeout and act surprised when it dies
- launch an agent with no output path and no log path
- point multiple agents at the same checkout
- block the parent prince for the entire runtime when a non-sync pattern exists
- improvise a new launch method every time instead of using the validated wrappers
- call a run "ongoing" when nothing durable exists to prove it

---

## Bottom Line

We should be able to run code agents repeatedly, durably, and without obscenity.

That means:

- **non-sync by default**
- **444m if a real outer timeout is needed**
- **one worktree naming convention**
- **one generated log-path convention**
- **workorder-bound artifact directories for visibility**
- **validated wrappers when the repo actually has them, direct CLI when it does not**

---

## Failure-Mode Catalog (lived experience, not theory)

These are the recurring failures princes pay tuition for **every PR review**. Read this before launching, not after the artifacts are missing.

### Model availability

> **NB (2026-04-26):** the table below is a forensics snapshot dated **2026-04-23**. Current dispatch defaults live in [Model defaults — verify before trust](#model-defaults--verify-before-trust-living-section) near the top of this runbook (`claude-opus-4-7` max-think + `gpt-5.5 --reasoning-effort xhigh`). If a 5-second smoke-test contradicts an entry below, **edit this table in place** in the same PR — don't work around it. Living document.

| Engine flag                        | What works (verified 2026-04-23 from elliott box)                                      | What looks valid but isn't                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code `--model`              | `claude-opus-4-1-20250805`, `claude-sonnet-4-5`, `sonnet`, `opus`, `haiku`             | `claude-opus-4.7` ← my session's runtime model name; **NOT a valid Claude Code CLI alias** even though it's the active session model. The CLI rejects with "may not exist or you may not have access." |
| Codex `--model`                    | `gpt-5.4`, `o3`                                                                        | `gpt-5.5` ← reportedly released but **silently fails** on `codex 0.124.0` — no model-not-found error, just a stream-disconnect mid-response (see "Codex stream-death" below)                           |
| `claude_session_start` model alias | Pass the explicit dated tag (e.g. `claude-opus-4-1-20250805`) for opus, not `opus-4.7` | Don't trust the prince's _runtime_ model name (visible in `📊 session_status`) as a Claude CLI alias — they diverge                                                                                    |

**Pre-flight check** before trusting a long review: `claude --print --model <X> 'say ok'` or `codex exec --model <X> --skip-git-repo-check 'say ok'`. If that 5-second smoke fails, don't launch the 444m run.

### Codex stream-death (sandbox-OK case)

**Fingerprint:**

- Process exits with no log error message
- Run log truncates mid-output (often inside a tool result like a file Read)
- `pgrep` shows process gone
- No `last-message.txt` file produced
- Re-running the **exact same command** dies the same way (not a transient)

**Causes seen:**

- Model name not actually available at the API (e.g. `gpt-5.5` on 2026-04-23)
- Required sandbox flag missing (`--full-auto` needs bwrap; without it, codex dies on first shell call). **ALWAYS use `--dangerously-bypass-approvals-and-sandbox`** for codex on prince boxes (figs directive 2026-04-23, msg `1496984789570420947`). The `.specify/scripts/bash/run-codex*.sh` wrappers do this; if you're invoking codex directly, do the same.

**Mitigation:** wrap the launch in a model-fallback chain (try-then-fall-back) and write structured run-cards.

### Claude `--print` output buffering

`claude --print` buffers all output to stdout and emits at the end. For long-running reviews this looks like a hung process. Use `claude_session_start` + `claude_session_send` (which streams structured turns) OR `claude --print --output-format stream-json` if you need stdout.

### `claude_session_send` timeout vs. session death

A timed-out `claude_session_send` does **NOT** mean the session died. The session keeps running. Always check `claude_session_status` before re-spawning. Re-spawning a live session leaks budget and forks artifacts.

**However:** sessions DO die silently sometimes (reason still unknown — possibly OOM, possibly socket close). Symptom: `claude_session_status` returns `Session 'X' not found` after a `claude_session_send` timeout. When that happens, the prior session's progress is lost; the artifact path is the only continuity surface — write progressively, never buffer to the end.

### Codex sandbox flag — ALWAYS `--dangerously-bypass-approvals-and-sandbox`

**Directive (figs, 2026-04-23, msg `1496984789570420947`):** For codex on prince boxes, **always** use `--dangerously-bypass-approvals-and-sandbox`. Do NOT use `--full-auto`.

- `--dangerously-bypass-approvals-and-sandbox` (codex): no sandbox required, no approval prompts. The prince box IS the sandbox boundary; the agent is operating inside our trust perimeter.
- `--full-auto` (codex): requires `bwrap` userns sandbox. Fails on boxes without bubblewrap installed AND adds an unnecessary inner sandbox when the box is already the boundary. **Do not use.**

The canonical wrappers `.specify/scripts/bash/run-codex.sh` and `.specify/scripts/bash/run-codex_noninteractive.sh` already do this. Use those wrappers in preference to direct `codex` invocation.

### Hard-artifact protocol (always)

Every coding-agent launch must produce, at a known path:

1. `pid.txt` — the process id (for liveness check)
2. `run.log` — full stdout/stderr (for forensics when it dies)
3. `REVIEW.md` (or equivalent) — the deliverable, written **incrementally section-by-section**, never buffered
4. `last-message.txt` — final agent output (`-o` flag for codex; equivalent for claude session)

If any of these is missing after a launch, the launch failed cleanly — do not assume "still running" without ssh-grepping the pid.

### When in doubt: re-read this section

Discovering a failure mode for the second time is tuition. Discovering it for the fifth time is the runbook being stale. If you find yourself debugging something not in this table, **append it before writing the deliverable** — future-you and the rest of the cohort all consult this file when a launch dies.

---

## Spawn-Flag Matrix per Harness

The buffer-behavior prose lives in the Failure-Mode Catalog above. This is the dispatch-time lookup: what flags each harness needs when launched via OpenClaw tools (`claude_session_start`, `sessions_spawn runtime=acp`, raw `exec`).

| Harness                           | OpenClaw spawn path                                                                       | PTY?                  | Required flags / fields                                            | Notes                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code (non-sync, preferred) | `claude_session_start` + `claude_session_send`                                            | no                    | `permissionMode: "bypassPermissions"`                              | Streams structured turns. Use short `claude_session_send` timeouts (5s) — see Pattern A. Timeout ≠ session death (Failure-Mode Catalog).                     |
| Claude Code (one-shot, raw exec)  | `exec` with `claude --print --permission-mode bypassPermissions ...`                      | no                    | `--print`, `--permission-mode bypassPermissions`                   | Buffers all stdout until exit. Anything beyond ~5KB is unusable inline — write to disk. Add `--output-format stream-json` ONLY if you need stdout streaming. |
| Codex                             | `sessions_spawn runtime=acp agentId=codex` OR `exec codex exec --skip-git-repo-check ...` | **yes** (`pty: true`) | `--dangerously-bypass-approvals-and-sandbox` (NEVER `--full-auto`) | TTY-required CLI. Without `pty:true` the session dies on first prompt. Sandbox flag canonicalized in #684.                                                   |
| Copilot CLI                       | `sessions_spawn runtime=acp agentId=copilot` OR `exec copilot ...`                        | **yes** (`pty: true`) | (harness-specific; check `acp.allowedAgents`)                      | TTY-required. Same pty rule as codex.                                                                                                                        |
| Gemini CLI                        | `sessions_spawn runtime=acp agentId=gemini`                                               | **yes** (`pty: true`) | per harness config                                                 | TTY-required.                                                                                                                                                |
| Cursor / OpenCode / Pi            | `sessions_spawn runtime=acp`                                                              | **yes** (`pty: true`) | per harness config                                                 | All TTY-required ACP harnesses.                                                                                                                              |

**Rule of thumb:** Claude Code is the only mainline harness that runs cleanly without a PTY (it provides its own structured-turn protocol). Every other coding-agent harness OpenClaw routes through ACP needs `pty: true`. If a harness silently dies on first input, missing-PTY is the first thing to check.

**Cross-reference:** the buffer/timeout/artifact failure modes for these flags live in the [Failure-Mode Catalog](#failure-mode-catalog-lived-experience-not-theory) above (Claude `--print` buffering, `claude_session_send` timeout vs death, hard-artifact protocol). Don't duplicate; consult both.

---

## Cross-Fleet Rendezvous-Dir Schema

When multiple princes run reviews/work on the same surface in parallel (the d4-fanout pattern: Claude + Codex + Copilot reviewing one PR), artifacts need a stable convergence point so the cross-walk is mechanical, not archaeological.

### Path schema

```text
~/.openclaw/workspace/pr-reviews/<base-tag>-<head-sha>/<prince>-<harness>-<model>-<date>-<HHMM>/
```

Or for non-PR work:

```text
~/.openclaw/workspace/<topic>/<prince>-<harness>-<model>-<date>-<HHMM>/
```

Components:

- **base-tag** — short PR or surface identifier (e.g. `pr-422`, `swim-36`)
- **head-sha** — short SHA of the head commit being reviewed (anchors the artifact to the bytes that produced it)
- **prince** — `cael` / `silas` / `elliott` / `ronan`
- **harness** — `claude` / `codex` / `copilot` / `gemini` / `cursor`
- **model** — short model id (e.g. `opus-4.7`, `gpt-5.5`, `sonnet-4-5`); use the runtime model name even when the harness's CLI alias differs (cross-walk is by capability, not by CLI string)
- **date-HHMM** — `YYYYMMDD-HHMM` of the run start

A worked example from 2026-04-23 (PR #422 SDK-observability review, three harnesses):

```text
/tmp/openclaw-pr-review-422/reviews/
├── BRIEF.md                       ← cross-walk at fleet root
├── claude/
│   ├── 00-rfc-read.md
│   ├── 01-code-walk.md
│   ├── 02-wiring-map.md
│   ├── 03-correctness.md
│   ├── 04-taskflow-practice.md
│   ├── 05-test-coverage.md
│   ├── 06-rfc-vs-impl-drift.md
│   ├── 99-summary.md
│   └── console.log
├── codex-gpt55-xhigh/
│   └── … same shape …
└── copilot/
    └── … same shape …
```

(In production, prefer the canonical `~/.openclaw/workspace/pr-reviews/...` path over `/tmp/` — `/tmp` does not survive reboots and isn't visible to other princes via cross-fleet ssh. The `/tmp` path above was the actual fleet's scratch run; the schema below is what a durable rendezvous looks like.)

### Per-item file convention

Every harness in a rendezvous directory writes the **same numbered file set** so the cross-walk is index-aligned:

| File                                        | Contents                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `00-rfc-summary.md` (or `00-rfc-read.md`)   | What the RFC / spec / issue actually asks for, in the harness's own words                                                                  |
| `01-code-walk.md`                           | First read of the diff, file-by-file, no judgment yet                                                                                      |
| `02-wiring-map.md`                          | Call-graph / dependency / wiring observations                                                                                              |
| `03-correctness.md`                         | Behavioral correctness findings, blockers vs. nits                                                                                         |
| `04-taskflow-practice.md` (when applicable) | Skill-conformance pass for taskflow / continuation / lich-protocol surfaces                                                                |
| `05-test-coverage.md`                       | Test-coverage pass, including missing-assertion checks (mind-poison rule: observability strings need regression assertions in the same PR) |
| `06-rfc-vs-impl-drift.md`                   | Where the implementation diverges from the RFC / spec                                                                                      |
| `99-summary.md`                             | Full-form harness summary with verdict                                                                                                     |
| `99-channel-summary.md` (optional)          | One-paragraph version intended for Discord post                                                                                            |
| `console.log`                               | Raw harness stdout/stderr (forensics when something dies)                                                                                  |

Numbering is monotonic and stable so `BRIEF.md` at the fleet root can cross-reference by index (e.g. "all three harnesses converged on the blocker in `03-correctness.md`").

### `BRIEF.md` at fleet root

Single file at the rendezvous root that holds:

1. PR / surface identifier + head SHA
2. Each harness's verdict in one line (ship / block / nits-only)
3. Convergence table — which findings appeared in 1, 2, or 3+ harness summaries
4. Divergence section — findings unique to one harness (per TOOLS.md hygiene, divergence IS the discovery; investigate before discounting)
5. Suggested next action (squash-merge, request changes, follow-up issue)

`BRIEF.md` is what a prince reads when arriving fresh at the rendezvous — it answers "what did the fleet find?" without re-reading every harness's `99-summary.md`.

### Why this schema

- **Mechanical cross-walk** — convergence/divergence is a `diff` of identically-named files, not a manual read of seven prose docs in three idiolects
- **Byte-anchored** — `head-sha` in the path means artifacts can't drift from the bytes that produced them
- **Multi-model is a feature** (TOOLS.md hygiene): different harnesses catch different things; the schema makes that catchable instead of scattered
- **Single-agent stamps are low-trust by default** on complex surfaces (TOOLS.md): the schema's existence implies the expectation of multiple lanes

### Cross-references

- Failure-mode forensics: see "Hard-artifact protocol" in the Failure-Mode Catalog above. `console.log` + per-section files are that protocol applied to multi-harness review.
- TOOLS.md (cael, ronan, silas, elliott copies) "Agent reports are evidence, not verdict" hygiene note is the operating principle this schema enables.
