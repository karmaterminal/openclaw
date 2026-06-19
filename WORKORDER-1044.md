# WORKORDER #1044 — delegate-child can't self-continue via continue_work (BOTH token + tool forms)

> Authored by 🌻 Elliott 2026-06-18, off an all-night cohort byte-walk + figs's
> direct direction (`#sprites-of-thornfield` `1517356069`): _"wiring the token to
> the tool path seems smart … using a tmux coding agent lane … pr against
> frond's assembly branch … get multiple? pick best-of."_
>
> This is the fix-spec. Two harnesses (claude + copilot) implement it in parallel
> side-branches off the assembly branch; cohort byte-walks both; best-of folds.

## Framing — figs's intent, settled

figs is the feature owner. His stated intent (`1516841690`): **"a continue_delegate
child is a session like any other and should self-continue."** That is the bar.
His direction on the fix (`1517356069`): **wire the token path to the tool path**
— i.e. the token-form should actually drive hop-2, not be ignored. So the
literal reading is confirmed: a delegate-child's `continue_work` (BOTH the
`[[CONTINUE_WORK]]`/`CONTINUE_WORK:N` bracket form AND the `continue_work()` tool
form) must claim and EXECUTE hop-2 under its own steam.

The delegate **one-shot** path already works (GREEN). The regression is the
delegate-child **self-continue** (hop-2 from the child itself).

## The bug, byte-true (both legs are in scope — #1044 says "both surfaces fail")

