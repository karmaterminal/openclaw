# WORKORDER — #999 forceSenderIsOwnerFalse cleanse (back-merge + drop)

> **Lane:** `cael/999-forcesender-cleanse` · **Issue:** `karmaterminal/openclaw#1001`
> **Author of spec:** Cael (source-verifier). **Fleshed to full workorder:** 2026-06-13.
> **Driver:** copilot CLI `gpt-5.5 --reasoning-effort xhigh --yolo`, tmux `oc-cael-999`, 444m.

---

## §0 — Identity, scope, and the bytes you are operating on

You are a code-agent dispatched to perform the **back-merge + `forceSenderIsOwnerFalse` cleanse** as ONE coherent change. The result: the fork's `frond-scribe/20260613/assembly-drift-cure` branch aligned with upstream's current (stronger) trust model, with the dead `forceSenderIsOwnerFalse` flag fully removed.

**Coordinates (byte-confirmed at dispatch time):**

| Thing                 | Value                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Worktree**          | `/tmp/oc-999-wt` (you are already here; one agent, one worktree)                                   |
| **Work branch**       | `cael/20260613/999-forcesender-cleanse` (already created off base + pushed remote-first to origin) |
| **Base branch**       | `frond-scribe/20260613/assembly-drift-cure` @ `599f7ba0c97556c23d1707a378f9bebc3a7f05f1`           |
| **Back-merge source** | `upstream/main` @ `13a079b3f8462ac4689eb944a5aebf33a2adee8c` (already fetched)                     |
| **Tracking issue**    | `karmaterminal/openclaw#1001` — update at meaningful checkpoints                                   |
| **Journal**           | `tmp-drop-me-copilot.md` at worktree root — commit + push at every checkpoint                      |
| **Outer budget**      | 444m                                                                                               |

`git remote -v`: `origin` = `karmaterminal/openclaw` (push as `cael-dandelion-cult`), `upstream` = `openclaw/openclaw` (fetch-only).

### §0.0 — HARD GUARDRAILS (read twice, non-negotiable)

1. **Target ONLY the assembly branch** `frond-scribe/20260613/assembly-drift-cure`. The PR you open MUST have `base = frond-scribe/20260613/assembly-drift-cure`.
2. **NEVER touch the presentation branch** `frond-scribe-claude/20260509/narrow-surgery-tight`. Do not check it out, merge it, push to it, or target it.
3. **DO NOT MERGE anything.** Your job ends at "PR opened + openclaw-ci dispatched." The cohort byte-walks before any merge. No `gh pr merge`, no admin-merge, no fast-forward.
4. **DO NOT force-push.** First push happened at minute-0; subsequent pushes are append-only checkpoints. No `git push --force`, no rebase that rewrites pushed history.
5. **Stay inside this worktree.** All git ops scoped to `/tmp/oc-999-wt`. Do not operate on `/home/figs/flesh_beast_tmp/openclaw` (the main checkout) or any other tree.
6. **Never read/write/list/shell into `/home/figs/flesh_beast_tmp/`** beyond this worktree's own path.

### §0a — Remote-first push discipline (load-bearing)

The branch was pushed to origin at minute-0 (before any byte-work). Going forward:

- **Checkpoint pushes** at every meaningful gate — every transition that means "I just produced something inspectable":
  - after the merge + conflict-resolution is committed
  - after the grep-gate hunt removes the invisible vestiges
  - after each `pnpm tsgo` / `pnpm lint` / `pnpm test` green
  - on any exit-condition (success, blocker, ambiguity-stop)
- If you spend >10 min on a single thought without a checkpoint, push current state with a `WIP:` prefix.
- Recipe:
  ```bash
  git add -A && git commit -m "WIP: <one-line>" && git push origin cael/20260613/999-forcesender-cleanse
  ```

### §0b — GH-issue update discipline (the 5 mandatory moments)

