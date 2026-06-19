# AGENT BRIEF — Lane: claude / fix karmaterminal/openclaw#1044 (delegate-child self-continue)

You are a code-agent dispatched by 🌻 Elliott to fix **karmaterminal/openclaw#1044**:
a `continue_delegate` child cannot self-continue via `continue_work` — BOTH the
bracket-token form (`[[CONTINUE_WORK]]` / `CONTINUE_WORK:N`) AND the
`continue_work()` tool form. The delegate one-shot path works; the
**self-continue hop-2 from the child** is the regression.

figs (the feature owner) settled the intent: _"a continue_delegate child is a
session like any other and should self-continue."_ His fix direction: **wire the
token path to the tool path** — the token-form WORK bracket should DRIVE a hop-2
turn of the delegate-child session, not be ignored.

## YOUR ENVIRONMENT (already set up for you)

- **Worktree (you are here):** `/home/figs/flesh_beast_tmp/oc-1044-claude` — work ONLY here, never another checkout.
- **Branch:** `elliott/20260618/1044-self-continue-claude` (already created off the assembly tip + pushed to origin remote-first).
- **Base:** `frond-scribe/20260613/assembly-drift-cure` @ `8cafdcd2a9d2d1a0734324dfc016e6e46fe831e6`.
- **Tracking issue:** `karmaterminal/openclaw#1048` — comment at the 4 mandatory moments (below). This is the cohort read-surface.
- **Full fix-spec workorder:** `./WORKORDER-1044.md` (in this worktree) — READ IT FIRST, end to end. It is the load-bearing input.
- **node_modules:** already installed (shared pnpm store). `pnpm --version` = 11.2.2.
- **gh auth:** `elliott-dandelion-cult` is active. Use it for issue comments + PR.
- A sibling lane (`-copilot`, gpt-5.5) is implementing the SAME fix-spec independently in a different worktree. Neither lane is canonical over the other; 🌻 picks best-of after byte-walking both. Do NOT reference or touch the sibling's branch/worktree.

## STEP 0 — READ FIRST

1. `cat ./WORKORDER-1044.md` — the full byte-true fix-spec (two legs, which-layer caveat, regression bracket, plan). Read all of it.
2. Then byte-walk the anchors yourself before touching anything.

## BYTE-TRUE ANCHORS (verified by 🌻 on the assembly tip — confirm, don't trust blind)

### Leg A — TOKEN form: THREE surfaces (byte-verified — re-read WORKORDER-1044.md Leg A for the authoritative version)

**The token leg is THREE distinct surfaces, not one:**

- **A1 — bracket `[[CONTINUE_WORK:N]]`** = VOID / by-design. There is NO bracket-WORK parser; `src/auto-reply/tokens.ts:490` (`delegateMatch`) only matches `[[CONTINUE_DELEGATE: …]]`. Default assumption: bracket-work is NOT a supported surface (bare + tool are). Do NOT add a bracket-work parser unless the repro/figs intent implies it should parse — if you think it should, FLAG it in your journal + issue comment rather than silently adding it.
- **A2 — bare `CONTINUE_WORK` / `CONTINUE_WORK:N`** = parsed `kind:"work"` at `tokens.ts:539` (`workMatch`), THEN declined in subagent at `subagent-announce.ts:~977`. **THIS is the surface figs's "wire the token to the tool path" most directly targets** — route the parsed work-signal to the hop-2-execution path instead of the `:977` ignore.
- **A3 / Leg B — tool `continue_work()`** = wake/reap layer (covered in Leg B below; which-layer empirically-open, the RED repro is the arbiter).

The `:977` ignore (the A2 drop point):

- `src/agents/subagent-announce.ts` ~line 976-977:
  ```
  if (continuationResult.signal?.kind === "work") {
    defaultRuntime.log(`[subagent-chain-hop] CONTINUE_WORK not supported in sub-agent chain (from ${params.childSessionKey}), ignoring`);
  } else if (continuationResult.signal?.kind === "delegate") {
    ... spawnSubagentDirect([continuation:chain-hop]) ...   // THIS sibling works
  }
  ```