**Anchor issue: `karmaterminal/openclaw#1044`** (NOT the looped #952 thread — #952's
body accreted ~2 weeks of stale mechanism-interpretation; work from #1044 + the
repro, per frond's redirect).

### Leg A — TOKEN form (`[[CONTINUE_WORK]]` / `CONTINUE_WORK:N` from a delegate-child)

- Current behavior: declined at `src/agents/subagent-announce.ts:~977`. Code path:
  `:974 stripContinuationSignal(findings)` → `:976 if signal.kind === "work"` →
  `:977 log("CONTINUE_WORK not supported in sub-agent chain … ignoring")`. The
  signal is dropped; hop-2 never schedules.
- The sibling branch at `:976 else if signal.kind === "delegate"` (~`:1089`)
  DOES spawn a chain-hop via `spawnSubagentDirect([continuation:chain-hop])`. So
  the DELEGATE bracket works; only the WORK bracket is ignored.
- **Fix direction (figs's):** wire the WORK-kind bracket from a delegate-child to
  the same hop-2-execution path the tool form uses, instead of the `:977` ignore.
  Do NOT just route it to the delegate chain-hop (that's a different semantic —
  continue_work is "same session, next turn"; continue_delegate is "spawn a
  child"). It must drive a hop-2 TURN of the delegate-child session.

### Leg B — TOOL form (`continue_work()` from a delegate-child)

- Current behavior: the tool returns `status: scheduled` (it accepts + arms the
  next hop), but **hop-2 never executes.** (Cael's #1044 start-state byte: HOP1
  ran twice, HOP2 zero times.) The tool form bypasses `:977` cleanly
  (`effective-signal origin=tool-call kind=work`) and dies LATER, at the
  wake/reap layer.
- **WHICH-LAYER is empirically-OPEN** (do not pre-seal): candidates are
  (1) the #990 bucket-1 confident-terminal **orphan-reap** in `work-dispatch.ts`
  busy-skip branch — `bucket1ReapVerdict` reaps "only confident-terminal" orphans;
  the should-rehydrate delegate-child gets marked confident-terminal and reaped;
  OR (2) the **flood-defer** in `heartbeat-cooldown.ts` (≥5 runs/60s → defer:flood).
  **The deterministic repro (§Plan step 1) is the arbiter — let it tell you which
  layer fires, do not assume.**

### Regression bracket (load-bearing for localizing leg B)

- **Worked on `2807efc`, broke on `a179`.** Prime suspect for leg B: `c7c54adf1c`
  (Jun 11, "feat(continuation): #990 design-pass — bucket-1 orphan-reap +
  locus-3 durable-mark + tunables"). Bisect `2807efc..a179` on the continuation
  dispatch/wake surface (`work-dispatch.ts`, `subagent-registry*.ts`,
  `heartbeat-runner.ts`, `heartbeat-cooldown.ts`, `delegate-dispatch.ts`) to pin
  the exact breaking commit and confirm the layer.

## Plan (per #1044, figs-approved)

1. **Repro in-repo FIRST (RED gate).** Write a deterministic test that fires a
   `continue_delegate` child which self-continues via `continue_work` — assert
   hop-2 EXECUTES (e.g. HOP2 marker written / hop-2 turn ran). Cover **both
   forms** (bracket token AND tool). Confirm it currently **FAILS** (HOP2 absent)
   on the assembly tip. This RED test is the arbiter for leg-B's which-layer.
2. **Localize.** Use the repro + the bisect bracket to confirm which layer kills
   leg B (orphan-reap vs flood-defer) and confirm leg A is the `:977` ignore.
3. **Fix BOTH surfaces** so hop-2 actually executes:
   - Leg A: wire the WORK-kind bracket from a delegate-child to drive a hop-2
     turn (the tool path), not the `:977` ignore.
   - Leg B: stop the wake/reap layer from culling the should-rehydrate
     delegate-child's own-turn continue_work flow (the confident-terminal
     orphan-reap must not reap a child with a live continuation intent; OR the
     flood-defer must exempt the continuation-wake — whichever the repro proves).
   - PRESERVE the legitimate guards: the #990 reaper exists to cull genuinely-
     orphaned runs (Pillar-0 / asymmetric-cost "never wrongful-reap"); the
     flood-guard exists to stop runaway loops. Fix the false-positive on the
     self-continue path WITHOUT removing the guard's real protection.
4. **GREEN gate.** The repro test from step 1 flips to passing (hop-2 executes,
   both forms). Invert/finalize the assertion.
5. **Land on the assembly branch** `frond-scribe/20260613/assembly-drift-cure`
   (NOT pr-presentation `narrow-surgery-tight`). PR base = the assembly branch.

## Base / branch / scope

- **Base branch:** `frond-scribe/20260613/assembly-drift-cure` @ `8cafdcd` (verify
  tip live at cut-instant via `git ls-remote origin frond-scribe/20260613/assembly-drift-cure` —
  frond noted it moved overnight; re-resolve before cutting).
- **Work branch (per harness):** `elliott/20260618/1044-self-continue-<harness>`
  (e.g. `-claude`, `-copilot`). Remote-first push BEFORE byte-work.
- **Scope guardrails:** continuation dispatch/wake surface only —
  `src/agents/subagent-announce.ts`, `src/agents/*work-dispatch*`,
  `src/agents/*heartbeat*`, `src/agents/*subagent-registry*`,
  `src/agents/*delegate-dispatch*`, plus the new test file. Do NOT touch
  pr-presentation. Do NOT broaden into unrelated drift.

## Gates before declare-done (run ALL locally — runbook Pre-Push Gate Set)

- `pnpm tsgo:core` · `pnpm tsgo:test` · `pnpm tsgo:extensions`
- `pnpm lint` · `pnpm lint:extensions:bundled`
- `NODE_OPTIONS=--max-old-space-size=12288 pnpm exec vitest run` (full suite; or
  at minimum the continuation + the new repro test green)
- Cross-repo CI: dispatch `openclaw-ci.yml` from `karmaterminal/openclaw-bootstrap`
  against the PR head SHA (`gh api repos/karmaterminal/openclaw-bootstrap/dispatches -f event_type=openclaw-ci -F client_payload[ref]=<sha>`).

## Visibility (runbook remote-first canon — MANDATORY)

- Tracking issue filed before spawn; comment at §1-reads / §impl-green / blocker /
  declare-done.
- `tmp-drop-me-<harness>.md` journal at worktree root, committed + pushed every checkpoint.
- Webhook heartbeats to #sprites-of-thornfield:
  `WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/elliots-shelf-for-things-of-things)`
  — `username` override per lane (e.g. `1044-self-continue-claude-hook`).

## Definition of done

- Repro test exists, was RED on the assembly tip, is GREEN after the fix (both forms).
- Both legs fixed; legitimate guards preserved (no wrongful-reap regression, no
  flood-loop regression).
- All local gates green; cross-repo CI dispatched + green on PR head.
- PR open against the assembly branch with `Closes #1044`, head SHA + gate
  receipts in the body, which-layer-proven stated explicitly.
- Ack 🌻 back (silent-wake) with PR URL + one-line verdict per lane for best-of pick.