Comment on `karmaterminal/openclaw#1001` via `gh issue comment 1001 -R karmaterminal/openclaw --body '...'` at:

1. **After §1 reads complete** — scope understood, starting the merge.
2. **After the merge + 4-conflict resolution committed** — branch SHA + which conflicts resolved how.
3. **After the grep-gate hits 0** — branch SHA + count of vestige callsites removed + test expectation updates.
4. **On any blocker / ambiguity / hard-stop** — the shape of the open question (do NOT guess; surface it).
5. **On declare-done** — PR link + final SHA + openclaw-ci run id + "cohort byte-walk needed" flag.

Comment cadence != push cadence. Comments are cohort-readability; a prince scanning the issue should reconstruct progress without `git fetch`.

### §0c — Webhook heartbeat (cohort-visible companion to checkpoint pushes)

Resolve once at session start:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/caels-petals-fall --json name,value --jq '.[]|select(.name=="WEBHOOK_SCRIBE_NOTIFY")|.value')
```

Fire after each meaningful checkpoint (override `username` so cohort can filter):

```bash
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"cael-999-cleanse-hook\",\"content\":\"cael-999-cleanse: <one-line status>\"}" \
  "$WEBHOOK"
```

Fire at: §1-reads-done, merge+resolution-done, grep-gate=0, each gate-green, any `DESIGN-BREAK:`, declare-done.

---

## §1 — Read before you touch (HARD pre-requisites)

Do these reads FIRST. Do not start the merge until you have walked the bytes.

### §1.0.A — Understand the trust-model change (the WHY)

Read on **`upstream/main`** (the target shape) and compare to the **base branch** (current shape):

```bash
git show upstream/main:src/infra/system-events.ts
git show origin/frond-scribe/20260613/assembly-drift-cure:src/infra/system-events.ts
git show upstream/main:src/auto-reply/reply/session-system-events.ts
git show origin/frond-scribe/20260613/assembly-drift-cure:src/auto-reply/reply/session-system-events.ts
```

**The byte-true resolution (Cael source-verified — internalize this):**

- Upstream **DELETED** `forceSenderIsOwnerFalse` entirely (`git grep -c forceSenderIsOwnerFalse upstream/main` = 0).
- Upstream's anti-spoof property is **PRESERVED AND STRENGTHENED**: `enqueueSystemEvent` now runs `sanitizeInboundSystemTags(text)` **UNCONDITIONALLY** (`src/infra/system-events.ts` ~line 110: `const cleaned = sanitizeInboundSystemTags(text).trim();`). This **replaced** our #858 _conditional_ (`resolveEventOwnerDowngrade(options) ? sanitize : text`) with _always-sanitize_. Strictly stronger; covers a superset of the old conditional's cases.
- **`deliveryContext` is NOT where the trust property lives.** It's upstream's separate delivery-routing model. **DO NOT** frame the cleanse as "migrate to deliveryContext." Explicit anti-goal (§8).
- Continuation's events pass `trusted:true` with plain status text. The unconditional sanitize is a **verified no-op** on them — it only neutralizes spoofed `[System]` / `System:` markers, which continuation never emits. So the drop is **clean, zero behavioral delta**.

### §1.0.B — Walk the 36-file vestige surface

```bash
git grep -n forceSenderIsOwnerFalse origin/frond-scribe/20260613/assembly-drift-cure -- 'src/**/*.ts' 'extensions/**/*.ts'
```

Expect **36 files**. Breakdown (Cael's verification):

- **31 extension callsites** across: discord, imessage, matrix, mattermost, msteams, signal, slack, telegram, whatsapp — each passes `forceSenderIsOwnerFalse` to `enqueueSystemEvent`.
- **Core:** `src/infra/system-events.ts` + `src/infra/system-events.test.ts`
- **Core:** `src/auto-reply/reply/session-system-events.ts` + `src/auto-reply/reply/session-system-events.test.ts`
- **Test:** `src/auto-reply/reply/get-reply-run.media-only.test.ts`

For each extension callsite: removing the flag means the callsite simply **stops passing it** to `enqueueSystemEvent`. Events sanitize unconditionally regardless, so behavior is preserved.

### §1.0.C — Confirm the continuation emit-sites are no-op-safe

Verify continuation's emit-sites never emit `[System]`/`System:` markers, so the unconditional sanitize is a no-op on them:

```bash
git grep -nE '\[System\]|System:' -- src/agents/command/work-dispatch.ts src/agents/command/delegate-dispatch.ts src/agents/embedded-agent-runner src/auto-reply/reply/followup-runner.ts 2>/dev/null || echo "(none — confirms no-op)"
```

Record the finding in the journal. If a continuation emit-site DOES emit a spoof-marker (it should not), STOP and surface it as a `DESIGN-BREAK:` — that would be the one case where the drop is not a no-op.

### §1 checkpoint

Comment on #1001 ("§1 reads done, scope understood, starting merge"), journal it, fire the webhook.

---

## §2 — Plan (what you intend to do, in order)

1. **Back-merge:** `git merge upstream/main` in the worktree.
2. **Resolve the 4 conflicts** (§3) — 3 keep-both + 1 toward-upstream.
3. **Commit the merge.**
4. **Run the grep-gate** (§4) — the invisible vestige hunt. The step the merge does NOT do for you.
5. **Remove every remaining `forceSenderIsOwnerFalse` reference** across the 36 files; update `.test` expectations to upstream's unconditional-sanitize behavior.
6. **Drop the deprecated `trusted?` legacy alias** IF upstream removed it (§5).
7. **Gates** (§6): tsgo:core + tsgo:test + tsgo:extensions + lint + (full `pnpm test` if feasible).
8. **Open PR** into the assembly branch (§7); dispatch openclaw-ci.
9. **Declare done** (§9).

Write this plan (with refinements from your §1 reads) into the journal before starting §3.

---

## §3 — The merge + the 4 conflicts (byte-true resolution)

```bash
cd /tmp/oc-999-wt
git merge upstream/main
# expect: CONFLICT in 4 files
git status --short | grep '^UU'
```

### The 4 conflicts:

**3 keep-both** — continuation feature (ours) + upstream additions, NO upstream-deletion collision (integrate both sides):

1. `src/agents/embedded-agent-runner/run/params.ts`
2. `src/auto-reply/reply/followup-runner.ts`
3. `src/agents/command/attempt-execution.ts`

For these three: conflict is continuation-feature-code (ours) vs upstream-evolution (theirs) in the same region. Neither side deleted what the other added. **Keep both** — integrate continuation logic with upstream's new structure. Read both sides carefully; do not blindly accept one side. The continuation feature (work-dispatch / delegate-dispatch / context-pressure / post-compaction / subagent-announce hooks) MUST survive.

**1 toward-upstream** — `src/auto-reply/reply/session-system-events.ts`:

4. Take **upstream's structure**, **DROP the `forceSenderIsOwnerFalse` vestige**, **preserve continuation's `drainFormattedSystemEvents` logic**.
   - Cael/Rune's byte: this conflict was ~**9 continuation lines + 5 vestige lines**. **Keep the 9** (`drainFormattedSystemEvents`), **drop the 5** (the `forceSenderIsOwnerFalse` vestige).
   - Resolved file: upstream's always-sanitize `enqueueSystemEvent` shape + continuation's drain logic, zero `forceSenderIsOwnerFalse`.

### After resolution:

```bash
git add -A
git commit --no-edit
git push origin cael/20260613/999-forcesender-cleanse
```

### §3 checkpoint

Comment on #1001 (branch SHA + the 4 conflicts resolved how), journal, webhook.

---

## §4 — The grep-gate (CRITICAL — the invisible vestige hunt)

**This is the step the merge does NOT do for you.** The `forceSenderIsOwnerFalse` callsites NOT in a conflict region **auto-merge INVISIBLY as "keep-ours"** — they do not show as conflicts, but they are still there, still dead, still referencing the deleted flag.

```bash
git grep -c forceSenderIsOwnerFalse -- 'src/**/*.ts' 'extensions/**/*.ts'
```

**This MUST equal 0 before you can declare done.** It is the hard check.

Hunt and remove every remaining reference across the 36 files:

- **Extension callsites (31):** each simply stops passing `forceSenderIsOwnerFalse` to `enqueueSystemEvent`. The call becomes `enqueueSystemEvent({ ...other args... })` without the flag. Match upstream's call shape exactly.
- **`src/infra/system-events.ts`:** ensure the `SystemEvent` type + `enqueueSystemEvent` signature match upstream's current shape exactly — no `forceSenderIsOwnerFalse` parameter, unconditional `sanitizeInboundSystemTags`.
- **`src/auto-reply/reply/session-system-events.ts`:** handled in §3, but re-verify grep=0 here.
- **`.test` files** (`system-events.test.ts`, `session-system-events.test.ts`, `get-reply-run.media-only.test.ts`): **update expectations to match upstream's unconditional-sanitize behavior.** Tests that asserted the conditional (`forceSenderIsOwnerFalse ? sanitized : raw`) must now assert always-sanitized. Mirror upstream's own test expectations (`git show upstream/main:src/infra/system-events.test.ts`).

### Re-verify after the hunt:

```bash
git grep -c forceSenderIsOwnerFalse -- 'src/**/*.ts' 'extensions/**/*.ts'   # MUST be 0
git grep -n forceSenderIsOwnerFalse                                          # belt-and-suspenders: 0 anywhere
git add -A && git commit -m "drop forceSenderIsOwnerFalse vestige (grep-gate=0)" && git push origin cael/20260613/999-forcesender-cleanse
```

### §4 checkpoint

Comment on #1001 (grep-gate=0 confirmed, N callsites removed, test expectations updated), journal, webhook.

---

## §5 — Deprecated `trusted?` legacy alias (conditional)

Check upstream's current `SystemEvent` type:

```bash
git show upstream/main:src/infra/system-events.ts | grep -nA3 'trusted'
```

- **IF** upstream **removed** the deprecated `trusted?: boolean` legacy alias → remove it here too, to match upstream exactly. Do not keep a deprecated field upstream deleted.
- **IF** upstream still has it → leave it. Match upstream's shape exactly, whichever way it goes.

Record the decision (kept / dropped + why) in the journal and as a #1001 comment.

---

## §6 — Gates (NOT a subset)

Run from `/tmp/oc-999-wt`. **All must be green.** If a gate fails, fix-forward and re-run; do not declare done on red.

```bash
pnpm tsgo:core
pnpm tsgo:test
pnpm tsgo:extensions
pnpm lint
```

**Full suite if feasible** (the runbook's "not a subset" binding-directive — full `pnpm test` is the honest signal, NOT `pnpm exec vitest run`, NOT a hand-picked subset):

```bash
pnpm test    # full fan-out via scripts/test-projects.mjs; ~80 shards
# If OOM mid-suite:  OPENCLAW_VITEST_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=12288 pnpm test
```

**At minimum, tsgo (core+test+extensions) + lint MUST be clean** before PR. Capture exit codes + per-shard pass/fail tallies into the journal. For any failing test, classify as (a) cure-cycle-introduced, (b) cure-cycle-pre-existing, or (c) unrelated baseline-drift — surface (a) as a blocker to fix before declare-done.

**Cache note:** if a tsgo gate passes locally but you suspect stale incremental cache: `rm -rf .artifacts/tsgo-cache/ && pnpm tsgo:test`.

### §6 checkpoint

Push after each gate green; comment on #1001 with gate results; webhook.

---

## §7 — Open the PR (into the assembly branch) + dispatch CI

```bash
# PR base MUST be the assembly branch — NOT main, NOT the presentation branch:
gh pr create -R karmaterminal/openclaw \
  --base frond-scribe/20260613/assembly-drift-cure \
  --head cael/20260613/999-forcesender-cleanse \
  --title '#999: back-merge upstream/main + drop forceSenderIsOwnerFalse vestige' \
  --body-file /tmp/oc-999-wt/PR-BODY.md