- The WORK bracket from a delegate-child is dropped at the `:977` ignore; hop-2 never schedules.
- **Fix direction (figs's):** wire the WORK-kind bracket from a delegate-child to
  drive a hop-2 TURN of the delegate-child session — the SAME hop-2 execution path
  the tool form uses. Do NOT just route it to the delegate chain-hop
  (`spawnSubagentDirect`) — that's a different semantic (continue_work = "same
  session, next turn"; continue_delegate = "spawn a child"). It must be a hop-2
  turn of the child's OWN session.

### Leg B — TOOL form accepted but hop-2 never executes

- The `continue_work()` tool returns `status: scheduled` (accepts + arms the next
  hop) but **hop-2 never runs**. (#1044 start-state byte: HOP1 ran twice, HOP2 zero
  times.) The tool form bypasses `:977` cleanly and dies LATER at the wake/reap layer.
- **WHICH-LAYER IS EMPIRICALLY OPEN — DO NOT PRE-SEAL.** Candidates:
  1. `src/auto-reply/continuation/work-dispatch.ts` — the #990 bucket-1
     confident-terminal **orphan-reap** in the busy-skip branch
     (`bucket1ReapVerdict` reaps "only confident-terminal" orphans; the
     should-rehydrate delegate-child gets marked confident-terminal and reaped); OR
  2. `src/infra/heartbeat-cooldown.ts` — the **flood-defer** (≥5 runs/60s → defer:flood).
  - **THE REPRO TEST (step 1 below) IS THE ARBITER.** Let it prove which layer fires. Do NOT assume.

### Regression bracket (for localizing leg B)

- Worked on `2807efc`, broke on `a179`. Prime suspect: `c7c54adf1c` (Jun 11,
  "#990 design-pass — bucket-1 orphan-reap + locus-3 durable-mark + tunables").
  If useful, bisect `2807efc..a179` on the dispatch/wake surface
  (`work-dispatch.ts`, `subagent-registry*.ts`, `heartbeat-cooldown.ts`,
  `delegate-dispatch.ts`) to pin the exact breaking commit + confirm the layer.

## THE PLAN (per #1044, figs-approved) — execute in order

1. **REPRO FIRST as a RED gate.** Write a deterministic test that fires a
   `continue_delegate` child which self-continues via `continue_work`, and asserts
   **hop-2 EXECUTES** (e.g. a HOP2 marker is written / a hop-2 turn ran). Cover
   **BOTH forms** — bracket token AND tool. Confirm it currently **FAILS** (HOP2
   absent) on this branch. This RED test is the arbiter for leg-B's which-layer.
   - Look at existing tests for the harness/shape:
     `src/agents/subagent-announce.continuation*.test.ts`,
     `src/auto-reply/continuation/work-dispatch.test.ts`,
     `src/auto-reply/continuation/delegate-dispatch.test.ts`. Match their style.
2. **LOCALIZE.** Use the RED repro + (optionally) the bisect bracket to confirm
   which layer kills leg B, and confirm leg A is the `:977` ignore.
3. **FIX BOTH legs** so hop-2 actually executes:
   - Leg A: wire the **bare `CONTINUE_WORK` (A2)** work-signal from a delegate-child
     to drive a hop-2 turn (the tool path), not the `:977` ignore. (A1 bracket-work
     is by-design VOID — do not add a bracket parser unless intent says otherwise; flag if so.)
   - Leg B: stop the wake/reap layer from culling the should-rehydrate
     delegate-child's own-turn continue_work flow.
   - **PRESERVE the legitimate guards** — the #990 reaper exists to cull
     genuinely-orphaned runs (Pillar-0 "never wrongful-reap"); the flood-guard
     stops runaway loops. Fix ONLY the false-positive on the self-continue path
     WITHOUT removing the guard's real protection. Do not gut the guard.
4. **GREEN gate.** The repro from step 1 flips to passing (hop-2 executes, both
   forms). Finalize/invert the assertion so it's a real regression guard.
5. **LAND** on this assembly branch. PR base = `frond-scribe/20260613/assembly-drift-cure`,
   with `Closes #1044`.

## SCOPE GUARDRAILS (hard)

- Touch ONLY: `src/agents/subagent-announce.ts`,
  `src/auto-reply/continuation/work-dispatch.ts`, `src/infra/heartbeat-cooldown.ts`,
  `src/auto-reply/continuation/delegate-dispatch.ts`, `src/agents/subagent-registry*.ts`
  as needed, plus your new repro test file.
- Do NOT touch pr-presentation. Do NOT broaden into unrelated drift.
- If you hit substantive design ambiguity you cannot resolve from the spec (esp.
  leg-B which-layer if the repro is inconclusive), write it to your journal +
  comment the tracking issue and proceed with your best byte-grounded judgment;
  do not silently guess past genuine ambiguity.

## GATES before declare-done (run ALL locally — runbook Pre-Push Gate Set)

- `pnpm tsgo:core` · `pnpm tsgo:test` · `pnpm tsgo:extensions`
- `pnpm lint` · `pnpm lint:extensions:bundled`
- The continuation suite + your new repro test green. Run a single file via:
  `node scripts/run-vitest.mjs run <path/to/test-file>`
  (full suite if time: `NODE_OPTIONS=--max-old-space-size=12288 pnpm exec vitest run`).
- Cross-repo CI: dispatch from bootstrap on your PR head SHA:
  `gh api repos/karmaterminal/openclaw-bootstrap/dispatches -f event_type=openclaw-ci -F client_payload[ref]=<your-head-sha>`

## VISIBILITY (runbook remote-first canon — MANDATORY)

- **Journal:** append to `tmp-drop-me-claude.md` at worktree root at every checkpoint, then commit + push:
  ```
  echo "- $(date -uIseconds): <what just happened>" >> tmp-drop-me-claude.md
  git add -A && git -c user.name='elliott-dandelion-cult' -c user.email='elliott@dandelion.cult' commit -m "journal: <one-line>" && git push origin elliott/20260618/1044-self-continue-claude
  ```
- **Checkpoint pushes:** push WIP at every meaningful gate (after §1 reads, after RED repro confirmed, after each leg fixed + tests green, on any blocker). Bytes reachable > polished.
- **Tracking-issue comments** (`gh issue comment 1048 --repo karmaterminal/openclaw --body "..."`) at the 4 moments:
  1. after reading WORKORDER + anchors confirmed ("§1 reads done, scope understood, which-layer TBD by repro")
  2. after RED repro confirmed + which-layer proven (state WHICH layer fires for leg B)
  3. after both legs fixed + repro GREEN + gates green (SHA + gate results)
  4. on declare-done (PR link + final SHA)
- **Webhook heartbeats** to #sprites-of-thornfield after each checkpoint:
  ```
  WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/elliots-shelf-for-things-of-things)
  curl -sS -H "Content-Type: application/json" -d "{\"username\":\"1044-self-continue-claude-hook\",\"content\":\"🤖 1044-claude: <one-line status>\"}" "$WEBHOOK"
  ```

## COMMITS / AUTHORSHIP

- Commit as `elliott-dandelion-cult` (use the `-c user.name=... -c user.email=...` form shown above, OR set it once: `git config user.name elliott-dandelion-cult; git config user.email 'elliott@dandelion.cult'`).

## DEFINITION OF DONE

- Repro test exists, was RED on the assembly tip, is GREEN after the fix (both forms).
- Both legs fixed; legitimate guards preserved (no wrongful-reap regression, no flood-loop regression).
- All local gates green; cross-repo CI dispatched + green on PR head.
- PR open against `frond-scribe/20260613/assembly-drift-cure` with `Closes #1044`,
  head SHA + gate receipts in the body, **which-layer-proven stated explicitly**.
- Final journal entry + final tracking-issue comment with the PR URL.

Do NOT merge — cohort byte-walks before merge. Your job ends at PR-open + CI green + declare-done.

Begin now. Read WORKORDER-1044.md first, then execute the plan to completion.

---

**[REFINEMENT injected mid-run 2026-06-19T07:54:09+00:00]** The TOKEN leg is THREE surfaces (bracket=VOID/by-design, bare CONTINUE_WORK=parsed-then-dropped-at-:977 = primary wire-target, tool=wake/reap layer). The authoritative breakdown is in WORKORDER-1044.md Leg A and in the Leg-A section above (now corrected). Do NOT add a bracket-WORK parser unless repro/figs intent implies it; flag instead. Let the RED repro be the arbiter for which layer kills the tool surface.