```

Write `PR-BODY.md` first with: the drop-and-rely framing, the 4-conflict resolution summary, grep-gate=0 receipt, test-expectation updates, zero-behavioral-delta note, gate results, `Tracking: karmaterminal/openclaw#1001`, and the bold **"Targets the ASSEMBLY branch only — cohort byte-walks before merge. Do NOT merge without cohort review."**

Verify base landed (`gh pr edit` silently fails on base; use the API if needed):

```bash
gh pr view <PR#> -R karmaterminal/openclaw --json baseRefName,headRefName
# if base is wrong:  gh api -X PATCH repos/karmaterminal/openclaw/pulls/<PR#> -f base=frond-scribe/20260613/assembly-drift-cure
```

**Dispatch openclaw-ci** (fork has no auto-trigger) against the PR head SHA:

```bash
gh api repos/karmaterminal/openclaw-bootstrap/dispatches -f event_type=openclaw-ci -F client_payload[ref]=$(git rev-parse HEAD)
# POST returns empty stdout = HTTP 204 = success; do NOT retry on empty output.
```

---

## §8 — Anti-goals (DO NOT)

- **DO NOT** migrate the anti-spoof to `deliveryContext` (it's not where the trust property lives).
- **DO NOT** re-express / re-implement the per-event guard (upstream's unconditional sanitize already covers it — strictly stronger).
- **DO NOT** leave ANY `forceSenderIsOwnerFalse` reference (grep-gate=0 is the hard check; it auto-merges invisibly so it MUST be explicitly hunted).
- **DO NOT** touch the presentation branch `frond-scribe-claude/20260509/narrow-surgery-tight`.
- **DO NOT** target the PR at `main` or the presentation branch — base MUST be `frond-scribe/20260613/assembly-drift-cure`.
- **DO NOT** merge anything. **DO NOT** force-push. **DO NOT** rebase pushed history.
- **DO NOT** delete continuation feature code in the keep-both conflicts. The continuation hooks MUST survive.
- **DO NOT** declare done on a red gate or a failing grep-gate.
- **DO NOT** post to Discord beyond the webhook heartbeat (the dispatching prince owns the Discord channel surface).

---

## §9 — Declare done

When complete:

1. Final journal entry: final SHA, grep-gate=0 confirmation, gate results (exact commands + pass/fail tallies), PR URL, openclaw-ci run id.
2. Comment on #1001: PR link + final SHA + openclaw-ci run id + **"cohort byte-walk needed before merge"** flag.
3. Final webhook heartbeat: declare-done one-liner with PR URL.
4. Echo to console: PR URL, final SHA, grep-gate result, gate summary.
5. **Exit clean. NO merge. NO Discord post beyond webhook.** The lane ends at "PR opened, base-verified, openclaw-ci dispatched, cohort-quorum-needed."

---

## §10 — If you block

If any step blocks (merge produces unexpected conflicts beyond the 4; a gate fails in a way you can't fix-forward; grep-gate won't reach 0 because of an ambiguous callsite; PR base won't set; auth fails), **STOP and surface the blocker clearly** — journal it, comment on #1001 with the exact error + what you tried, fire a `DESIGN-BREAK:` webhook. Do NOT fabricate success. Do NOT merge to "get unblocked." The dispatching prince (Cael) is steerable via `tmux send-keys -t oc-cael-999:0 '<message>'` and will course-correct.
